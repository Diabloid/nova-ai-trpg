import { create } from 'zustand';
import type {
  CharacterSummary,
  CampaignSummary,
  PlayerState,
  HistoryMessage,
} from '../types/api';
import type { ChatMessage, SystemAlert, DrawerTab, CharacterWizardDraft } from '../types/game';
import { charactersApi } from '../api/charactersApi';
import { campaignsApi } from '../api/campaignsApi';
import { gameApi } from '../api/gameApi';
import { parseIntents, cleanDisplayAction } from '../utils/intentParser';

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

  // --- Візард Творця Долі ---
  isWizardOpen: boolean;
  wizardDraft: CharacterWizardDraft;
  wizardMessages: ChatMessage[];
  isWizardTyping: boolean;
  wizardStatusText: string;
  isSyncingDraft: boolean;
  wizardInput: string;
  isWizardAppearanceDetailsExpanded: boolean;

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

  // --- Wizard Actions ---
  openWizard: () => void;
  closeWizard: () => void;
  setWizardDraft: (draft: Partial<CharacterWizardDraft>) => void;
  toggleWizardAppearanceDetails: () => void;
  setWizardInput: (text: string) => void;
  sendWizardMessage: (userText: string) => Promise<void>;
  syncWizardDraft: () => Promise<void>;
  finalizeWizard: () => Promise<void>;
}

const DEFAULT_WIZARD_DRAFT: CharacterWizardDraft = {
  charName: '',
  charTitles: '',
  charAge: '',
  charBackground: '',
  charAppearance: '',
  charLocation: '',
  physique: '',
  height: '',
  eyes: '',
  hair: '',
  raceTraits: '',
  biography: '',
  overallHealth: '',
  injuries: [],
  abilities: [],
  equipment: [],
  customBlocks: {},
  rawState: null,
};

let alertTimer: ReturnType<typeof setTimeout> | null = null;
let wizardAbortController: AbortController | null = null;

function buildDraftPlayerState(draft: CharacterWizardDraft): PlayerState {
  const base: PlayerState = draft.rawState ? JSON.parse(JSON.stringify(draft.rawState)) : {
    meta: { name: '' },
    anatomy_and_health: { overall_state: '', injuries: [] },
    storage_and_equipment: { worn: [], containers: {} },
    abilities: [],
  };

  return {
    ...base,
    meta: {
      ...base.meta,
      name: draft.charName,
      titles: draft.charTitles,
      age: draft.charAge,
      background: draft.charBackground,
      appearance: draft.charAppearance,
      location: draft.charLocation || 'Невідомий ліс',
      biography: draft.biography,
      appearance_details: {
        ...(base.meta?.appearance_details || {}),
        physique: draft.physique,
        height: draft.height,
        eyes: draft.eyes,
        hair: draft.hair,
        race_traits: draft.raceTraits,
      },
    },
    anatomy_and_health: {
      ...base.anatomy_and_health,
      overall_state: draft.overallHealth || 'Повний сил',
      injuries: draft.injuries || [],
    },
    abilities: draft.abilities || [],
    storage_and_equipment: {
      ...base.storage_and_equipment,
      worn: draft.equipment || [],
      containers: base.storage_and_equipment?.containers || {},
    },
    custom_blocks: draft.customBlocks || base.custom_blocks || {},
  };
}

