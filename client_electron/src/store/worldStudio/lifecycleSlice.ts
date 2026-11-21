import { worldsApi } from '../../api/worldsApi';
import type {
  WorldAiPrompts,
  WorldLoreDraftItem,
  WorldPassportDraft,
} from '../../types/api';
import { normalizeLucideIconKey } from '../../utils/lucideIconMap';
import { useGameStore } from '../useGameStore';
import {
  clearWorldStudioDraftStorage,
  createInitialPassportMessage,
  isWorldActionBlockedOffline,
  loadCreateDraftFromStorage,
  persistDraftIfCreate,
  syncLoreHeadingWithTitle,
} from './helpers';
import {
  DEFAULT_PASSPORT_DRAFT,
  DEFAULT_WORLD_PROMPTS,
  type LifecycleSlice,
  type WorldStudioSliceCreator,
  type WorldStudioStep,
} from './types';

function createResetFields() {
  return {
    isLoadingWorld: false,
    isSavingWorld: false,
    isDirty: false,
    passport: { ...DEFAULT_PASSPORT_DRAFT },
    passportMessages: [createInitialPassportMessage()],
    passportInput: '',
    oneShotDescription: '',
    isGeneratingPassport: false,
    aiPrompts: { ...DEFAULT_WORLD_PROMPTS },
    aiGeneratedPromptsSnapshot: null,
    selectedToneChips: [] as string[],
    promptsCustomInstruction: '',
    isGeneratingPrompts: false,
    loreArticles: [] as WorldLoreDraftItem[],
    selectedLoreFilename: null,
    dirtyLoreFilenames: [] as string[],
    loreGenProgress: null,
    isMutatingLore: false,
    templateDraft: {},
    demoState: {},
    templateSummaryNote: null,
    templateCustomInstruction: '',
    isJsonMode: false,
    isGeneratingTemplate: false,
  };
}

