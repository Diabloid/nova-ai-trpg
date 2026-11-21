import { worldsApi } from '../../api/worldsApi';
import { useGameStore } from '../useGameStore';
import {
  abortActiveWizardRequest,
  buildInitialRawState,
  cloneDeep,
  createStarterGreeting,
  DEFAULT_FALLBACK_TEMPLATE,
  DEFAULT_WORLD_ID,
  serializeStableSnapshot,
} from './helpers';
import type { SessionSlice, WizardSliceCreator } from './types';

let worldFetchToken = 0;

export const createSessionSlice: WizardSliceCreator<SessionSlice> = (set, get) => ({
  isWizardOpen: false,
  availableWorlds: [],
  activeWorldDetail: null,
  availablePresets: [],
  selectedWorldId: DEFAULT_WORLD_ID,
  selectedPresetId: null,
  templateOverride: null,
  isLoadingWorldSchema: false,

  getActiveSchemaFallback: () => {
    const { templateOverride, activeWorldDetail } = get();
    return (
      templateOverride?._schema_meta ||
      activeWorldDetail?.character_template?._schema_meta ||
      DEFAULT_FALLBACK_TEMPLATE._schema_meta ||
      null
    );
  },

  openWizard: async (preferredWorldId?: string) => {
    abortActiveWizardRequest();

    const targetWorldId =
      (typeof preferredWorldId === 'string' && preferredWorldId.trim()) ||
      useGameStore.getState().activeWorldId ||
      DEFAULT_WORLD_ID;

    const requestToken = ++worldFetchToken;
    const initialFallback = buildInitialRawState(DEFAULT_FALLBACK_TEMPLATE, targetWorldId);

    // Закриваємо бічне меню та шторку гри для максимальної концентрації
    useGameStore.setState({ isSidebarOpen: false, isCharacterDrawerOpen: false });

    set({
      isWizardOpen: true,
      selectedWorldId: targetWorldId,
      selectedPresetId: null,
      templateOverride: null,
      activeWorldDetail: null,
      isLoadingWorldSchema: true,
      wizardRawState: initialFallback,
      initialDraftSnapshot: JSON.stringify(initialFallback),
      lastSyncedSnapshot: serializeStableSnapshot(initialFallback),
      hasUnsyncedEdits: false,
      lockedFields: [],
      wizardMessages: [createStarterGreeting()],
      isWizardThinking: false,
      isWizardTyping: false,
      wizardStatusText: 'Творець Долі слухає...',
      isSyncingDraft: false,
      wizardInput: '',
    });

    try {
      const [worldsRes, presetsRes, worldDetailRes] = await Promise.allSettled([
        worldsApi.getWorlds(),
        worldsApi.getTemplatePresets(),
        worldsApi.getWorld(targetWorldId),
      ]);

      if (requestToken !== worldFetchToken) return;

      const availableWorlds =
        worldsRes.status === 'fulfilled' && Array.isArray(worldsRes.value)
          ? worldsRes.value
          : [];
      const availablePresets =
        presetsRes.status === 'fulfilled' && Array.isArray(presetsRes.value)
          ? presetsRes.value
          : [];

      let resolvedWorldDetail =
        worldDetailRes.status === 'fulfilled' ? worldDetailRes.value : null;
      let resolvedWorldId = targetWorldId;

      if (!resolvedWorldDetail && availableWorlds.length > 0) {
        const fallbackWorld =
          availableWorlds.find((w) => w.is_default) || availableWorlds[0];
        resolvedWorldId = fallbackWorld.world_id;
        try {
          resolvedWorldDetail = await worldsApi.getWorld(resolvedWorldId);
        } catch {
          // Залишаємо локальний шаблон
        }
      }

      if (requestToken !== worldFetchToken) return;

      const nextRawState = buildInitialRawState(
        resolvedWorldDetail?.character_template,
        resolvedWorldId
      );

      set((state) => ({
        availableWorlds,
        availablePresets,
        activeWorldDetail: resolvedWorldDetail,
        selectedWorldId: resolvedWorldId,
        isLoadingWorldSchema: false,
        wizardRawState: nextRawState,
        initialDraftSnapshot: JSON.stringify(nextRawState),
        lastSyncedSnapshot: serializeStableSnapshot(nextRawState),
        hasUnsyncedEdits: false,
        lockedFields: [],
        wizardMessages:
          state.wizardMessages.length <= 1
            ? [createStarterGreeting(resolvedWorldDetail?.title)]
            : state.wizardMessages,
      }));
    } catch {
      if (requestToken !== worldFetchToken) return;
      set({ isLoadingWorldSchema: false });
    }
  },

  abortWizard: () => {
    abortActiveWizardRequest();
    set({
      isWizardThinking: false,
      isWizardTyping: false,
      isSyncingDraft: false,
      wizardStatusText: 'Дію скасовано',
    });
  },

  closeWizard: () => {
    worldFetchToken++;
    get().abortWizard();
    set({ isWizardOpen: false });
  },

  selectWizardWorld: async (worldId: string) => {
    const cleanId = worldId.trim();
    if (!cleanId) return;

    abortActiveWizardRequest();

    const requestToken = ++worldFetchToken;
    set({
      selectedWorldId: cleanId,
      selectedPresetId: null,
      templateOverride: null,
      isLoadingWorldSchema: true,
      isWizardThinking: false,
      isWizardTyping: false,
      isSyncingDraft: false,
      wizardStatusText: 'Творець Долі слухає...',
    });

    try {
      const detail = await worldsApi.getWorld(cleanId);
      if (requestToken !== worldFetchToken) return;

      const nextRawState = buildInitialRawState(detail.character_template, cleanId);
      set({
        activeWorldDetail: detail,
        selectedWorldId: cleanId,
        isLoadingWorldSchema: false,
        wizardRawState: nextRawState,
        initialDraftSnapshot: JSON.stringify(nextRawState),
        lastSyncedSnapshot: serializeStableSnapshot(nextRawState),
        hasUnsyncedEdits: false,
        lockedFields: [],
        wizardMessages: [createStarterGreeting(detail.title)],
        wizardInput: '',
      });
    } catch (err: any) {
      if (requestToken !== worldFetchToken) return;
      const fallbackRaw = buildInitialRawState(DEFAULT_FALLBACK_TEMPLATE, cleanId);
      set({
        activeWorldDetail: null,
        isLoadingWorldSchema: false,
        wizardRawState: fallbackRaw,
        initialDraftSnapshot: JSON.stringify(fallbackRaw),
        lastSyncedSnapshot: serializeStableSnapshot(fallbackRaw),
        hasUnsyncedEdits: false,
        lockedFields: [],
        wizardMessages: [createStarterGreeting()],
      });
      useGameStore
        .getState()
        .setSystemAlert(`Не вдалося завантажити шаблон світу: ${err.message}`, 'error');
    }
  },

  selectWizardPreset: (presetId: string | null) => {
    const { availablePresets, activeWorldDetail, selectedWorldId } = get();
    if (!presetId) {
      const nextRaw = buildInitialRawState(
        activeWorldDetail?.character_template,
        selectedWorldId
      );
      set({
        selectedPresetId: null,
        templateOverride: null,
        wizardRawState: nextRaw,
        initialDraftSnapshot: JSON.stringify(nextRaw),
        lastSyncedSnapshot: serializeStableSnapshot(nextRaw),
        hasUnsyncedEdits: false,
        lockedFields: [],
        wizardMessages: [createStarterGreeting(activeWorldDetail?.title)],
      });
      return;
    }

    const preset = availablePresets.find((p) => p.id === presetId);
    if (!preset) return;

    const overrideTemplate = cloneDeep(preset.template);
    const nextRaw = buildInitialRawState(overrideTemplate, selectedWorldId);
    set({
      selectedPresetId: preset.id,
      templateOverride: overrideTemplate,
      wizardRawState: nextRaw,
      initialDraftSnapshot: JSON.stringify(nextRaw),
      lastSyncedSnapshot: serializeStableSnapshot(nextRaw),
      hasUnsyncedEdits: false,
      lockedFields: [],
      wizardMessages: [createStarterGreeting(activeWorldDetail?.title)],
    });
  },

  importCustomTemplate: (templateJson: Record<string, any>) => {
    const { selectedWorldId, activeWorldDetail } = get();
    const overrideTemplate = cloneDeep(templateJson);
    const nextRaw = buildInitialRawState(overrideTemplate, selectedWorldId);
    set({
      selectedPresetId: '__custom_json__',
      templateOverride: overrideTemplate,
      wizardRawState: nextRaw,
      initialDraftSnapshot: JSON.stringify(nextRaw),
      lastSyncedSnapshot: serializeStableSnapshot(nextRaw),
      hasUnsyncedEdits: false,
      lockedFields: [],
      wizardMessages: [createStarterGreeting(activeWorldDetail?.title)],
    });
    useGameStore
      .getState()
      .setSystemAlert('Користувацький JSON-шаблон застосовано до чернетки', 'success');
  },
});
