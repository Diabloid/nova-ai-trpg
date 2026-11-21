import { worldsApi } from '../../api/worldsApi';
import type { CharacterDialogHistoryItem } from '../../types/api';
import type { ChatMessage } from '../../types/game';
import { formatSystemTime } from '../../utils/formatTime';
import { normalizeLucideIconKey } from '../../utils/lucideIconMap';
import { useGameStore } from '../useGameStore';
import {
  createInitialPassportMessage,
  isWorldActionBlockedOffline,
  persistDraftIfCreate,
} from './helpers';
import {
  DEFAULT_PASSPORT_DRAFT,
  type PassportSlice,
  type WorldStudioSliceCreator,
} from './types';

export const createPassportSlice: WorldStudioSliceCreator<PassportSlice> = (set, get) => ({
  passport: { ...DEFAULT_PASSPORT_DRAFT },
  passportMessages: [createInitialPassportMessage()],
  passportInput: '',
  oneShotDescription: '',
  isGeneratingPassport: false,

  updatePassport: (patch) => {
    set((state) => ({
      passport: {
        ...state.passport,
        ...patch,
        icon:
          patch.icon !== undefined
            ? normalizeLucideIconKey(patch.icon, 'globe')
            : state.passport.icon,
      },
      isDirty: true,
    }));
    persistDraftIfCreate(get());
  },

  addStartingLocation: (location) => {
    const clean = location.trim();
    if (!clean) return;
    set((state) => {
      if (state.passport.starting_locations.includes(clean)) return state;
      return {
        passport: {
          ...state.passport,
          starting_locations: [...state.passport.starting_locations, clean],
        },
        isDirty: true,
      };
    });
    persistDraftIfCreate(get());
  },

  removeStartingLocation: (index) => {
    set((state) => ({
      passport: {
        ...state.passport,
        starting_locations: state.passport.starting_locations.filter((_, i) => i !== index),
      },
      isDirty: true,
    }));
    persistDraftIfCreate(get());
  },

  updateStartingLocation: (index, value) => {
    set((state) => ({
      passport: {
        ...state.passport,
        starting_locations: state.passport.starting_locations.map((loc, i) =>
          i === index ? value : loc
        ),
      },
      isDirty: true,
    }));
    persistDraftIfCreate(get());
  },

  setPassportInput: (text) => set({ passportInput: text }),
  setOneShotDescription: (text) => set({ oneShotDescription: text }),

  sendPassportDialog: async (rawMessage: string) => {
    const text = rawMessage.trim();
    if (!text || get().isGeneratingPassport) return;
    if (isWorldActionBlockedOffline('взаємодія з Архітектором Світів')) return;

    const userMsg: ChatMessage = {
      id: `ws-user-${Date.now()}`,
      sender: 'Ти:',
      senderColor: '#60A5FA',
      text,
      timeText: formatSystemTime(),
      isPlayer: true,
    };

    const history: CharacterDialogHistoryItem[] = get().passportMessages.map((msg) => ({
      role: msg.isPlayer ? ('user' as const) : ('assistant' as const),
      content: msg.text,
    }));

    set((state) => ({
      passportMessages: [...state.passportMessages, userMsg],
      passportInput: '',
      isGeneratingPassport: true,
    }));

    try {
      const response = await worldsApi.wizardStepPassport({
        mode: 'dialog',
        message: text,
        history,
        current_passport: get().passport,
      });

      const aiMsg: ChatMessage = {
        id: `ws-ai-${Date.now()}`,
        sender: 'Архітектор Світів:',
        senderColor: '#C084FC',
        text: response.reply,
        timeText: formatSystemTime(),
        isPlayer: false,
      };

      set((state) => ({
        passportMessages: [...state.passportMessages, aiMsg],
        passport: {
          ...response.passport_draft,
          icon: normalizeLucideIconKey(response.passport_draft?.icon, 'globe'),
          starting_locations: Array.isArray(response.passport_draft?.starting_locations)
            ? response.passport_draft.starting_locations
            : state.passport.starting_locations,
        },
        isDirty: true,
        isGeneratingPassport: false,
      }));
      persistDraftIfCreate(get());
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Помилка запиту до ШІ';
      useGameStore
        .getState()
        .setSystemAlert(`Архітектор світів не відповів: ${message}`, 'error');
      set({ isGeneratingPassport: false });
    }
  },

  generatePassportOneShot: async (rawDescription?: string) => {
    const sourceText = (rawDescription ?? get().oneShotDescription).trim();
    if (!sourceText || get().isGeneratingPassport) return;
    if (isWorldActionBlockedOffline('ШІ-генерація паспорта')) return;

    set({ isGeneratingPassport: true });

    try {
      const response = await worldsApi.wizardStepPassport({
        mode: 'one_shot',
        message: sourceText,
        current_passport: get().passport,
      });

      const aiMsg: ChatMessage = {
        id: `ws-oneshot-${Date.now()}`,
        sender: 'Архітектор Світів:',
        senderColor: '#C084FC',
        text:
          response.reply ||
          'Паспорт світу заповнено за вашим описом. Можете уточнити будь-яке поле вручну або продовжити в діалозі.',
        timeText: formatSystemTime(),
        isPlayer: false,
      };

      set((state) => ({
        passportMessages: [...state.passportMessages, aiMsg],
        passport: {
          ...response.passport_draft,
          icon: normalizeLucideIconKey(response.passport_draft?.icon, 'globe'),
          starting_locations: Array.isArray(response.passport_draft?.starting_locations)
            ? response.passport_draft.starting_locations
            : [],
        },
        isDirty: true,
        isGeneratingPassport: false,
      }));
      persistDraftIfCreate(get());
      useGameStore
        .getState()
        .setSystemAlert('Паспорт світу згенеровано за описом', 'success');
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Помилка генерації';
      useGameStore
        .getState()
        .setSystemAlert(`Не вдалося згенерувати паспорт світу: ${message}`, 'error');
      set({ isGeneratingPassport: false });
    }
  },
});
