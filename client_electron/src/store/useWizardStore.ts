import { create } from 'zustand';
import type {
  PlayerState,
  TemplatePreset,
  TemplateSchemaMeta,
  WorldDetailResponse,
  WorldSummary,
} from '../types/api';
import type { ChatMessage } from '../types/game';
import { charactersApi } from '../api/charactersApi';
import { worldsApi } from '../api/worldsApi';
import { useGameStore } from './useGameStore';
import { formatSystemTime } from '../utils/formatTime';
import {
  extractHeaderAnchors,
  parseDynamicSheet,
  serializeDynamicSheet,
  setByPath,
  type HeaderPatch,
} from '../utils/dynamicSheetParser';

const DEFAULT_WORLD_ID = 'default_dark_fantasy';

const DEFAULT_FALLBACK_TEMPLATE: Record<string, any> = {
  _schema_meta: {
    version: 2,
    sections: {
      'anatomy_and_health.injuries': {
        title: 'АНАТОМІЯ ТА ТРАВМИ',
        icon: 'heart-pulse',
        color: '#EF4444',
        archetype: 'card_list',
        placement: 'drawer_column',
        order: 1,
      },
      'storage_and_equipment.worn': {
        title: 'ЕКІПІРУВАННЯ (WORN)',
        icon: 'shield',
        color: '#60A5FA',
        archetype: 'card_list',
        placement: 'drawer_column',
        order: 2,
      },
      abilities: {
        title: 'ЗДІБНОСТІ ТА ЗАКЛЯТТЯ',
        icon: 'zap',
        color: '#C084FC',
        archetype: 'card_list',
        placement: 'drawer_column',
        order: 3,
      },
      'storage_and_equipment.containers': {
        title: 'КОНТЕЙНЕРИ ТА РЮКЗАК',
        icon: 'backpack',
        color: '#34D399',
        archetype: 'container_map',
        placement: 'drawer_column',
        order: 4,
      },
      'meta.biography': {
        title: 'ХРОНІКА ТА БІОГРАФІЯ',
        icon: 'scroll-text',
        color: '#F59E0B',
        archetype: 'long_text',
        placement: 'details',
        order: 5,
      },
    },
  },
  meta: {
    world_id: DEFAULT_WORLD_ID,
    name: '',
    location: '',
    background: '',
    appearance: '',
    biography: '',
  },
  anatomy_and_health: {
    overall_state: 'Повний сил',
    injuries: [],
  },
  storage_and_equipment: {
    worn: [],
    containers: {},
  },
  abilities: [],
};

function cloneDeep<T>(value: T): T {
  try {
    return JSON.parse(JSON.stringify(value)) as T;
  } catch {
    return value;
  }
}

function buildInitialRawState(
  template: Record<string, any> | null | undefined,
  worldId: string
): Record<string, any> {
  const base =
    template && typeof template === 'object' && !Array.isArray(template)
      ? cloneDeep(template)
      : cloneDeep(DEFAULT_FALLBACK_TEMPLATE);

  if (!base.meta || typeof base.meta !== 'object' || Array.isArray(base.meta)) {
    base.meta = {};
  }
  base.meta.world_id = worldId;
  return base;
}

function mergeServerDraftWithSchema(
  prevRaw: Record<string, any>,
  serverDraft: Record<string, any>,
  worldId: string,
  fallbackTemplate: Record<string, any> | null
): Record<string, any> {
  const next = cloneDeep(serverDraft);
  if (!next.meta || typeof next.meta !== 'object' || Array.isArray(next.meta)) {
    next.meta = {};
  }
  next.meta.world_id = next.meta.world_id || worldId;

  const fallbackSchema =
    prevRaw._schema_meta || fallbackTemplate?._schema_meta;
  if (!next._schema_meta && fallbackSchema) {
    next._schema_meta = cloneDeep(fallbackSchema);
  }
  if (prevRaw.meta?.avatar && !next.meta.avatar) {
    next.meta.avatar = prevRaw.meta.avatar;
  }
  if (
    typeof prevRaw.meta?.name === 'string' &&
    prevRaw.meta.name.trim() &&
    (!next.meta.name || !String(next.meta.name).trim())
  ) {
    next.meta.name = prevRaw.meta.name;
  }
  return next;
}

