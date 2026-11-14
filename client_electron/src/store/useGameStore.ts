import { create } from 'zustand';
import type {
  CharacterSummary,
  CampaignSummary,
  PlayerState,
  HistoryMessage,
} from '../types/api';
import type { ChatMessage, SystemAlert, DrawerTab } from '../types/game';
import { charactersApi } from '../api/charactersApi';
import { campaignsApi } from '../api/campaignsApi';
import { gameApi } from '../api/gameApi';
import { parseIntents, cleanDisplayAction } from '../utils/intentParser';
import { sanitizeStory } from '../utils/textSanitizer';

export interface GameState {
  // --- Сутності ---
  characters: CharacterSummary[];
  activeCharacterId: string | null;
  activeCharacter: PlayerState | null;

  campaigns: CampaignSummary[];
  activeCampaignId: string | null;
  activeCampaign: CampaignSummary | null;

  playerState: PlayerState | null;
  messages: ChatMessage[];
  userInput: string;

  // --- UI & Стрімінг ---
  isLoading: boolean;
  isStreaming: boolean;
  statusText: string;

  isCharacterDrawerOpen: boolean;
  isSidebarOpen: boolean;
  isHeroSelectorOpen: boolean;
  activeDrawerTab: DrawerTab;
  expandedContainers: Record<string, boolean>;

  systemAlert: SystemAlert | null;

  // --- Actions ---
  loadCharacters: () => Promise<void>;
  selectCharacter: (charId: string) => Promise<void>;
  updateCharacter: (charId: string, data: PlayerState) => Promise<void>;
  loadCampaigns: (charId: string, autoSelectFirst?: boolean) => Promise<void>;
  selectCampaign: (campaignId: string) => Promise<void>;
  createCampaign: (title?: string) => Promise<CampaignSummary | null>;
  togglePinCampaign: (campaignId: string) => Promise<void>;
  deleteCampaign: (campaignId: string) => Promise<void>;
  deleteCharacter: (charId: string) => Promise<void>;

  sendPlayerAction: (rawText: string) => Promise<void>;
  rollbackLastTurn: () => Promise<void>;

  setSystemAlert: (message: string, type?: 'info' | 'error' | 'success') => void;
  clearSystemAlert: () => void;

  toggleCharacterDrawer: () => void;
  toggleSidebar: () => void;
  toggleHeroSelector: () => void;
  setActiveDrawerTab: (tab: DrawerTab) => void;
  toggleContainerExpanded: (containerName: string) => void;
  setUserInput: (text: string) => void;
}

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

