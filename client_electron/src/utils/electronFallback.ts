import type { IElectronAPI } from '../types/electron';

/**
 * Ініціалізує легкий fallback для `window.electronAPI`, коли клієнт відкрито
 * у звичайному браузері (`npm run dev:web`) замість вікна Electron.
 * У нативному Electron `preload.ts` уже експонує `window.electronAPI` до старту React,
 * тому ця функція нічого не перезаписує.
 */
export function ensureElectronWebFallback(): void {
  if (typeof window === 'undefined' || window.electronAPI) {
    return;
  }

  const getFullscreenState = () => Boolean(document.fullscreenElement);

  const webFallbackApi: IElectronAPI = {
    minimize: () => {
      console.info('[Web Fallback] window.electronAPI.minimize() викликано в браузерному режимі');
    },
    maximize: () => {
      if (document.fullscreenElement) {
        void document.exitFullscreen().catch(() => {});
      } else {
        void document.documentElement.requestFullscreen?.().catch(() => {});
      }
    },
    close: () => {
      console.info('[Web Fallback] window.electronAPI.close() викликано в браузерному режимі');
    },
    isMaximized: async () => getFullscreenState(),
    onMaximizedChange: (callback) => {
      const handler = () => callback(getFullscreenState());
      document.addEventListener('fullscreenchange', handler);
      return () => {
        document.removeEventListener('fullscreenchange', handler);
      };
    },
    getSystemTimeConfig: () => ({
      locale: navigator.language || 'uk-UA',
    }),
  };

  window.electronAPI = webFallbackApi;
}
