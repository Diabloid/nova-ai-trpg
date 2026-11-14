export interface SystemTimeConfig {
  locale?: string;
  hour12?: boolean;
  twoDigitHour?: boolean;
}

export interface IElectronAPI {
  minimize: () => void;
  maximize: () => void;
  close: () => void;
  isMaximized: () => Promise<boolean>;
  onMaximizedChange: (callback: (isMaximized: boolean) => void) => () => void;
  getSystemTimeConfig: () => SystemTimeConfig;
}

declare global {
  interface Window {
    electronAPI?: IElectronAPI;
  }
}