function createStarterGreeting(worldTitle?: string): ChatMessage {
  const worldMention = worldTitle ? ` (світ «${worldTitle}»)` : '';
  return {
    id: `wizard-starter-${Date.now()}`,
    sender: 'Творець Долі:',
    text: `Вітаю у чертогах буття, Мандрівнику${worldMention}. Я — Творець Долі. Розкажи, ким ти бачиш свого героя? Яке його ім'я, фах або походження? Які таємниці чи випробування несе його минуле?`,
    senderColor: '#C084FC',
    timeText: formatSystemTime(),
    isPlayer: false,
  };
}

export interface WizardState {
  // --- Стан візарда ---
  isWizardOpen: boolean;
  availableWorlds: WorldSummary[];
  activeWorldDetail: WorldDetailResponse | null;
  availablePresets: TemplatePreset[];
  selectedWorldId: string;
  selectedPresetId: string | null;
  templateOverride: Record<string, any> | null;
  isLoadingWorldSchema: boolean;

  wizardRawState: Record<string, any>;
  initialDraftSnapshot: string;
  wizardMessages: ChatMessage[];
  wizardInput: string;
  isWizardThinking: boolean;
  isWizardTyping: boolean;
  wizardStatusText: string;
  isSyncingDraft: boolean;

  // --- Дії візарда ---
  openWizard: (initialWorldId?: string) => Promise<void>;
  closeWizard: () => void;
  abortWizard: () => void;
  selectWizardWorld: (worldId: string) => Promise<void>;
  selectWizardPreset: (presetId: string | null) => void;
  importCustomTemplate: (templateJson: Record<string, any>) => void;
  updateWizardHeaderField: (patch: HeaderPatch) => void;
  updateWizardSectionValue: (sectionPath: string, nextValue: any) => void;
  setWizardRawState: (nextState: Record<string, any>) => void;
  setWizardInput: (text: string) => void;
  sendWizardMessage: (rawText: string) => Promise<void>;
  syncWizardDraft: () => Promise<void>;
  finalizeWizardCharacter: () => Promise<void>;
  finalizeWizard: () => Promise<void>;
  getActiveSchemaFallback: () => TemplateSchemaMeta | null;
}

let wizardAbortController: AbortController | null = null;
let worldFetchToken = 0;

