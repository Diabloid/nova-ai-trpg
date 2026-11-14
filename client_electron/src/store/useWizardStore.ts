import { create } from 'zustand';
import type { PlayerState } from '../types/api';
import type { ChatMessage, CharacterWizardDraft } from '../types/game';
import { charactersApi } from '../api/charactersApi';
import { useGameStore } from './useGameStore';
import { formatSystemTime } from '../utils/formatTime';

export interface WizardState {
  // --- Стан візарда ---
  isWizardOpen: boolean;
  wizardDraft: CharacterWizardDraft;
  wizardMessages: ChatMessage[];
  wizardInput: string;
  isWizardThinking: boolean;
  isWizardTyping: boolean; // Alias для зворотної сумісності
  wizardStatusText: string;
  isSyncingDraft: boolean;
  isWizardAppearanceDetailsExpanded: boolean;

  // --- Дії візарда ---
  openWizard: () => void;
  closeWizard: () => void;
  abortWizard: () => void;
  setWizardDraft: (draft: Partial<CharacterWizardDraft>) => void;
  updateWizardDraftField: (field: keyof CharacterWizardDraft, value: any) => void;
  toggleWizardAppearanceDetails: () => void;
  setWizardInput: (text: string) => void;
  sendWizardMessage: (rawText: string) => Promise<void>;
  syncWizardDraft: () => Promise<void>;
  finalizeWizardCharacter: () => Promise<void>;
  finalizeWizard: () => Promise<void>; // Alias для сумісності
}

export const DEFAULT_WIZARD_DRAFT: CharacterWizardDraft = {
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

let wizardAbortController: AbortController | null = null;

export function buildDraftPlayerState(draft: CharacterWizardDraft): PlayerState {
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

export function updateDraftFromPlayerState(prev: CharacterWizardDraft, state: PlayerState): CharacterWizardDraft {
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

export const useWizardStore = create<WizardState>((set, get) => ({
  isWizardOpen: false,
  wizardDraft: { ...DEFAULT_WIZARD_DRAFT },
  wizardMessages: [],
  wizardInput: '',
  isWizardThinking: false,
  isWizardTyping: false,
  wizardStatusText: 'Творець Долі слухає...',
  isSyncingDraft: false,
  isWizardAppearanceDetailsExpanded: false,

  // --- ВІДКРИТТЯ / ЗАКРИТТЯ / ОБРИВ ---
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
      timeText: formatSystemTime(),
      isPlayer: false,
    };

    // Закриваємо бічне меню та шторку гри для максимальної концентрації
    useGameStore.setState({ isSidebarOpen: false, isCharacterDrawerOpen: false });

    set({
      isWizardOpen: true,
      wizardDraft: { ...DEFAULT_WIZARD_DRAFT },
      wizardMessages: [starterGreeting],
      isWizardThinking: false,
      isWizardTyping: false,
      wizardStatusText: 'Творець Долі слухає...',
      isSyncingDraft: false,
      wizardInput: '',
      isWizardAppearanceDetailsExpanded: false,
    });
  },

  abortWizard: () => {
    if (wizardAbortController) {
      wizardAbortController.abort();
      wizardAbortController = null;
    }
    set({
      isWizardThinking: false,
      isWizardTyping: false,
      isSyncingDraft: false,
      wizardStatusText: 'Дію скасовано',
    });
  },

  closeWizard: () => {
    get().abortWizard();
    set({ isWizardOpen: false });
  },

  setWizardDraft: (partial: Partial<CharacterWizardDraft>) => {
    set((state) => ({
      wizardDraft: { ...state.wizardDraft, ...partial },
    }));
  },

  updateWizardDraftField: (field: keyof CharacterWizardDraft, value: any) => {
    set((state) => ({
      wizardDraft: { ...state.wizardDraft, [field]: value },
    }));
  },

  toggleWizardAppearanceDetails: () => {
    set((state) => ({
      isWizardAppearanceDetailsExpanded: !state.isWizardAppearanceDetailsExpanded,
    }));
  },

  setWizardInput: (text: string) => set({ wizardInput: text }),

  // --- ДІАЛОГ З ШІ ТВОРЦЕМ ДОЛІ ---
  sendWizardMessage: async (rawText: string) => {
    const text = rawText.trim();
    if (!text || get().isWizardThinking) return;

    const cleanUserText = text.replace(/\*\*/g, '');
    const timeNow = formatSystemTime();

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
      isWizardThinking: true,
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
        timeText: formatSystemTime(),
        isPlayer: false,
      };

      set((state) => {
        let updatedDraft = state.wizardDraft;
        if (resp?.draft_state) {
          updatedDraft = updateDraftFromPlayerState(state.wizardDraft, resp.draft_state);
        } else {
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
        isWizardThinking: false,
        isWizardTyping: false,
        wizardStatusText: 'Творець Долі чекає на відповідь',
      });
    }
  },

  // --- СИНХРОНІЗАЦІЯ РУЧНИХ ПРАВОК ДРАФТУ ---
  syncWizardDraft: async () => {
    const { wizardDraft, isSyncingDraft, isWizardThinking } = get();
    if (isSyncingDraft || isWizardThinking) return;

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
              timeText: formatSystemTime(),
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
        timeText: formatSystemTime(),
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

  // --- ФІНАЛІЗАЦІЯ ПЕРСОНАЖА ТА МІСТ (BRIDGE) З ГРОЮ ---
  finalizeWizardCharacter: async () => {
    const { wizardMessages, isWizardThinking, wizardDraft } = get();
    if (wizardMessages.length === 0 || isWizardThinking) return;

    set({
      isWizardThinking: true,
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
          timeText: formatSystemTime(),
          isSystem: true,
          isPlayer: false,
        };
        set((state) => ({
          wizardMessages: [...state.wizardMessages, errorMsg],
        }));
        return;
      }

      // Міст (Bridge) з основним сховищем гри useGameStore
      const gameStore = useGameStore.getState();
      await gameStore.loadCharacters();

      const targetCharName = wizardDraft.charName?.trim() || playerState.meta.name;
      const characters = useGameStore.getState().characters;
      const selected =
        characters.find((c) => c.name.toLowerCase() === targetCharName?.toLowerCase()) ||
        characters[characters.length - 1];

      if (selected) {
        await gameStore.selectCharacter(selected.char_id);

        const firstCamp = await gameStore.createCampaign(`Пригода ${selected.name} #1`);
        if (firstCamp) {
          await gameStore.selectCampaign(firstCamp.campaign_id);
        }

        set({ isWizardOpen: false });
        gameStore.setSystemAlert('Героя та кампанію успішно створено!', 'success');
      } else {
        gameStore.setSystemAlert('Персонажа створено, але не знайдено у списку', 'info');
        set({ isWizardOpen: false });
      }
    } catch (err: any) {
      if (err.name === 'AbortError') return;
      const errorMsg: ChatMessage = {
        id: `wizard-err-${Date.now()}`,
        sender: 'Система:',
        text: `⚠️ Помилка створення героя: ${err.message}`,
        senderColor: '#EF4444',
        timeText: formatSystemTime(),
        isSystem: true,
        isPlayer: false,
      };
      set((state) => ({
        wizardMessages: [...state.wizardMessages, errorMsg],
      }));
    } finally {
      set({
        isWizardThinking: false,
        isWizardTyping: false,
        wizardStatusText: 'Творець Долі чекає на відповідь',
      });
    }
  },

  finalizeWizard: async () => {
    return get().finalizeWizardCharacter();
  },
}));