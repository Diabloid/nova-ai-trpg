import type { StateCreator } from 'zustand';
import { ApiError } from '../../api/client';
import { charactersApi } from '../../api/charactersApi';
import { worldsApi } from '../../api/worldsApi';
import type { GameState, WorldSlice } from './types';

export const DEFAULT_WORLD_ID = 'default_dark_fantasy';
const ACTIVE_WORLD_STORAGE_KEY = 'nova_active_world_id';
const LAST_CHAR_BY_WORLD_KEY = 'nova_last_char_id_by_world';

function loadInitialActiveWorldId(): string {
  try {
    if (typeof localStorage !== 'undefined') {
      const saved = localStorage.getItem(ACTIVE_WORLD_STORAGE_KEY);
      if (saved && saved.trim()) {
        return saved.trim();
      }
    }
  } catch {
    // fallback to default world
  }
  return DEFAULT_WORLD_ID;
}

function saveActiveWorldId(worldId: string): void {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(ACTIVE_WORLD_STORAGE_KEY, worldId);
    }
  } catch {
    // ignore storage quota / private mode issues
  }
}

export function readLastCharByWorld(): Record<string, string> {
  try {
    if (typeof localStorage !== 'undefined') {
      const raw = localStorage.getItem(LAST_CHAR_BY_WORLD_KEY);
      if (!raw) return {};
      const parsed: unknown = JSON.parse(raw);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        const result: Record<string, string> = {};
        for (const [k, v] of Object.entries(parsed)) {
          if (typeof v === 'string' && v.trim()) {
            result[k] = v.trim();
          }
        }
        return result;
      }
    }
  } catch {
    // fallback to empty map
  }
  return {};
}

export function writeLastCharForWorld(worldId: string, charId: string): void {
  if (!worldId || !charId) return;
  try {
    if (typeof localStorage !== 'undefined') {
      const current = readLastCharByWorld();
      current[worldId] = charId;
      localStorage.setItem(LAST_CHAR_BY_WORLD_KEY, JSON.stringify(current));
    }
  } catch {
    // ignore storage errors
  }
}

export const createWorldSlice: StateCreator<GameState, [], [], WorldSlice> = (set, get) => ({
  worlds: [],
  activeWorldId: loadInitialActiveWorldId(),
  activeWorldDetail: null,
  isWorldSelectorOpen: false,

  toggleWorldSelector: () =>
    set((state) => ({ isWorldSelectorOpen: !state.isWorldSelectorOpen })),

  setWorldSelectorOpen: (open: boolean) => set({ isWorldSelectorOpen: open }),

  // --- ЗАВАНТАЖЕННЯ СПИСКУ СВІТІВ ТА АКТИВНОГО ПАСПОРТА ---
  loadWorlds: async () => {
    try {
      const worlds = await worldsApi.getWorlds();
      let resolvedWorldId = get().activeWorldId || DEFAULT_WORLD_ID;

      if (worlds.length > 0 && !worlds.some((w) => w.world_id === resolvedWorldId)) {
        const fallbackWorld = worlds.find((w) => w.is_default) || worlds[0];
        resolvedWorldId = fallbackWorld.world_id;
        saveActiveWorldId(resolvedWorldId);
      }

      let activeWorldDetail = null;
      try {
        activeWorldDetail = await worldsApi.getWorld(resolvedWorldId);
      } catch {
        activeWorldDetail = null;
      }

      set({
        worlds,
        activeWorldId: resolvedWorldId,
        activeWorldDetail,
        backendOffline: false,
      });
    } catch (err: unknown) {
      const isNetworkFailure = !(err instanceof ApiError) || err.status === 0;
      if (isNetworkFailure) {
        set({ backendOffline: true });
      }
      const message = err instanceof Error ? err.message : 'Невідома помилка';
      get().setSystemAlert(`Помилка завантаження світів: ${message}`, 'error');
    }
  },

  // --- ПЕРЕМИКАННЯ АКТИВНОГО СВІТУ З ІЗОЛЯЦІЄЮ ГЕРОЇВ ---
  selectWorld: async (worldId: string) => {
    const cleanWorldId = worldId.trim();
    if (!cleanWorldId) return;

    const prevWorldId = get().activeWorldId;
    const prevCharId = get().activeCharacterId;

    if (prevWorldId && prevCharId) {
      writeLastCharForWorld(prevWorldId, prevCharId);
    }

    saveActiveWorldId(cleanWorldId);
    set({
      isLoading: true,
      activeWorldId: cleanWorldId,
      isWorldSelectorOpen: false,
      isHeroSelectorOpen: false,
      isCharacterDrawerOpen: false,
    });

    try {
      const [worldDetail, worldChars] = await Promise.all([
        worldsApi.getWorld(cleanWorldId),
        charactersApi.getCharacters(cleanWorldId),
      ]);

      set({
        activeWorldDetail: worldDetail,
        characters: worldChars,
        backendOffline: false,
      });

      if (worldChars.length === 0) {
        set({
          activeCharacterId: null,
          activeCharacter: null,
          campaigns: [],
          activeCampaignId: null,
          activeCampaign: null,
          playerState: null,
          messages: [],
        });
        return;
      }

      const lastCharMap = readLastCharByWorld();
      const savedCharId = lastCharMap[cleanWorldId];
      const targetChar =
        (savedCharId && worldChars.find((c) => c.char_id === savedCharId)) || worldChars[0];

      writeLastCharForWorld(cleanWorldId, targetChar.char_id);
      await get().selectCharacter(targetChar.char_id);
    } catch (err: unknown) {
      const isNetworkFailure = !(err instanceof ApiError) || err.status === 0;
      if (isNetworkFailure) {
        set({ backendOffline: true });
      }
      const message = err instanceof Error ? err.message : 'Невідома помилка';
      get().setSystemAlert(`Не вдалося переключити світ: ${message}`, 'error');
    } finally {
      set({ isLoading: false });
    }
  },
});