export const useWizardStore = create<WizardState>((set, get) => ({
  isWizardOpen: false,
  availableWorlds: [],
  activeWorldDetail: null,
  availablePresets: [],
  selectedWorldId: DEFAULT_WORLD_ID,
  selectedPresetId: null,
  templateOverride: null,
  isLoadingWorldSchema: false,

  wizardRawState: buildInitialRawState(DEFAULT_FALLBACK_TEMPLATE, DEFAULT_WORLD_ID),
  initialDraftSnapshot: JSON.stringify(
    buildInitialRawState(DEFAULT_FALLBACK_TEMPLATE, DEFAULT_WORLD_ID)
  ),
  wizardMessages: [],
  wizardInput: '',
  isWizardThinking: false,
  isWizardTyping: false,
  wizardStatusText: 'Творець Долі слухає...',
  isSyncingDraft: false,

  getActiveSchemaFallback: () => {
    const { templateOverride, activeWorldDetail } = get();
    return (
      templateOverride?._schema_meta ||
      activeWorldDetail?.character_template?._schema_meta ||
      DEFAULT_FALLBACK_TEMPLATE._schema_meta ||
      null
    );
  },

  // --- ВІДКРИТТЯ / ЗАКРИТТЯ / ОБРИВ ---
  openWizard: async (preferredWorldId?: string) => {
    if (wizardAbortController) {
      wizardAbortController.abort();
      wizardAbortController = null;
    }

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
    worldFetchToken++;
    get().abortWizard();
    set({ isWizardOpen: false });
  },

  selectWizardWorld: async (worldId: string) => {
    const cleanId = worldId.trim();
    if (!cleanId) return;

    if (wizardAbortController) {
      wizardAbortController.abort();
      wizardAbortController = null;
    }

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
      wizardMessages: [createStarterGreeting(activeWorldDetail?.title)],
    });
    useGameStore
      .getState()
      .setSystemAlert('Користувацький JSON-шаблон застосовано до чернетки', 'success');
  },

  setWizardRawState: (nextState: Record<string, any>) => {
    set({ wizardRawState: nextState });
  },

  updateWizardHeaderField: (patch: HeaderPatch) => {
    set((state) => ({
      wizardRawState: serializeDynamicSheet(state.wizardRawState, [], patch),
    }));
  },

  updateWizardSectionValue: (sectionPath: string, nextValue: any) => {
    set((state) => {
      const nextState = cloneDeep(state.wizardRawState);
      setByPath(nextState, sectionPath, cloneDeep(nextValue));
      return { wizardRawState: nextState };
    });
  },

  setWizardInput: (text: string) => set({ wizardInput: text }),

  // --- ДІАЛОГ З ШІ ТВОРЦЕМ ДОЛІ ---
  sendWizardMessage: async (rawText: string) => {
    const text = rawText.trim();
    if (!text || get().isWizardThinking || get().isLoadingWorldSchema) return;

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

    if (wizardAbortController) {
      wizardAbortController.abort();
    }
    wizardAbortController = new AbortController();

    try {
      const { wizardMessages, selectedWorldId, templateOverride, activeWorldDetail } = get();
      const history = wizardMessages.map((m) => ({
        role: m.sender.includes('Творець Долі') ? ('narrator' as const) : ('player' as const),
        content: m.text,
      }));

      const resp = await charactersApi.characterDialog(
        {
          message: text,
          history,
          include_draft: true,
          world_id: selectedWorldId,
          template_override: templateOverride,
        },
        { signal: wizardAbortController.signal }
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

      set((state) => {
        let nextRaw = state.wizardRawState;
        if (resp?.draft_state && typeof resp.draft_state === 'object') {
          nextRaw = mergeServerDraftWithSchema(
            state.wizardRawState,
            resp.draft_state,
            selectedWorldId,
            templateOverride || activeWorldDetail?.character_template || null
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

  // --- СИНХРОНІЗАЦІЯ РУЧНИХ ПРАВОК ДРАФТУ ---
  syncWizardDraft: async () => {
    const {
      wizardRawState,
      selectedWorldId,
      templateOverride,
      activeWorldDetail,
      isSyncingDraft,
      isWizardThinking,
    } = get();
    if (isSyncingDraft || isWizardThinking) return;

    set({ isSyncingDraft: true });
    if (wizardAbortController) {
      wizardAbortController.abort();
    }
    wizardAbortController = new AbortController();

    try {
      const harmonized = await charactersApi.syncDraft(
        {
          draft_state: wizardRawState,
          world_id: selectedWorldId,
          template_override: templateOverride,
        },
        { signal: wizardAbortController.signal }
      );

      if (harmonized && typeof harmonized === 'object') {
        set((state) => ({
          wizardRawState: mergeServerDraftWithSchema(
            state.wizardRawState,
            harmonized,
            selectedWorldId,
            templateOverride || activeWorldDetail?.character_template || null
          ),
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
        }));
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

  // --- ФІНАЛІЗАЦІЯ ПЕРСОНАЖА ТА МІСТ (BRIDGE) З ГРОЮ ---
  finalizeWizardCharacter: async () => {
    const {
      wizardMessages,
      isWizardThinking,
      wizardRawState,
      selectedWorldId,
      templateOverride,
    } = get();
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
        { signal: wizardAbortController.signal }
      );

      if (!playerState || !playerState.meta) {
        useGameStore
          .getState()
          .setSystemAlert(
            'ШІ тимчасово перевантажений або ліміт запитів вичерпано, зачекайте 15–20 секунд і спробуйте знову.',
            'error'
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
        gameStore.setSystemAlert('Персонажа створено, але не знайдено у списку', 'info');
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
}));
