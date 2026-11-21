import { charactersApi } from '../../api/charactersApi';
import type { PlayerState } from '../../types/api';
import type { ChatMessage } from '../../types/game';
import {
  extractHeaderAnchors,
  parseDynamicSheet,
  serializeDynamicSheet,
} from '../../utils/dynamicSheet';
import { formatSystemTime } from '../../utils/formatTime';
import { useGameStore } from '../useGameStore';
import {
  createWizardAbortSignal,
  isFieldUnlocked,
  isWizardActionBlockedOffline,
  mergeServerDraftWithSchema,
  serializeStableSnapshot,
} from './helpers';
import type { DialogSlice, WizardSliceCreator } from './types';

export const createDialogSlice: WizardSliceCreator<DialogSlice> = (set, get) => ({
  wizardMessages: [],
  wizardInput: '',
  isWizardThinking: false,
  isWizardTyping: false,
  wizardStatusText: 'Творець Долі слухає...',

  setWizardInput: (text: string) => set({ wizardInput: text }),

  sendWizardMessage: async (rawText: string) => {
    const text = rawText.trim();
    if (!text || get().isWizardThinking || get().isLoadingWorldSchema) return;
    if (isWizardActionBlockedOffline('діалог із Творцем Долі')) return;

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
      wizardStatusText: 'Творець Долі розмірковує',
      wizardMessages: [...state.wizardMessages, userMsg],
    }));

    const signal = createWizardAbortSignal();

    try {
      const {
        wizardMessages,
        wizardRawState,
        lockedFields,
        selectedWorldId,
        templateOverride,
        activeWorldDetail,
      } = get();
      const history = wizardMessages.map((m) => ({
        role: m.sender.includes('Творець Долі') ? ('narrator' as const) : ('player' as const),
        content: m.text,
      }));

      const resp = await charactersApi.characterDialog(
        {
          message: text,
          history,
          include_draft: true,
          draft_state: wizardRawState,
          locked_fields: lockedFields,
          world_id: selectedWorldId,
          template_override: templateOverride,
        },
        { signal }
      );

      let reply =
        resp?.reply ||
        'Цікавий образ. Нитки долі починають сплітатися. Які ще деталі минулого чи вмінь героя варто врахувати?';
      reply = reply.replace(/\*\*/g, '');

      const aiMsg: ChatMessage = {
        id: `wizard-ai-${Date.now()}`,
        sender: 'Творець Долі:',
        text: reply,
        senderColor: '#C084FC',
        timeText: formatSystemTime(),
        isPlayer: false,
      };

      const unlockedList = Array.isArray(resp?.unlocked_fields) ? resp.unlocked_fields : [];

      set((state) => {
        const remainingLocked =
          unlockedList.length > 0
            ? state.lockedFields.filter((path) => !isFieldUnlocked(path, unlockedList))
            : state.lockedFields;

        let nextRaw = state.wizardRawState;
        if (resp?.draft_state && typeof resp.draft_state === 'object') {
          nextRaw = mergeServerDraftWithSchema(
            state.wizardRawState,
            resp.draft_state,
            selectedWorldId,
            templateOverride || activeWorldDetail?.character_template || null,
            remainingLocked,
            unlockedList
          );
        } else {
          const parsed = parseDynamicSheet(
            state.wizardRawState,
            state.getActiveSchemaFallback()
          );
          if (!parsed.headers.name) {
            const words = text.split(/[\s,.-]+/).filter(Boolean);
            if (words.length > 0 && words[0].length >= 3 && /^[A-ZА-ЯІЇЄҐ]/.test(words[0])) {
              nextRaw = serializeDynamicSheet(nextRaw, [], { name: words[0] });
            }
          }
        }

        return {
          wizardMessages: [...state.wizardMessages, aiMsg],
          wizardRawState: nextRaw,
          lockedFields: remainingLocked,
          lastSyncedSnapshot: serializeStableSnapshot(nextRaw),
          hasUnsyncedEdits: false,
        };
      });
    } catch (err: any) {
      if (err.name === 'AbortError') return;
      useGameStore
        .getState()
        .setSystemAlert(`Помилка зв'язку з Творцем Долі: ${err.message}`, 'error');
    } finally {
      set({
        isWizardThinking: false,
        isWizardTyping: false,
        wizardStatusText: 'Творець Долі чекає на відповідь',
      });
    }
  },

  finalizeWizardCharacter: async () => {
    const {
      wizardMessages,
      isWizardThinking,
      wizardRawState,
      selectedWorldId,
      templateOverride,
    } = get();
    if (wizardMessages.length === 0 || isWizardThinking) return;
    if (isWizardActionBlockedOffline('завершення створення персонажа')) return;

    set({
      isWizardThinking: true,
      isWizardTyping: true,
      wizardStatusText: 'Генерація фінального листа персонажа...',
    });

    const signal = createWizardAbortSignal();

    try {
      const summary = wizardMessages.map((m) => `${m.sender} ${m.text}`).join('\n');
      const history = wizardMessages.map((m) => ({
        role: m.sender.includes('Творець Долі') ? ('narrator' as const) : ('player' as const),
        content: m.text,
      }));

      const playerState: PlayerState = await charactersApi.finalizeCharacter(
        {
          dialog_summary: summary,
          history,
          draft_state: wizardRawState,
          world_id: selectedWorldId,
          template_override: templateOverride,
        },
        { signal }
      );

      if (!playerState || !playerState.meta) {
        useGameStore
          .getState()
          .setSystemAlert(
            'ШІ тимчасово перевантажений або ліміт запитів вичерпано, зачекайте 15–20 секунд і спробуйте знову.',
            'warning'
          );
        return;
      }

      // Міст (Bridge) з основним сховищем гри useGameStore
      const gameStore = useGameStore.getState();
      if (selectedWorldId && selectedWorldId !== gameStore.activeWorldId) {
        await gameStore.selectWorld(selectedWorldId);
      } else {
        await Promise.all([gameStore.loadWorlds(), gameStore.loadCharacters()]);
      }

      const fallbackAnchors = extractHeaderAnchors(wizardRawState);
      const serverAnchors = extractHeaderAnchors(playerState);
      const targetCharName = serverAnchors.name || fallbackAnchors.name;

      const characters = useGameStore.getState().characters;
      const byWorldAndName = characters
        .filter(
          (c) =>
            c.name.toLowerCase() === targetCharName.toLowerCase() &&
            (!c.world_id || c.world_id === selectedWorldId)
        )
        .sort(
          (a, b) =>
            new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime()
        );
      const selected =
        byWorldAndName[0] ||
        characters.find((c) => c.name.toLowerCase() === targetCharName.toLowerCase()) ||
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
        gameStore.setSystemAlert('Персонажа створено, але не знайдено у списку', 'warning');
        set({ isWizardOpen: false });
      }
    } catch (err: any) {
      if (err.name === 'AbortError') return;
      useGameStore
        .getState()
        .setSystemAlert(`Помилка створення героя: ${err.message}`, 'error');
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
});