export const useGameStore = create<GameState>((set, get) => ({
  characters: [],
  activeCharacterId: null,
  activeCharacter: null,

  campaigns: [],
  activeCampaignId: null,
  activeCampaign: null,

  playerState: null,
  messages: [],
  userInput: '',

  isLoading: false,
  isStreaming: false,
  statusText: '',

  isCharacterDrawerOpen: false,
  isSidebarOpen: false,
  isHeroSelectorOpen: false,
  activeDrawerTab: 'injuries',
  expandedContainers: loadInitialExpandedContainers(),

  systemAlert: null,


  // --- ЗАВАНТАЖЕННЯ ПЕРСОНАЖІВ ---
  loadCharacters: async () => {
    try {
      set({ isLoading: true });
      const chars = await charactersApi.getCharacters();
      set({ characters: chars });

      // Якщо є збережений останній ID героя в localStorage або беремо першого
      const { activeCharacterId } = get();
      const lastCharId = typeof localStorage !== 'undefined' ? localStorage.getItem('nova_last_char_id') : null;
      const targetChar =
        (lastCharId && chars.find((c) => c.char_id === lastCharId)) ||
        chars[0];

      if (chars.length > 0 && (!activeCharacterId || !chars.some((c) => c.char_id === activeCharacterId))) {
        await get().selectCharacter(targetChar.char_id);
      }
    } catch (err: any) {
      get().setSystemAlert(`Помилка завантаження персонажів: ${err.message}`, 'error');
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

      const lastCampId = typeof localStorage !== 'undefined' ? localStorage.getItem('nova_last_camp_id') : null;
      const targetCamp =
        (lastCampId && sorted.find((c) => c.campaign_id === lastCampId)) ||
        sorted[0];

      if (autoSelectFirst && sorted.length > 0) {
        await get().selectCampaign(targetCamp.campaign_id);
      } else if (sorted.length === 0) {
        set({
          activeCampaignId: null,
          activeCampaign: null,
          playerState: null,
          messages: [],
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

      // Мапимо HistoryMessage в UI ChatMessage (ігноруємо технічні системні логи за правилом Фази 3.2)
      const formattedMessages: ChatMessage[] = history
        .filter((msg: HistoryMessage) => msg.role.toLowerCase() !== 'system')
        .map((msg: HistoryMessage, index: number, arr: HistoryMessage[]) => {
          const isPlayer = msg.role.toLowerCase() === 'player';
          const isLastNarrator = !isPlayer && index === arr.length - 1 && arr.length > 1;

          let timeStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
          if (msg.timestamp) {
            try {
              timeStr = new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            } catch {
              // fallback to current time
            }
          }

          return {
            id: `msg-${index}-${Date.now()}`,
            sender: isPlayer ? 'Ти:' : 'Оповідач:',
            text: isPlayer ? cleanDisplayAction(msg.text) : sanitizeStory(msg.text),
            senderColor: isPlayer ? '#60A5FA' : '#EAB308',
            timeText: timeStr,
            isPlayer,
            canRollback: isLastNarrator,
          };
        });

      set({
        messages: formattedMessages,
        playerState: state,
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
      get().setSystemAlert('Спочатку оберіть або створіть персонажа', 'error');
      return null;
    }

    try {
      set({ isLoading: true });
      const newCamp = await campaignsApi.createCampaign(activeCharacterId, title);
      await get().loadCampaigns(activeCharacterId, false);
      await get().selectCampaign(newCamp.campaign_id);
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

      await get().loadCharacters();
    } catch (err: any) {
      get().setSystemAlert(`Не вдалося видалити персонажа: ${err.message}`, 'error');
    } finally {
      set({ isLoading: false });
    }
  },

  // --- ХІД ГРАВЦЯ (SSE STREAMING) ---
  sendPlayerAction: async (rawText: string) => {
    const text = rawText.trim();
    const { activeCampaignId, isStreaming, isLoading } = get();
    if (!text || !activeCampaignId || isStreaming || isLoading) return;

    const intents = parseIntents(text);
    const cleanUserText = cleanDisplayAction(text);
    const timeNow = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    // 1. Оптимістично додаємо репліку гравця
    const playerMsg: ChatMessage = {
      id: `player-${Date.now()}`,
      sender: 'Ти:',
      text: cleanUserText,
      senderColor: '#60A5FA',
      timeText: timeNow,
      isPlayer: true,
    };

    // 2. Створюємо пусте стрімінгове повідомлення Оповідача
    const narratorMsgId = `narrator-${Date.now()}`;
    const placeholderNarratorMsg: ChatMessage = {
      id: narratorMsgId,
      sender: 'Оповідач:',
      text: '',
      senderColor: '#EAB308',
      timeText: timeNow,
      isPlayer: false,
      isStreaming: true,
      canRollback: false,
    };

    // Скидаємо відкат на старих повідомленнях
    set((state) => ({
      userInput: '',
      isStreaming: true,
      statusText: 'Розмірковує над дією...',
      messages: [
        ...state.messages.map((m) => ({ ...m, canRollback: false })),
        playerMsg,
        placeholderNarratorMsg,
      ],
    }));

    try {
      let currentStory = '';

      const result = await gameApi.streamAction(
        {
          raw_text: text,
          intents,
          session_id: activeCampaignId,
        },
        {
          onToken: (chunk) => {
            currentStory += chunk;
            set((state) => ({
              messages: state.messages.map((m) =>
                m.id === narratorMsgId ? { ...m, text: currentStory } : m
              ),
            }));
          },
          onStatusChange: (status) => {
            set({ statusText: status });
          },
          onStateUpdate: (newState) => {
            set({ playerState: newState });
          },
          onError: (errMsg) => {
            get().setSystemAlert(errMsg, 'error');
          },
        }
      );

      // Фіналізація стрімінгу
      set((state) => ({
        isStreaming: false,
        statusText: '',
        playerState: result.playerState || state.playerState,
        messages: state.messages.map((m) =>
          m.id === narratorMsgId
            ? {
                ...m,
                text: sanitizeStory(result.story || m.text),
                isStreaming: false,
                canRollback: true,
              }
            : m
        ),
      }));
    } catch (err: any) {
      get().setSystemAlert(`Помилка ходу: ${err.message}`, 'error');

      // Видаляємо пусте стрімінгове повідомлення Оповідача при критичній помилці
      set((state) => ({
        isStreaming: false,
        statusText: '',
        messages: state.messages.filter((m) => m.id !== narratorMsgId || m.text.length > 0),
      }));
    }
  },

  // --- ВІДКАТ ХОДУ (UNDO) ---
  rollbackLastTurn: async () => {
    const { activeCampaignId, isStreaming, isLoading } = get();
    if (!activeCampaignId || isStreaming || isLoading) return;

    try {
      set({ isLoading: true });
      const res = await campaignsApi.rollbackCampaign(activeCampaignId);

      // Повертаємо попередній ввід гравця в інпут
      set({
        userInput: res.previous_user_input,
        playerState: res.current_state,
      });

      // Перезавантажуємо історію кампанії для чистоти логу
      await get().selectCampaign(activeCampaignId);
      get().setSystemAlert('Хід успішно відкочено на 1 крок назад', 'info');
    } catch (err: any) {
      get().setSystemAlert(`Помилка відкату: ${err.message}`, 'error');
    } finally {
      set({ isLoading: false });
    }
  },

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
  toggleCharacterDrawer: () => set((state) => ({ isCharacterDrawerOpen: !state.isCharacterDrawerOpen })),
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

  setUserInput: (text: string) => set({ userInput: text }),

  // --- РЕДАГУВАННЯ ПЕРСОНАЖА ---
  updateCharacter: async (charId: string, data: PlayerState) => {
    try {
      set({ isLoading: true });
      const updated = await charactersApi.updateCharacter(charId, data);
      set((state) => ({
        characters: state.characters.map((c) =>
          c.char_id === charId
            ? {
                ...c,
                name: data.meta?.name || c.name,
                background: data.meta?.background || c.background,
                appearance: data.meta?.appearance || c.appearance,
              }
            : c
        ),
        activeCharacter: state.activeCharacterId === charId ? updated : state.activeCharacter,
      }));
      get().setSystemAlert('Дані персонажа успішно оновлено', 'success');
    } catch (err: any) {
      get().setSystemAlert(`Помилка оновлення персонажа: ${err.message}`, 'error');
    } finally {
      set({ isLoading: false });
    }
  },

}));
