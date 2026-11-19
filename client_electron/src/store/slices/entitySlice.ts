import type { StateCreator } from 'zustand';
import type { HistoryMessage, PlayerState } from '../../types/api';
import type { ChatMessage } from '../../types/game';
import { ApiError } from '../../api/client';
import { charactersApi } from '../../api/charactersApi';
import { campaignsApi } from '../../api/campaignsApi';
import { cleanDisplayAction } from '../../utils/intentParser';
import { buildDisplayTokens } from '../../utils/novaSyntax';
import { sanitizeStory } from '../../utils/textSanitizer';
import { formatSystemTime } from '../../utils/formatTime';
import {
  DEFAULT_WORLD_ID,
  readLastCharByWorld,
  writeLastCharForWorld,
} from './worldSlice';
import type { EntitySlice, GameState } from './types';

export const createEntitySlice: StateCreator<GameState, [], [], EntitySlice> = (set, get) => ({
  characters: [],
  activeCharacterId: null,
  activeCharacter: null,

  campaigns: [],
  activeCampaignId: null,
  activeCampaign: null,

  // --- ЗАВАНТАЖЕННЯ ПЕРСОНАЖІВ ---
  loadCharacters: async () => {
    try {
      set({ isLoading: true });
      const activeWorldId = get().activeWorldId || DEFAULT_WORLD_ID;
      const chars = await charactersApi.getCharacters(activeWorldId);
      set({ characters: chars, backendOffline: false });

      if (chars.length === 0) {
        set({
          activeCharacterId: null,
          activeCharacter: null,
          campaigns: [],
          activeCampaignId: null,
          activeCampaign: null,
          playerState: null,
          messages: [],
          isCharacterDrawerOpen: false,
        });
        return;
      }

      // Якщо є збережений останній ID героя для поточного світу в localStorage або беремо першого
      const { activeCharacterId } = get();
      const lastCharByWorld = readLastCharByWorld();
      const legacyLastCharId =
        typeof localStorage !== 'undefined' ? localStorage.getItem('nova_last_char_id') : null;
      const lastCharId = lastCharByWorld[activeWorldId] || legacyLastCharId;
      const targetChar = (lastCharId && chars.find((c) => c.char_id === lastCharId)) || chars[0];

      if (!activeCharacterId || !chars.some((c) => c.char_id === activeCharacterId)) {
        await get().selectCharacter(targetChar.char_id);
      }
    } catch (err: unknown) {
      const isNetworkFailure = !(err instanceof ApiError) || err.status === 0;
      if (isNetworkFailure) {
        set({ backendOffline: true });
      }
      const message = err instanceof Error ? err.message : 'Невідома помилка';
      get().setSystemAlert(`Помилка завантаження персонажів: ${message}`, 'error');
    } finally {
      set({ isLoading: false });
    }
  },

  // --- ВИБІР ПЕРСОНАЖА ---
  selectCharacter: async (charId: string) => {
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem('nova_last_char_id', charId);
      }
      writeLastCharForWorld(get().activeWorldId || DEFAULT_WORLD_ID, charId);
      set({ isLoading: true, activeCharacterId: charId, isHeroSelectorOpen: false });
      const [charDetails] = await Promise.all([
        charactersApi.getCharacter(charId),
        get().loadCampaigns(charId, true),
      ]);
      set({ activeCharacter: charDetails });
    } catch (err: any) {
      get().setSystemAlert(`Не вдалося завантажити лист персонажа: ${err.message}`, 'error');
    } finally {
      set({ isLoading: false });
    }
  },

  // --- ЗАВАНТАЖЕННЯ КАМПАНІЙ ---
  loadCampaigns: async (charId: string, autoSelectFirst = true) => {
    try {
      const camps = await campaignsApi.getCampaigns(charId);
      // Сортування: закріплені вгорі, далі за датою last_played
      const sorted = [...camps].sort((a, b) => {
        if (a.is_pinned !== b.is_pinned) return a.is_pinned ? -1 : 1;
        return new Date(b.last_played).getTime() - new Date(a.last_played).getTime();
      });

      set({ campaigns: sorted });

      const lastCampId =
        typeof localStorage !== 'undefined' ? localStorage.getItem('nova_last_camp_id') : null;
      const targetCamp =
        (lastCampId && sorted.find((c) => c.campaign_id === lastCampId)) || sorted[0];

      if (autoSelectFirst && sorted.length > 0) {
        await get().selectCampaign(targetCamp.campaign_id);
      } else if (sorted.length === 0) {
        set({
          activeCampaignId: null,
          activeCampaign: null,
          playerState: null,
          messages: [],
          activeCampaignRollbackDepth: 0,
        });
      }
    } catch (err: any) {
      get().setSystemAlert(`Помилка завантаження кампаній: ${err.message}`, 'error');
    }
  },

  // --- ВИБІР КАМПАНІЇ ---
  selectCampaign: async (campaignId: string) => {
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem('nova_last_camp_id', campaignId);
      }
      set({ isLoading: true, activeCampaignId: campaignId });
      const currentCamp = get().campaigns.find((c) => c.campaign_id === campaignId) || null;
      set({ activeCampaign: currentCamp });

      // Завантажуємо паралельно історію та живий стан
      const [history, state] = await Promise.all([
        campaignsApi.getCampaignHistory(campaignId),
        campaignsApi.getCampaignState(campaignId),
      ]);

      // Мапимо HistoryMessage в UI ChatMessage (ігноруємо технічні системні логи)
      const nonSystemHistory = history.filter(
        (msg: HistoryMessage) => msg.role.toLowerCase() !== 'system'
      );
      const resolvedRollbackDepth =
        typeof currentCamp?.rollback_depth === 'number'
          ? Math.max(0, currentCamp.rollback_depth)
          : nonSystemHistory.length > 1
            ? 1
            : 0;

      const formattedMessages: ChatMessage[] = nonSystemHistory.map(
        (msg: HistoryMessage, index: number, arr: HistoryMessage[]) => {
          const isPlayer = msg.role.toLowerCase() === 'player';
          const isLastNarrator =
            !isPlayer &&
            index === arr.length - 1 &&
            index > 0 &&
            resolvedRollbackDepth > 0;

          let timeStr = formatSystemTime();
          if (msg.timestamp) {
            try {
              timeStr = formatSystemTime(msg.timestamp);
            } catch {
              // fallback to current time
            }
          }

          return {
            id: `msg-${index}-${Date.now()}`,
            sender: isPlayer ? 'Ти:' : 'Оповідач:',
            tokens: isPlayer ? buildDisplayTokens(msg.text) : undefined,
            text: isPlayer ? cleanDisplayAction(msg.text) : sanitizeStory(msg.text),
            senderColor: isPlayer ? '#60A5FA' : '#EAB308',
            timeText: timeStr,
            isPlayer,
            canRollback: isLastNarrator,
          };
        }
      );

      set({
        messages: formattedMessages,
        playerState: state,
        activeCampaignRollbackDepth: resolvedRollbackDepth,
      });
    } catch (err: any) {
      get().setSystemAlert(`Помилка відкриття кампанії: ${err.message}`, 'error');
    } finally {
      set({ isLoading: false });
    }
  },

  // --- СТВОРЕННЯ КАМПАНІЇ ---
  createCampaign: async (title?: string) => {
    const { activeCharacterId } = get();
    if (!activeCharacterId) {
      get().setSystemAlert('Спочатку оберіть або створіть персонажа', 'warning');
      return null;
    }

    try {
      set({ isLoading: true });
      const newCamp = await campaignsApi.createCampaign(activeCharacterId, title);
      await get().loadCampaigns(activeCharacterId, false);
      await get().selectCampaign(newCamp.campaign_id);
      if (typeof newCamp.rollback_depth !== 'number') {
        set({ activeCampaignRollbackDepth: 0 });
      }
      return newCamp;
    } catch (err: any) {
      get().setSystemAlert(`Не вдалося створити кампанію: ${err.message}`, 'error');
      return null;
    } finally {
      set({ isLoading: false });
    }
  },

  // --- ЗАКРІПЛЕННЯ КАМПАНІЇ ---
  togglePinCampaign: async (campaignId: string) => {
    const camp = get().campaigns.find((c) => c.campaign_id === campaignId);
    if (!camp) return;

    try {
      await campaignsApi.pinCampaign(campaignId, !camp.is_pinned);
      const { activeCharacterId } = get();
      if (activeCharacterId) {
        await get().loadCampaigns(activeCharacterId, false);
      }
    } catch (err: any) {
      get().setSystemAlert(`Помилка закріплення кампанії: ${err.message}`, 'error');
    }
  },

  // --- ВИДАЛЕННЯ КАМПАНІЇ ---
  deleteCampaign: async (campaignId: string) => {
    try {
      set({ isLoading: true });
      await campaignsApi.deleteCampaign(campaignId);
      const { activeCharacterId, activeCampaignId } = get();

      if (activeCharacterId) {
        const autoSelect = activeCampaignId === campaignId;
        await get().loadCampaigns(activeCharacterId, autoSelect);
      }
    } catch (err: any) {
      get().setSystemAlert(`Не вдалося видалити кампанію: ${err.message}`, 'error');
    } finally {
      set({ isLoading: false });
    }
  },

  // --- ВИДАЛЕННЯ ПЕРСОНАЖА ---
  deleteCharacter: async (charId: string) => {
    try {
      set({ isLoading: true });
      await charactersApi.deleteCharacter(charId);
      set((state) => ({
        characters: state.characters.filter((c) => c.char_id !== charId),
        activeCharacterId: state.activeCharacterId === charId ? null : state.activeCharacterId,
        activeCharacter: state.activeCharacterId === charId ? null : state.activeCharacter,
      }));

      await Promise.all([get().loadCharacters(), get().loadWorlds()]);
    } catch (err: any) {
      get().setSystemAlert(`Не вдалося видалити персонажа: ${err.message}`, 'error');
    } finally {
      set({ isLoading: false });
    }
  },

  // --- РЕДАГУВАННЯ ПЕРСОНАЖА (ЗАГОТОВКА) ---
  updateCharacter: async (charId: string, data: PlayerState) => {
    try {
      set({ isLoading: true });
      const updated = await charactersApi.updateCharacter(charId, data);
      const nextMeta = updated?.meta ?? data.meta;
      const nextAvatar =
        typeof nextMeta?.avatar === 'string' && nextMeta.avatar.trim()
          ? nextMeta.avatar.trim()
          : undefined;
      const nextUpdatedAt =
        typeof updated?.updated_at === 'string'
          ? updated.updated_at
          : new Date().toISOString();

      set((state) => ({
        characters: state.characters.map((c) =>
          c.char_id === charId
            ? {
                ...c,
                name: nextMeta?.name || c.name,
                background: nextMeta?.background ?? c.background,
                appearance: nextMeta?.appearance ?? c.appearance,
                avatar: nextAvatar,
                updated_at: nextUpdatedAt,
              }
            : c
        ),
        activeCharacter: state.activeCharacterId === charId ? updated : state.activeCharacter,
      }));
      get().setSystemAlert('Дані персонажа успішно оновлено', 'success');
    } catch (err: any) {
      get().setSystemAlert(`Помилка оновлення персонажа: ${err.message}`, 'error');
      throw err;
    } finally {
      set({ isLoading: false });
    }
  },

  // --- РУЧНЕ ОНОВЛЕННЯ ЖИВОГО СТАНУ КАМПАНІЇ ---
  updateCampaignState: async (campaignId: string, data: PlayerState) => {
    try {
      set({ isLoading: true });
      const updated = await campaignsApi.updateCampaignState(campaignId, data);
      const nextLocation =
        (typeof updated?.meta?.location === 'string' && updated.meta.location.trim()) ||
        (typeof data.meta?.location === 'string' && data.meta.location.trim()) ||
        '';
      const nowIso = new Date().toISOString();

      set((state) => ({
        playerState: state.activeCampaignId === campaignId ? updated : state.playerState,
        campaigns: state.campaigns.map((camp) =>
          camp.campaign_id === campaignId
            ? {
                ...camp,
                current_location: nextLocation || camp.current_location,
                last_played: nowIso,
              }
            : camp
        ),
        activeCampaign:
          state.activeCampaign?.campaign_id === campaignId
            ? {
                ...state.activeCampaign,
                current_location: nextLocation || state.activeCampaign.current_location,
                last_played: nowIso,
              }
            : state.activeCampaign,
      }));
      get().setSystemAlert('Живий лист персонажа оновлено', 'success');
    } catch (err: any) {
      get().setSystemAlert(`Помилка оновлення живого листа: ${err.message}`, 'error');
      throw err;
    } finally {
      set({ isLoading: false });
    }
  },
});
