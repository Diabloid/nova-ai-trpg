import { charactersApi } from '../../api/charactersApi';
import {
  serializeDynamicSheet,
  setByPath,
  type HeaderPatch,
} from '../../utils/dynamicSheet';
import { formatSystemTime } from '../../utils/formatTime';
import {
  applyFieldLabelUpdate,
  mergeFieldLabelsIntoState,
  resolveMissingFieldKeyLabels,
} from '../../utils/templateKeyTranslator';
import { useGameStore } from '../useGameStore';
import {
  addLockedPaths,
  buildInitialRawState,
  cloneDeep,
  createWizardAbortSignal,
  DEFAULT_FALLBACK_TEMPLATE,
  DEFAULT_WORLD_ID,
  isWizardActionBlockedOffline,
  mergeServerDraftWithSchema,
  serializeStableSnapshot,
} from './helpers';
import type { DraftSlice, WizardSliceCreator } from './types';

const initialRawState = buildInitialRawState(DEFAULT_FALLBACK_TEMPLATE, DEFAULT_WORLD_ID);

export const createDraftSlice: WizardSliceCreator<DraftSlice> = (set, get) => ({
  wizardRawState: initialRawState,
  initialDraftSnapshot: JSON.stringify(initialRawState),
  lastSyncedSnapshot: serializeStableSnapshot(initialRawState),
  hasUnsyncedEdits: false,
  lockedFields: [],
  isSyncingDraft: false,

  setWizardRawState: (nextState: Record<string, any>) => {
    set((state) => ({
      wizardRawState: nextState,
      hasUnsyncedEdits: serializeStableSnapshot(nextState) !== state.lastSyncedSnapshot,
    }));
  },

  updateWizardHeaderField: (patch: HeaderPatch) => {
    set((state) => {
      const nextState = serializeDynamicSheet(state.wizardRawState, [], patch);
      const additions: string[] = [];
      if (patch.name !== undefined) additions.push('meta.name');
      if (patch.location !== undefined) additions.push('meta.location');
      if (patch.avatar !== undefined) additions.push('meta.avatar');
      if (patch.overallState !== undefined) {
        const useAnatomyPath =
          state.wizardRawState?.anatomy_and_health &&
          typeof state.wizardRawState.anatomy_and_health === 'object' &&
          !Array.isArray(state.wizardRawState.anatomy_and_health) &&
          state.wizardRawState?.meta?.overall_state === undefined;
        additions.push(
          useAnatomyPath ? 'anatomy_and_health.overall_state' : 'meta.overall_state'
        );
      }

      return {
        wizardRawState: nextState,
        lockedFields: addLockedPaths(state.lockedFields, additions),
        hasUnsyncedEdits: serializeStableSnapshot(nextState) !== state.lastSyncedSnapshot,
      };
    });
  },

  updateWizardSectionValue: (sectionPath: string, nextValue: any) => {
    set((state) => {
      const nextState = cloneDeep(state.wizardRawState);
      setByPath(nextState, sectionPath, cloneDeep(nextValue));
      return {
        wizardRawState: nextState,
        lockedFields: addLockedPaths(state.lockedFields, [sectionPath]),
        hasUnsyncedEdits: serializeStableSnapshot(nextState) !== state.lastSyncedSnapshot,
      };
    });
  },

  updateWizardFieldLabel: (rawKey: string, nextLabel: string) => {
    const schemaFallback = get().getActiveSchemaFallback();
    set((state) => {
      const nextState = applyFieldLabelUpdate(
        state.wizardRawState,
        rawKey,
        nextLabel,
        schemaFallback
      );
      return {
        wizardRawState: nextState,
        hasUnsyncedEdits: serializeStableSnapshot(nextState) !== state.lastSyncedSnapshot,
      };
    });
  },

  translateWizardKeys: async (keys: string[]) => {
    const schemaFallback = get().getActiveSchemaFallback();
    const existingLabels = {
      ...(schemaFallback?.field_labels || {}),
      ...(get().wizardRawState?._schema_meta?.field_labels || {}),
    };
    const translated = await resolveMissingFieldKeyLabels(keys, existingLabels);
    if (Object.keys(translated).length === 0) return;

    set((state) => {
      const nextState = mergeFieldLabelsIntoState(
        state.wizardRawState,
        translated,
        schemaFallback
      );
      return {
        wizardRawState: nextState,
        hasUnsyncedEdits: serializeStableSnapshot(nextState) !== state.lastSyncedSnapshot,
      };
    });
  },

  syncWizardDraft: async () => {
    const {
      wizardRawState,
      selectedWorldId,
      templateOverride,
      activeWorldDetail,
      isSyncingDraft,
      isWizardThinking,
      hasUnsyncedEdits,
    } = get();
    if (isSyncingDraft || isWizardThinking || !hasUnsyncedEdits) return;
    if (isWizardActionBlockedOffline('синхронізація драфту')) return;

    set({ isSyncingDraft: true });
    const signal = createWizardAbortSignal();

    try {
      const harmonized = await charactersApi.syncDraft(
        {
          draft_state: wizardRawState,
          world_id: selectedWorldId,
          template_override: templateOverride,
        },
        { signal }
      );

      if (harmonized && typeof harmonized === 'object') {
        set((state) => {
          const nextRaw = mergeServerDraftWithSchema(
            state.wizardRawState,
            harmonized,
            selectedWorldId,
            templateOverride || activeWorldDetail?.character_template || null,
            state.lockedFields
          );
          return {
            wizardRawState: nextRaw,
            lastSyncedSnapshot: serializeStableSnapshot(nextRaw),
            hasUnsyncedEdits: false,
            wizardMessages: [
              ...state.wizardMessages,
              {
                id: `wizard-sync-${Date.now()}`,
                sender: 'Творець Долі:',
                text: 'Картку персонажа гармонізовано! Параметри та секції анкети узгоджено з вашими правками.',
                senderColor: '#A78BFA',
                timeText: formatSystemTime(),
                isPlayer: false,
              },
            ],
          };
        });
      }
    } catch (err: any) {
      if (err.name === 'AbortError') return;
      useGameStore
        .getState()
        .setSystemAlert(`Помилка синхронізації драфту: ${err.message}`, 'error');
    } finally {
      set({ isSyncingDraft: false });
    }
  },
});
