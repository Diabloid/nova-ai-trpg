import type { StateCreator } from 'zustand';
import type { DrawerTab, SystemAlert, SystemAlertType } from '../../types/game';
import type { GameState, UiSlice } from './types';

let alertTimer: ReturnType<typeof setTimeout> | null = null;
let alertHideTimer: ReturnType<typeof setTimeout> | null = null;

const TOGGLE_COOLDOWN_MS = 200;
let lastDrawerToggleAt = 0;
let lastSidebarToggleAt = 0;

function loadInitialExpandedContainers(): Record<string, boolean> {
  try {
    if (typeof localStorage !== 'undefined') {
      const raw = localStorage.getItem('nova_expanded_containers');
      if (raw) return JSON.parse(raw);
    }
  } catch {
    // fallback
  }
  return {};
}

export const createUiSlice: StateCreator<GameState, [], [], UiSlice> = (set) => ({
  isLoading: false,
  isStreaming: false,
  backendOffline: false,
  statusText: '',

  isCharacterDrawerOpen: false,
  isSidebarOpen: false,
  isHeroSelectorOpen: false,
  activeDrawerTab: 'injuries',
  expandedContainers: loadInitialExpandedContainers(),

  systemAlert: null,
  isSystemAlertVisible: false,

  // --- ЕФЕМЕРНІ СИСТЕМНІ ПОВІДОМЛЕННЯ (5 СЕКУНД + ПЛАВНЕ ЗНИКНЕННЯ) ---
  setSystemAlert: (message: string, type: SystemAlertType = 'info') => {
    const durationMs = 5000;
    if (alertTimer) {
      clearTimeout(alertTimer);
      alertTimer = null;
    }
    if (alertHideTimer) {
      clearTimeout(alertHideTimer);
      alertHideTimer = null;
    }

    const alert: SystemAlert = {
      id: `alert-${Date.now()}`,
      message,
      type,
      expiresAt: Date.now() + durationMs,
    };

    set({ systemAlert: alert, isSystemAlertVisible: true });

    alertTimer = setTimeout(() => {
      alertTimer = null;
      set({ isSystemAlertVisible: false });
      alertHideTimer = setTimeout(() => {
        alertHideTimer = null;
        set({ systemAlert: null });
      }, 300);
    }, durationMs);
  },

  clearSystemAlert: () => {
    if (alertTimer) {
      clearTimeout(alertTimer);
      alertTimer = null;
    }
    if (alertHideTimer) {
      clearTimeout(alertHideTimer);
      alertHideTimer = null;
    }
    set({ isSystemAlertVisible: false });
    alertHideTimer = setTimeout(() => {
      alertHideTimer = null;
      set({ systemAlert: null });
    }, 300);
  },

  setBackendOffline: (offline: boolean) => set({ backendOffline: offline }),

  // --- UI TOGGLES ---
  toggleCharacterDrawer: () => {
    const now = Date.now();
    if (now - lastDrawerToggleAt < TOGGLE_COOLDOWN_MS) {
      return;
    }
    lastDrawerToggleAt = now;
    set((state) => ({ isCharacterDrawerOpen: !state.isCharacterDrawerOpen }));
  },
  toggleSidebar: () => {
    const now = Date.now();
    if (now - lastSidebarToggleAt < TOGGLE_COOLDOWN_MS) {
      return;
    }
    lastSidebarToggleAt = now;
    set((state) => ({ isSidebarOpen: !state.isSidebarOpen }));
  },
  toggleHeroSelector: () => set((state) => ({ isHeroSelectorOpen: !state.isHeroSelectorOpen })),
  setActiveDrawerTab: (tab: DrawerTab) => set({ activeDrawerTab: tab }),

  toggleContainerExpanded: (containerName: string) =>
    set((state) => {
      const nextExpanded = {
        ...state.expandedContainers,
        [containerName]: !state.expandedContainers[containerName],
      };
      try {
        if (typeof localStorage !== 'undefined') {
          localStorage.setItem('nova_expanded_containers', JSON.stringify(nextExpanded));
        }
      } catch {
        // ignore
      }
      return { expandedContainers: nextExpanded };
    }),
});
