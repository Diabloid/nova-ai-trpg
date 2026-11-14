import type { StateCreator } from 'zustand';
import type { DrawerTab, SystemAlert } from '../../types/game';
import type { GameState, UiSlice } from './types';

let alertTimer: ReturnType<typeof setTimeout> | null = null;

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
  statusText: '',

  isCharacterDrawerOpen: false,
  isSidebarOpen: false,
  isHeroSelectorOpen: false,
  activeDrawerTab: 'injuries',
  expandedContainers: loadInitialExpandedContainers(),

  systemAlert: null,

  // --- ЕФЕМЕРНІ СИСТЕМНІ ПОВІДОМЛЕННЯ (11 СЕКУНД) ---
  setSystemAlert: (message: string, type: 'info' | 'error' | 'success' = 'info') => {
    if (alertTimer) {
      clearTimeout(alertTimer);
      alertTimer = null;
    }

    const alert: SystemAlert = {
      id: `alert-${Date.now()}`,
      message,
      type,
      expiresAt: Date.now() + 11000,
    };

    set({ systemAlert: alert });

    alertTimer = setTimeout(() => {
      set({ systemAlert: null });
      alertTimer = null;
    }, 11000);
  },

  clearSystemAlert: () => {
    if (alertTimer) {
      clearTimeout(alertTimer);
      alertTimer = null;
    }
    set({ systemAlert: null });
  },

  // --- UI TOGGLES ---
  toggleCharacterDrawer: () =>
    set((state) => ({ isCharacterDrawerOpen: !state.isCharacterDrawerOpen })),
  toggleSidebar: () => set((state) => ({ isSidebarOpen: !state.isSidebarOpen })),
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