function updateDraftFromPlayerState(prev: CharacterWizardDraft, state: PlayerState): CharacterWizardDraft {
  const meta = state.meta || ({} as any);
  const appDetails = meta.appearance_details || {};
  const health = state.anatomy_and_health || ({} as any);
  const storage = state.storage_and_equipment || ({} as any);

  const eqList: any[] = [];
  if (storage.worn && Array.isArray(storage.worn)) {
    eqList.push(...storage.worn);
  }
  if (storage.containers && typeof storage.containers === 'object') {
    Object.values(storage.containers).forEach((items) => {
      if (Array.isArray(items)) {
        eqList.push(...items);
      }
    });
  }

  return {
    ...prev,
    rawState: state,
    charName: meta.name || prev.charName,
    charTitles: meta.titles ? (Array.isArray(meta.titles) ? meta.titles.join(', ') : String(meta.titles)) : prev.charTitles,
    charAge: meta.age !== undefined && meta.age !== null ? String(meta.age) : prev.charAge,
    charBackground: meta.background || prev.charBackground,
    charAppearance: meta.appearance || prev.charAppearance,
    charLocation: meta.location || prev.charLocation,
    biography: meta.biography || prev.biography,
    physique: appDetails.physique || prev.physique,
    height: appDetails.height || prev.height,
    eyes: appDetails.eyes || prev.eyes,
    hair: appDetails.hair || prev.hair,
    raceTraits: appDetails.race_traits || prev.raceTraits,
    overallHealth: health.overall_state || prev.overallHealth,
    injuries: Array.isArray(health.injuries) ? health.injuries : prev.injuries,
    abilities: Array.isArray(state.abilities) ? state.abilities : prev.abilities,
    equipment: eqList.length > 0 ? eqList : prev.equipment,
    customBlocks: state.custom_blocks || prev.customBlocks,
  };
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
  expandedContainers: {},

  systemAlert: null,

  // --- ВІЗАРД ТВООРЦЯ ДОЛІ СТАН ---
  isWizardOpen: false,
  wizardDraft: { ...DEFAULT_WIZARD_DRAFT },
  wizardMessages: [],
  isWizardTyping: false,
  wizardStatusText: 'Творець Долі слухає...',
  isSyncingDraft: false,
  wizardInput: '',
  isWizardAppearanceDetailsExpanded: false,

  // --- ЗАВАНТАЖЕННЯ ПЕРСОНАЖІВ ---
  loadCharacters: async () => {
    try {
      set({ isLoading: true });
      const chars = await charactersApi.getCharacters();
      set({ characters: chars });

      // Якщо є персонажі, але жоден не обраний — обираємо першого
      const { activeCharacterId } = get();
      if (chars.length > 0 && (!activeCharacterId || !chars.some((c) => c.char_id === activeCharacterId))) {
        await get().selectCharacter(chars[0].char_id);
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

      if (autoSelectFirst && sorted.length > 0) {
        await get().selectCampaign(sorted[0].campaign_id);
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
            text: isPlayer ? cleanDisplayAction(msg.text) : msg.text,
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
                text: result.story || m.text,
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
    set((state) => ({
      expandedContainers: {
        ...state.expandedContainers,
        [containerName]: !state.expandedContainers[containerName],
      },
    })),

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

  // --- ВІЗАРД: ВІДКРИТТЯ / ЗАКРИТТЯ ---
  openWizard: () => {
    if (wizardAbortController) {
      wizardAbortController.abort();
      wizardAbortController = null;
    }
    const starterGreeting: ChatMessage = {
      id: `wizard-starter-${Date.now()}`,
      sender: 'Творець Долі:',
      text: "Вітаю у чертогах буття, Мандрівнику. Я — Творець Долі. Розкажи, ким ти бачиш свого героя? Яке його ім'я, фах або ремесло? Які таємниці чи випробування несе його минуле?",
      senderColor: '#C084FC',
      timeText: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      isPlayer: false,
    };
    set({
      isWizardOpen: true,
      isSidebarOpen: false,
      isCharacterDrawerOpen: false,
      wizardDraft: { ...DEFAULT_WIZARD_DRAFT },
      wizardMessages: [starterGreeting],
      isWizardTyping: false,
      wizardStatusText: 'Творець Долі слухає...',
      isSyncingDraft: false,
      wizardInput: '',
      isWizardAppearanceDetailsExpanded: false,
    });
  },

  closeWizard: () => {
    if (wizardAbortController) {
      wizardAbortController.abort();
      wizardAbortController = null;
    }
    set({ isWizardOpen: false, isWizardTyping: false });
  },

  setWizardDraft: (partial: Partial<CharacterWizardDraft>) => {
    set((state) => ({
      wizardDraft: { ...state.wizardDraft, ...partial },
    }));
  },

  toggleWizardAppearanceDetails: () => {
    set((state) => ({
      isWizardAppearanceDetailsExpanded: !state.isWizardAppearanceDetailsExpanded,
    }));
  },

  setWizardInput: (text: string) => set({ wizardInput: text }),

  // --- ВІЗАРД: ДІАЛОГ З ШІ ---
  sendWizardMessage: async (rawText: string) => {
    const text = rawText.trim();
    if (!text || get().isWizardTyping) return;

    const cleanUserText = text.replace(/\*\*/g, '');
    const timeNow = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    const userMsg: ChatMessage = {
      id: `wizard-user-${Date.now()}`,
      sender: 'Ти:',
      text: cleanUserText,
      senderColor: '#60A5FA',
      timeText: timeNow,
      isPlayer: true,
    };

    set((state) => ({
      wizardInput: '',
      isWizardTyping: true,
      wizardStatusText: 'Творець Долі розмірковує...',
      wizardMessages: [...state.wizardMessages, userMsg],
    }));

    if (wizardAbortController) {
      wizardAbortController.abort();
    }
    wizardAbortController = new AbortController();

    try {
      const history = get().wizardMessages
        .filter((m) => !m.isSystem)
        .map((m) => ({
          role: m.sender.includes('Творець Долі') ? ('narrator' as const) : ('player' as const),
          content: m.text,
        }));

      const resp = await charactersApi.characterDialog(
        {
          message: text,
          history,
          include_draft: true,
        },
        { signal: wizardAbortController.signal }
      );

      let reply = resp?.reply || "Цікавий образ. Нитки долі починають сплітатися. Чи має твій персонаж особливі прикмети, спорядження або магічний дар, про який варто знати?";
      reply = reply.replace(/\*\*/g, '');

      const aiMsg: ChatMessage = {
        id: `wizard-ai-${Date.now()}`,
        sender: 'Творець Долі:',
        text: reply,
        senderColor: '#C084FC',
        timeText: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        isPlayer: false,
      };

      set((state) => {
        let updatedDraft = state.wizardDraft;
        if (resp?.draft_state) {
          updatedDraft = updateDraftFromPlayerState(state.wizardDraft, resp.draft_state);
        } else {
          // Евристики, якщо draft_state не повернуто
          if (!state.wizardDraft.charName) {
            const words = text.split(/[\s,.-]+/).filter(Boolean);
            if (words.length > 0 && words[0].length >= 3 && /^[A-ZА-ЯІЇЄҐ]/.test(words[0])) {
              updatedDraft = { ...updatedDraft, charName: words[0] };
            }
          }
          if (!state.wizardDraft.charBackground) {
            updatedDraft = { ...updatedDraft, charBackground: text };
          }
        }

        return {
          wizardMessages: [...state.wizardMessages, aiMsg],
          wizardDraft: updatedDraft,
        };
      });
    } catch (err: any) {
      if (err.name === 'AbortError') return;
      const errorMsg: ChatMessage = {
        id: `wizard-err-${Date.now()}`,
        sender: 'Система:',
        text: `⚠️ Помилка зв'язку з Творцем Долі: ${err.message}`,
        senderColor: '#EF4444',
        timeText: timeNow,
        isSystem: true,
        isPlayer: false,
      };
      set((state) => ({
        wizardMessages: [...state.wizardMessages, errorMsg],
      }));
    } finally {
      set({
        isWizardTyping: false,
        wizardStatusText: 'Творець Долі чекає на відповідь',
      });
    }
  },

  // --- ВІЗАРД: СИНХРОНІЗАЦІЯ РУЧНИХ ПРАВОК ДРАФТУ ---
  syncWizardDraft: async () => {
    const { wizardDraft, isSyncingDraft, isWizardTyping } = get();
    if (isSyncingDraft || isWizardTyping) return;

    set({ isSyncingDraft: true });
    if (wizardAbortController) {
      wizardAbortController.abort();
    }
    wizardAbortController = new AbortController();

    try {
      const draftState = buildDraftPlayerState(wizardDraft);
      const harmonized = await charactersApi.syncDraft(draftState, { signal: wizardAbortController.signal });

      if (harmonized) {
        set((state) => ({
          wizardDraft: updateDraftFromPlayerState(state.wizardDraft, harmonized),
          wizardMessages: [
            ...state.wizardMessages,
            {
              id: `wizard-sync-${Date.now()}`,
              sender: 'Творець Долі:',
              text: '✨ Картку персонажа гармонізовано! Характеристики та навички узгоджено з вашими правками.',
              senderColor: '#A78BFA',
              timeText: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
              isPlayer: false,
            },
          ],
        }));
      }
    } catch (err: any) {
      if (err.name === 'AbortError') return;
      const errorMsg: ChatMessage = {
        id: `wizard-err-${Date.now()}`,
        sender: 'Система:',
        text: `⚠️ Помилка синхронізації драфту: ${err.message}`,
        senderColor: '#EF4444',
        timeText: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        isSystem: true,
        isPlayer: false,
      };
      set((state) => ({
        wizardMessages: [...state.wizardMessages, errorMsg],
      }));
    } finally {
      set({ isSyncingDraft: false });
    }
  },

  // --- ВІЗАРД: ФІНАЛІЗАЦІЯ ТА СТАРТ ГРИ ---
  finalizeWizard: async () => {
    const { wizardMessages, isWizardTyping, wizardDraft } = get();
    if (wizardMessages.length === 0 || isWizardTyping) return;

    set({
      isWizardTyping: true,
      wizardStatusText: 'Генерація фінального листа персонажа...',
    });

    if (wizardAbortController) {
      wizardAbortController.abort();
    }
    wizardAbortController = new AbortController();

    try {
      const summary = wizardMessages
        .filter((m) => !m.isSystem)
        .map((m) => `${m.sender} ${m.text}`)
        .join('\n');

      const currentDraft = buildDraftPlayerState(wizardDraft);
      const playerState = await charactersApi.finalizeCharacter(
        {
          dialog_summary: summary,
          draft_state: currentDraft,
        },
        { signal: wizardAbortController.signal }
      );

      if (!playerState || !playerState.meta) {
        const errorMsg: ChatMessage = {
          id: `wizard-err-${Date.now()}`,
          sender: 'Система:',
          text: '⚠️ ШІ тимчасово перевантажений або ліміт запитів вичерпано, зачекайте 15–20 секунд і спробуйте знову.',
          senderColor: '#EF4444',
          timeText: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          isSystem: true,
          isPlayer: false,
        };
        set((state) => ({
          wizardMessages: [...state.wizardMessages, errorMsg],
        }));
        return;
      }

      await get().loadCharacters();

      const targetCharName = wizardDraft.charName?.trim() || playerState.meta.name;
      const characters = get().characters;
      const selected =
        characters.find((c) => c.name.toLowerCase() === targetCharName?.toLowerCase()) ||
        characters[characters.length - 1];

      if (selected) {
        await get().selectCharacter(selected.char_id);

        const firstCamp = await get().createCampaign(`Пригода ${selected.name} #1`);
        if (firstCamp) {
          await get().selectCampaign(firstCamp.campaign_id);
        }

        set({ isWizardOpen: false });
        get().setSystemAlert(`Героя «${selected.name}» створено! Розпочато нову пригоду.`, 'success');
      } else {
        get().setSystemAlert('Персонажа створено, але не знайдено у списку', 'info');
        set({ isWizardOpen: false });
      }
    } catch (err: any) {
      if (err.name === 'AbortError') return;
      const errorMsg: ChatMessage = {
        id: `wizard-err-${Date.now()}`,
        sender: 'Система:',
        text: `⚠️ Помилка створення героя: ${err.message}`,
        senderColor: '#EF4444',
        timeText: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        isSystem: true,
        isPlayer: false,
      };
      set((state) => ({
        wizardMessages: [...state.wizardMessages, errorMsg],
      }));
    } finally {
      set({
        isWizardTyping: false,
        wizardStatusText: 'Творець Долі чекає на відповідь',
      });
    }
  },
}));