export const createLifecycleSlice: WorldStudioSliceCreator<LifecycleSlice> = (set, get) => ({
  isOpen: false,
  mode: 'create',
  editingWorldId: null,
  currentStep: 1,
  isLoadingWorld: false,
  isSavingWorld: false,
  isDirty: false,

  openCreateStudio: () => {
    const saved = loadCreateDraftFromStorage();
    useGameStore.setState({ isSidebarOpen: false, isCharacterDrawerOpen: false });

    if (saved) {
      const hasDraftContent =
        Boolean(saved.passport?.title?.trim()) ||
        Boolean(saved.passport?.description?.trim()) ||
        (saved.loreArticles?.length ?? 0) > 0 ||
        Object.keys(saved.templateDraft || {}).length > 0;

      set({
        ...createResetFields(),
        isOpen: true,
        mode: 'create',
        editingWorldId: null,
        currentStep: saved.currentStep || 1,
        isDirty: hasDraftContent,
        passport: {
          ...DEFAULT_PASSPORT_DRAFT,
          ...saved.passport,
          icon: normalizeLucideIconKey(saved.passport?.icon, 'globe'),
          starting_locations: Array.isArray(saved.passport?.starting_locations)
            ? saved.passport.starting_locations
            : [],
        },
        aiPrompts: { ...DEFAULT_WORLD_PROMPTS, ...saved.aiPrompts },
        aiGeneratedPromptsSnapshot: saved.aiGeneratedPromptsSnapshot || null,
        selectedToneChips: Array.isArray(saved.selectedToneChips) ? saved.selectedToneChips : [],
        promptsCustomInstruction: saved.promptsCustomInstruction || '',
        loreArticles: Array.isArray(saved.loreArticles) ? saved.loreArticles : [],
        selectedLoreFilename: saved.loreArticles?.[0]?.filename || null,
        templateDraft: saved.templateDraft || {},
        demoState: saved.demoState || {},
      });
      return;
    }

    set({
      ...createResetFields(),
      isOpen: true,
      mode: 'create',
      editingWorldId: null,
      currentStep: 1,
    });
  },

  openEditStudio: async (worldId: string) => {
    useGameStore.setState({ isSidebarOpen: false, isCharacterDrawerOpen: false });

    set({
      ...createResetFields(),
      isOpen: true,
      mode: 'edit',
      editingWorldId: worldId,
      currentStep: 1,
      isLoadingWorld: true,
    });

    try {
      const detail = await worldsApi.getWorld(worldId);
      const loreInfoList = Array.isArray(detail.lore_articles) ? detail.lore_articles : [];
      const loreResults = await Promise.allSettled(
        loreInfoList.map((item) => worldsApi.getLoreArticle(worldId, item.filename))
      );

      const loadedArticles: WorldLoreDraftItem[] = loreInfoList.map((info, idx) => {
        const res = loreResults[idx];
        if (res && res.status === 'fulfilled') {
          return {
            filename: res.value.filename,
            title: res.value.title || info.title,
            content: res.value.content,
          };
        }
        return {
          filename: info.filename,
          title: info.title,
          content: '',
        };
      });

      const passport: WorldPassportDraft = {
        title: detail.title || '',
        genre: detail.genre || '',
        description: detail.description || '',
        icon: normalizeLucideIconKey(detail.icon, 'globe'),
        accent_color: detail.accent_color || '#7E0018',
        starting_locations: Array.isArray(detail.starting_locations)
          ? detail.starting_locations
          : [],
      };

      const prompts: WorldAiPrompts = {
        world_tone: detail.ai_prompts?.world_tone || '',
        narrator_rules: detail.ai_prompts?.narrator_rules || '',
        analyzer_rules: detail.ai_prompts?.analyzer_rules || '',
        creator_rules: detail.ai_prompts?.creator_rules || '',
      };

      set({
        isLoadingWorld: false,
        passport,
        aiPrompts: prompts,
        aiGeneratedPromptsSnapshot: null,
        loreArticles: loadedArticles,
        selectedLoreFilename: loadedArticles[0]?.filename || null,
        dirtyLoreFilenames: [],
        templateDraft: detail.character_template || {},
        isDirty: false,
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Невідома помилка';
      useGameStore
        .getState()
        .setSystemAlert(`Не вдалося завантажити світ для редагування: ${message}`, 'error');
      set({ isLoadingWorld: false, isOpen: false });
    }
  },

  closeStudio: (discardDraft = false) => {
    if (discardDraft && get().mode === 'create') {
      clearWorldStudioDraftStorage();
    }
    set({
      isOpen: false,
      isGeneratingPassport: false,
      isGeneratingPrompts: false,
      isGeneratingTemplate: false,
      isMutatingLore: false,
      loreGenProgress: null,
    });
  },

  setCurrentStep: (step) => {
    set({ currentStep: step });
    persistDraftIfCreate(get());
  },

  nextStep: () => {
    const current = get().currentStep;
    if (current < 4) {
      set({ currentStep: (current + 1) as WorldStudioStep });
      persistDraftIfCreate(get());
    }
  },

  prevStep: () => {
    const current = get().currentStep;
    if (current > 1) {
      set({ currentStep: (current - 1) as WorldStudioStep });
      persistDraftIfCreate(get());
    }
  },

  finalizeCreateWorld: async () => {
    const { mode, passport, aiPrompts, templateDraft, loreArticles, isSavingWorld } = get();
    if (mode !== 'create' || isSavingWorld) return false;
    if (isWorldActionBlockedOffline('фіналізація створення світу')) return false;

    if (!passport.title.trim()) {
      useGameStore.getState().setSystemAlert('Вкажіть назву світу на Кроці 1.', 'error');
      return false;
    }

    if (Object.keys(templateDraft || {}).length === 0) {
      useGameStore
        .getState()
        .setSystemAlert(
          'Спочатку згенеруйте або задайте шаблон анкети персонажа на Кроці 3.',
          'warning'
        );
      return false;
    }

    set({ isSavingWorld: true });
    try {
      const created = await worldsApi.wizardFinalize({
        passport: {
          ...passport,
          title: passport.title.trim(),
          genre: passport.genre.trim(),
        },
        ai_prompts: aiPrompts,
        character_template: templateDraft,
        lore_articles: loreArticles,
      });

      clearWorldStudioDraftStorage();
      set({
        isOpen: false,
        isSavingWorld: false,
        isDirty: false,
        loreGenProgress: null,
      });

      const gameStore = useGameStore.getState();
      await gameStore.selectWorld(created.world_id);
      await gameStore.loadWorlds();
      gameStore.setSystemAlert(`Світ «${created.title}» успішно створено!`, 'success');
      return true;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Помилка створення світу';
      useGameStore
        .getState()
        .setSystemAlert(`Не вдалося завершити створення світу: ${message}`, 'error');
      set({ isSavingWorld: false });
      return false;
    }
  },

  saveEditWorld: async () => {
    const {
      mode,
      editingWorldId,
      passport,
      aiPrompts,
      templateDraft,
      loreArticles,
      dirtyLoreFilenames,
      isSavingWorld,
    } = get();
    if (mode !== 'edit' || !editingWorldId || isSavingWorld) return false;
    if (isWorldActionBlockedOffline('операція збереження змін світу')) return false;

    if (!passport.title.trim()) {
      useGameStore.getState().setSystemAlert('Назва світу не може бути порожньою.', 'error');
      return false;
    }

    set({ isSavingWorld: true });
    try {
      // Спочатку дозберігаємо незбережені локальні редагування статей лору, якщо вони є
      const syncedLoreMap = new Map<string, string>();
      for (const filename of dirtyLoreFilenames) {
        const art = loreArticles.find((a) => a.filename === filename);
        if (art) {
          const syncedContent = syncLoreHeadingWithTitle(art.title, art.content);
          await worldsApi.saveLoreArticle(editingWorldId, art.filename, syncedContent);
          syncedLoreMap.set(filename, syncedContent);
        }
      }

      await worldsApi.updateWorld(editingWorldId, {
        title: passport.title.trim(),
        genre: passport.genre.trim(),
        description: passport.description,
        icon: passport.icon,
        accent_color: passport.accent_color,
        starting_locations: passport.starting_locations,
        ai_prompts: aiPrompts,
        character_template: templateDraft,
      });

      const gameStore = useGameStore.getState();
      await gameStore.loadWorlds();
      set((state) => ({
        loreArticles: state.loreArticles.map((art) => {
          const updatedContent = syncedLoreMap.get(art.filename);
          return updatedContent !== undefined ? { ...art, content: updatedContent } : art;
        }),
        isSavingWorld: false,
        isDirty: false,
        dirtyLoreFilenames: [],
      }));
      gameStore.setSystemAlert(`Зміни світу «${passport.title.trim()}» збережено`, 'success');
      return true;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Помилка збереження';
      useGameStore
        .getState()
        .setSystemAlert(`Не вдалося зберегти зміни світу: ${message}`, 'error');
      set({ isSavingWorld: false });
      return false;
    }
  },
});
