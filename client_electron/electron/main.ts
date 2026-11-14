import { app, BrowserWindow, ipcMain } from 'electron';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';

interface SystemTimeConfig {
  locale?: string;
  hour12?: boolean;
  twoDigitHour?: boolean;
}

let cachedSystemTimeConfig: SystemTimeConfig = {};

function detectWindowsTimeConfig(): Promise<SystemTimeConfig> {
  const fallbackLocale =
    typeof app.getSystemLocale === 'function' ? app.getSystemLocale() : app.getLocale();

  if (process.platform !== 'win32') {
    return Promise.resolve({ locale: fallbackLocale || undefined });
  }

  return new Promise((resolve) => {
    execFile(
      'reg',
      ['query', 'HKCU\\Control Panel\\International'],
      { timeout: 1500 },
      (err, stdout) => {
        if (err || !stdout) {
          resolve({ locale: fallbackLocale || undefined });
          return;
        }

        const getValue = (name: string): string | undefined => {
          const match = new RegExp(`^\\s*${name}\\s+REG_\\w+\\s+(.+)$`, 'mi').exec(stdout);
          return match ? match[1].trim() : undefined;
        };

        const localeName = getValue('LocaleName');
        const shortTime = getValue('sShortTime');
        const iTime = getValue('iTime');
        const iTLZero = getValue('iTLZero');

        let hour12: boolean | undefined;
        if (shortTime) {
          if (shortTime.includes('H')) {
            hour12 = false;
          } else if (shortTime.includes('h')) {
            hour12 = true;
          }
        }
        if (hour12 === undefined && (iTime === '0' || iTime === '1')) {
          hour12 = iTime === '0';
        }

        const twoDigitHour = shortTime
          ? /(?:HH|hh)/.test(shortTime)
          : iTLZero === '1'
            ? true
            : iTLZero === '0'
              ? false
              : undefined;

        resolve({
          locale: localeName || fallbackLocale || undefined,
          hour12,
          twoDigitHour,
        });
      }
    );
  });
}

async function refreshSystemTimeConfig() {
  try {
    cachedSystemTimeConfig = await detectWindowsTimeConfig();
  } catch {
    cachedSystemTimeConfig = {};
  }
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// The built directory structure
//
// ├─┬ dist-electron
// │ ├── main.js
// │ └── preload.js
// ├─┬ dist
// │ └── index.html

process.env.APP_ROOT = path.join(__dirname, '..');

export const VITE_DEV_SERVER_URL = process.env['VITE_DEV_SERVER_URL'];
export const MAIN_DIST = path.join(process.env.APP_ROOT, 'dist-electron');
export const RENDERER_DIST = path.join(process.env.APP_ROOT, 'dist');

process.env.VITE_PUBLIC = VITE_DEV_SERVER_URL ? path.join(process.env.APP_ROOT, 'public') : RENDERER_DIST;

let win: BrowserWindow | null = null;

function createWindow() {
  win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 1024,
    minHeight: 640,
    frame: false,
    backgroundColor: '#121212',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      webSecurity: false,
    },
  });

  // Track maximize state and send to renderer if needed
  win.on('maximize', () => {
    win?.webContents.send('window-maximized-change', true);
  });

  win.on('unmaximize', () => {
    win?.webContents.send('window-maximized-change', false);
  });

  if (VITE_DEV_SERVER_URL) {
    win.loadURL(VITE_DEV_SERVER_URL);
  } else {
    win.loadFile(path.join(RENDERER_DIST, 'index.html'));
  }
}

// Setup IPC window controls
ipcMain.on('window-minimize', () => {
  win?.minimize();
});

ipcMain.on('window-maximize', () => {
  if (win?.isMaximized()) {
    win.unmaximize();
  } else {
    win?.maximize();
  }
});

ipcMain.on('window-close', () => {
  win?.close();
});

ipcMain.handle('is-maximized', () => {
  return win?.isMaximized() ?? false;
});

ipcMain.on('get-system-time-config-sync', (event) => {
  event.returnValue = cachedSystemTimeConfig;
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
    win = null;
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

app.whenReady().then(async () => {
  await refreshSystemTimeConfig();
  createWindow();
});
