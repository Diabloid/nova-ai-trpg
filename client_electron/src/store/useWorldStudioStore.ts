import { create } from 'zustand';
import { worldsApi } from '../api/worldsApi';
import type {
  CharacterDialogHistoryItem,
  WorldAiPrompts,
  WorldLoreDraftItem,
  WorldPassportDraft,
} from '../types/api';
import type { ChatMessage } from '../types/game';
import { formatSystemTime } from '../utils/formatTime';
import { readLoreFileWithEncoding, sanitizeLoreFilename } from '../utils/loreFileUtils';
import { normalizeLucideIconKey } from '../utils/lucideIconMap';
import {
  addCustomSectionToState,
  removeSectionFromState,
  type AddSectionInput,
} from '../utils/schemaMergeUtils';
import { useGameStore } from './useGameStore';

export type WorldStudioMode = 'create' | 'edit';
export type WorldStudioStep = 1 | 2 | 3 | 4;

const STUDIO_DRAFT_STORAGE_KEY = 'nova_world_studio_draft';

export const DEFAULT_PASSPORT_DRAFT: WorldPassportDraft = {
  title: '',
  genre: '',
  description: '',
  icon: 'globe',
  accent_color: '#7E0018',
  starting_locations: [],
};

export const DEFAULT_WORLD_PROMPTS: WorldAiPrompts = {
  world_tone: '',
  narrator_rules: '',
  analyzer_rules: '',
  creator_rules: '',
};

export const WORLD_TONE_CHIPS = [
  'Висока летальність',
  'Героїчне фентезі',
  'Інтриги та детектив',
  'Сурвайвал і дефіцит',
  'Темна містика',
] as const;

export interface LoreGenProgress {
  active: boolean;
  current: number;
  total: number;
  currentTitle: string;
}

interface PersistedWorldStudioDraft {
  currentStep: WorldStudioStep;
  passport: WorldPassportDraft;
  aiPrompts: WorldAiPrompts;
  aiGeneratedPromptsSnapshot: WorldAiPrompts | null;
  selectedToneChips: string[];
  promptsCustomInstruction: string;
  loreArticles: WorldLoreDraftItem[];
  templateDraft: Record<string, any>;
  demoState: Record<string, any>;
}

function createInitialPassportMessage(): ChatMessage {
  return {
    id: `ws-init-${Date.now()}`,
    sender: 'Архітектор Світів:',
    senderColor: '#C084FC',
    text: 'Вітаю у майстерні всесвітів! Опишіть ідею вашого світу — жанр, епоху, магію або технології, ключовий конфлікт — або скористайтеся швидкою генерацією з одного опису.',
    timeText: formatSystemTime(),
    isPlayer: false,
  };
}

function saveCreateDraftToStorage(draft: PersistedWorldStudioDraft): void {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(STUDIO_DRAFT_STORAGE_KEY, JSON.stringify(draft));
    }
  } catch {
    // ignore quota errors
  }
}

function loadCreateDraftFromStorage(): PersistedWorldStudioDraft | null {
  try {
    if (typeof localStorage !== 'undefined') {
      const raw = localStorage.getItem(STUDIO_DRAFT_STORAGE_KEY);
      if (!raw) return null;
      const parsed: unknown = JSON.parse(raw);
      if (parsed && typeof parsed === 'object' && 'passport' in parsed) {
        return parsed as PersistedWorldStudioDraft;
      }
    }
  } catch {
    // ignore corrupt draft
  }
  return null;
}

export function clearWorldStudioDraftStorage(): void {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem(STUDIO_DRAFT_STORAGE_KEY);
    }
  } catch {
    // ignore storage errors
  }
}

function makeUniqueLoreFilename(
  rawName: string,
  existingArticles: WorldLoreDraftItem[],
  fallbackExt: '.md' | '.txt' = '.md'
): string {
  const sanitized = sanitizeLoreFilename(rawName, fallbackExt);
  const existingSet = new Set(existingArticles.map((a) => a.filename.toLowerCase()));
  if (!existingSet.has(sanitized.toLowerCase())) {
    return sanitized;
  }

  const extMatch = sanitized.match(/\.(md|txt)$/i);
  const ext = extMatch ? extMatch[0] : fallbackExt;
  const stem = extMatch ? sanitized.slice(0, -ext.length) : sanitized;
  let counter = 2;
  let candidate = `${stem}_${counter}${ext}`;
  while (existingSet.has(candidate.toLowerCase())) {
    counter += 1;
    candidate = `${stem}_${counter}${ext}`;
  }
  return candidate;
}

function buildLoreDigest(articles: WorldLoreDraftItem[]): string | undefined {
  if (!articles || articles.length === 0) return undefined;
  const chunks: string[] = [];
  let totalLen = 0;

  for (const article of articles) {
    const snippet = (article.content || '').replace(/\s+/g, ' ').trim().slice(0, 320);
    const line = `- ${article.title}: ${snippet}`;
    if (totalLen + line.length > 2600) break;
    chunks.push(line);
    totalLen += line.length;
  }

  return chunks.length > 0 ? chunks.join('\n') : undefined;
}

function syncLoreHeadingWithTitle(title: string, content: string): string {
  const cleanTitle = title.trim();
  if (!cleanTitle) return content;

  if (/^\s*#\s+.*(\r?\n|$)/.test(content)) {
    return content.replace(/^\s*#\s+.*(\r?\n|$)/, `# ${cleanTitle}$1`);
  }
  const trimmedBody = content.trimStart();
  return trimmedBody ? `# ${cleanTitle}\n\n${trimmedBody}` : `# ${cleanTitle}\n\n`;
}

interface WorldStudioStoreState {
  isOpen: boolean;
  mode: WorldStudioMode;
  editingWorldId: string | null;
  currentStep: WorldStudioStep;

  isLoadingWorld: boolean;
  isSavingWorld: boolean;
  isDirty: boolean;

  // Крок 1: Паспорт + AI-діалог
  passport: WorldPassportDraft;
  passportMessages: ChatMessage[];
  passportInput: string;
  oneShotDescription: string;
  isGeneratingPassport: boolean;

  // Крок 2: Промпти ШІ
  aiPrompts: WorldAiPrompts;
  aiGeneratedPromptsSnapshot: WorldAiPrompts | null;
  selectedToneChips: string[];
  promptsCustomInstruction: string;
  isGeneratingPrompts: boolean;

  // Крок 3: База Лору
  loreArticles: WorldLoreDraftItem[];
  selectedLoreFilename: string | null;
  dirtyLoreFilenames: string[];
  loreGenProgress: LoreGenProgress | null;
  isMutatingLore: boolean;

  // Крок 4: Шаблон Анкети та Прев'ю
  templateDraft: Record<string, any>;
  demoState: Record<string, any>;
  templateSummaryNote: string | null;
  templateCustomInstruction: string;
  isJsonMode: boolean;
  isGeneratingTemplate: boolean;

  // Дії навігації й режимів
  openCreateStudio: () => void;
  openEditStudio: (worldId: string) => Promise<void>;
  closeStudio: (discardDraft?: boolean) => void;

  setCurrentStep: (step: WorldStudioStep) => void;
  nextStep: () => void;
  prevStep: () => void;

  // Крок 1
  updatePassport: (patch: Partial<WorldPassportDraft>) => void;
  addStartingLocation: (location: string) => void;
  removeStartingLocation: (index: number) => void;
  updateStartingLocation: (index: number, value: string) => void;
  setPassportInput: (text: string) => void;
  setOneShotDescription: (text: string) => void;
  sendPassportDialog: (rawMessage: string) => Promise<void>;
  generatePassportOneShot: (rawDescription?: string) => Promise<void>;

  // Крок 2
  toggleToneChip: (chip: string) => void;
  setPromptsCustomInstruction: (text: string) => void;
  updateAiPromptField: (field: keyof WorldAiPrompts, value: string) => void;
  generateAiPrompts: () => Promise<void>;
  resetPromptToAi: (field?: keyof WorldAiPrompts) => void;

  // Крок 3
  setSelectedLoreFilename: (filename: string | null) => void;
  updateLoreArticleLocal: (
    filename: string,
    patch: { title?: string; content?: string }
  ) => void;
  saveLoreArticleRemote: (filename: string) => Promise<boolean>;
  createManualLoreArticle: (title: string) => Promise<void>;
  createAiLoreArticle: (topicText: string) => Promise<void>;
  generateStarterLore: () => Promise<void>;
  expandLoreArticle: (filename: string, instruction: string) => Promise<void>;
  importLoreFile: (file: File) => Promise<void>;
  deleteLoreArticleItem: (filename: string) => Promise<void>;

  // Крок 4 і збереження
  setTemplateCustomInstruction: (text: string) => void;
  setIsJsonMode: (isJsonMode: boolean) => void;
  generateWorldTemplate: (customInstruction?: string) => Promise<void>;
  addTemplateSection: (input: AddSectionInput) => void;
  removeTemplateSection: (sectionPath: string) => void;
  applyTemplateJson: (rawJson: string) => { ok: boolean; error?: string };
  finalizeCreateWorld: () => Promise<boolean>;
  saveEditWorld: () => Promise<boolean>;
}

function persistDraftIfCreate(state: WorldStudioStoreState): void {
  if (state.mode !== 'create' || !state.isOpen) return;
  saveCreateDraftToStorage({
    currentStep: state.currentStep,
    passport: state.passport,
    aiPrompts: state.aiPrompts,
    aiGeneratedPromptsSnapshot: state.aiGeneratedPromptsSnapshot,
    selectedToneChips: state.selectedToneChips,
    promptsCustomInstruction: state.promptsCustomInstruction,
    loreArticles: state.loreArticles,
    templateDraft: state.templateDraft,
    demoState: state.demoState,
  });
}

export const useWorldStudioStore = create<WorldStudioStoreState>((set, get) => ({
  isOpen: false,
  mode: 'create',
  editingWorldId: null,
  currentStep: 1,

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
  selectedToneChips: [],
  promptsCustomInstruction: '',
  isGeneratingPrompts: false,

  loreArticles: [],
  selectedLoreFilename: null,
  dirtyLoreFilenames: [],
  loreGenProgress: null,
  isMutatingLore: false,

  templateDraft: {},
  demoState: {},
  templateSummaryNote: null,
  templateCustomInstruction: '',
  isJsonMode: false,
  isGeneratingTemplate: false,

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
        isOpen: true,
        mode: 'create',
        editingWorldId: null,
        currentStep: saved.currentStep || 1,
        isLoadingWorld: false,
        isSavingWorld: false,
        isDirty: hasDraftContent,
        passport: {
          ...DEFAULT_PASSPORT_DRAFT,
          ...saved.passport,
          icon: normalizeLucideIconKey(saved.passport?.icon, 'globe'),
          starting_locations: Array.isArray(saved.passport?.starting_locations)
            ? saved.passport.starting_locations
            : [],
        },
        passportMessages: [createInitialPassportMessage()],
        passportInput: '',
        oneShotDescription: '',
        isGeneratingPassport: false,
        aiPrompts: { ...DEFAULT_WORLD_PROMPTS, ...saved.aiPrompts },
        aiGeneratedPromptsSnapshot: saved.aiGeneratedPromptsSnapshot || null,
        selectedToneChips: Array.isArray(saved.selectedToneChips) ? saved.selectedToneChips : [],
        promptsCustomInstruction: saved.promptsCustomInstruction || '',
        isGeneratingPrompts: false,
        loreArticles: Array.isArray(saved.loreArticles) ? saved.loreArticles : [],
        selectedLoreFilename: saved.loreArticles?.[0]?.filename || null,
        dirtyLoreFilenames: [],
        loreGenProgress: null,
        isMutatingLore: false,
        templateDraft: saved.templateDraft || {},
        demoState: saved.demoState || {},
        templateSummaryNote: null,
        templateCustomInstruction: '',
        isJsonMode: false,
        isGeneratingTemplate: false,
      });
      return;
    }

    set({
      isOpen: true,
      mode: 'create',
      editingWorldId: null,
      currentStep: 1,
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
      selectedToneChips: [],
      promptsCustomInstruction: '',
      isGeneratingPrompts: false,
      loreArticles: [],
      selectedLoreFilename: null,
      dirtyLoreFilenames: [],
      loreGenProgress: null,
      isMutatingLore: false,
      templateDraft: {},
      demoState: {},
      templateSummaryNote: null,
      templateCustomInstruction: '',
      isJsonMode: false,
      isGeneratingTemplate: false,
    });
  },

  openEditStudio: async (worldId: string) => {
    useGameStore.setState({ isSidebarOpen: false, isCharacterDrawerOpen: false });

    set({
      isOpen: true,
      mode: 'edit',
      editingWorldId: worldId,
      currentStep: 1,
      isLoadingWorld: true,
      isSavingWorld: false,
      isDirty: false,
      passport: { ...DEFAULT_PASSPORT_DRAFT },
      passportMessages: [createInitialPassportMessage()],
      passportInput: '',
      oneShotDescription: '',
      isGeneratingPassport: false,
      aiPrompts: { ...DEFAULT_WORLD_PROMPTS },
      aiGeneratedPromptsSnapshot: null,
      selectedToneChips: [],
      promptsCustomInstruction: '',
      isGeneratingPrompts: false,
      loreArticles: [],
      selectedLoreFilename: null,
      dirtyLoreFilenames: [],
      loreGenProgress: null,
      isMutatingLore: false,
      templateDraft: {},
      demoState: {},
      templateSummaryNote: null,
      templateCustomInstruction: '',
      isJsonMode: false,
      isGeneratingTemplate: false,
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
        aiGeneratedPromptsSnapshot: { ...prompts },
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

  toggleToneChip: (chip) => {
    set((state) => {
      const exists = state.selectedToneChips.includes(chip);
      return {
        selectedToneChips: exists
          ? state.selectedToneChips.filter((c) => c !== chip)
          : [...state.selectedToneChips, chip],
      };
    });
    persistDraftIfCreate(get());
  },

  setPromptsCustomInstruction: (text) => {
    set({ promptsCustomInstruction: text });
    persistDraftIfCreate(get());
  },

  updateAiPromptField: (field, value) => {
    set((state) => ({
      aiPrompts: {
        ...state.aiPrompts,
        [field]: value,
      },
      isDirty: true,
    }));
    persistDraftIfCreate(get());
  },

  generateAiPrompts: async () => {
    const {
      passport,
      selectedToneChips,
      promptsCustomInstruction,
      aiPrompts,
      isGeneratingPrompts,
    } = get();
    if (isGeneratingPrompts) return;

    if (!passport.title.trim()) {
      useGameStore
        .getState()
        .setSystemAlert('Спочатку вкажіть хоча б назву світу на Кроці 1.', 'info');
      return;
    }

    set({ isGeneratingPrompts: true });

    try {
      const hasExistingPrompts = Object.values(aiPrompts).some((v) => v.trim().length > 0);
      const generated = await worldsApi.wizardGeneratePrompts({
        passport,
        tone_chips: selectedToneChips.length > 0 ? selectedToneChips : undefined,
        custom_instruction: promptsCustomInstruction.trim() || undefined,
        current_prompts: hasExistingPrompts ? aiPrompts : undefined,
      });

      const normalized: WorldAiPrompts = {
        world_tone: generated.world_tone || '',
        narrator_rules: generated.narrator_rules || '',
        analyzer_rules: generated.analyzer_rules || '',
        creator_rules: generated.creator_rules || '',
      };

      set({
        aiPrompts: normalized,
        aiGeneratedPromptsSnapshot: { ...normalized },
        isDirty: true,
        isGeneratingPrompts: false,
      });
      persistDraftIfCreate(get());
      useGameStore.getState().setSystemAlert('Правила ШІ для світу згенеровано', 'success');
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Помилка генерації промптів';
      useGameStore
        .getState()
        .setSystemAlert(`Не вдалося згенерувати промпти ШІ: ${message}`, 'error');
      set({ isGeneratingPrompts: false });
    }
  },

  resetPromptToAi: (field) => {
    const snapshot = get().aiGeneratedPromptsSnapshot;
    if (!snapshot) return;

    set((state) => {
      if (field) {
        return {
          aiPrompts: {
            ...state.aiPrompts,
            [field]: snapshot[field],
          },
          isDirty: true,
        };
      }
      return {
        aiPrompts: { ...snapshot },
        isDirty: true,
      };
    });
    persistDraftIfCreate(get());
  },

  // --- КРОК 3: БАЗА ЛОРУ ---

  setSelectedLoreFilename: (filename) => set({ selectedLoreFilename: filename }),

  updateLoreArticleLocal: (filename, patch) => {
    set((state) => {
      const nextArticles = state.loreArticles.map((art) =>
        art.filename === filename ? { ...art, ...patch } : art
      );
      const nextDirtyLore =
        state.mode === 'edit' && !state.dirtyLoreFilenames.includes(filename)
          ? [...state.dirtyLoreFilenames, filename]
          : state.dirtyLoreFilenames;
      return {
        loreArticles: nextArticles,
        dirtyLoreFilenames: nextDirtyLore,
        isDirty: true,
      };
    });
    persistDraftIfCreate(get());
  },

  saveLoreArticleRemote: async (filename) => {
    const { mode, editingWorldId, loreArticles } = get();
    if (mode !== 'edit' || !editingWorldId) return true;
    const article = loreArticles.find((a) => a.filename === filename);
    if (!article) return false;

    const syncedContent = syncLoreHeadingWithTitle(article.title, article.content);
    set({ isMutatingLore: true });
    try {
      await worldsApi.saveLoreArticle(editingWorldId, article.filename, syncedContent);
      set((state) => ({
        loreArticles: state.loreArticles.map((a) =>
          a.filename === filename ? { ...a, content: syncedContent } : a
        ),
        dirtyLoreFilenames: state.dirtyLoreFilenames.filter((f) => f !== filename),
        isMutatingLore: false,
      }));
      useGameStore.getState().setSystemAlert(`Статтю «${article.title}» збережено`, 'success');
      return true;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Помилка збереження статті';
      useGameStore
        .getState()
        .setSystemAlert(`Не вдалося зберегти статтю: ${message}`, 'error');
      set({ isMutatingLore: false });
      return false;
    }
  },

  createManualLoreArticle: async (title) => {
    const cleanTitle = title.trim();
    if (!cleanTitle) return;

    const { mode, editingWorldId, loreArticles } = get();
    const filename = makeUniqueLoreFilename(cleanTitle, loreArticles, '.md');
    const newItem: WorldLoreDraftItem = {
      filename,
      title: cleanTitle,
      content: `# ${cleanTitle}\n\n`,
    };

    if (mode === 'edit' && editingWorldId) {
      set({ isMutatingLore: true });
      try {
        await worldsApi.saveLoreArticle(editingWorldId, filename, newItem.content);
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Помилка створення статті';
        useGameStore.getState().setSystemAlert(message, 'error');
        set({ isMutatingLore: false });
        return;
      }
    }

    set((state) => ({
      loreArticles: [...state.loreArticles, newItem],
      selectedLoreFilename: filename,
      isMutatingLore: false,
      isDirty: true,
    }));
    persistDraftIfCreate(get());
  },

  createAiLoreArticle: async (topicText) => {
    const cleanTopic = topicText.trim();
    if (!cleanTopic || get().isMutatingLore || get().loreGenProgress?.active) return;

    const { mode, editingWorldId, passport, aiPrompts, loreArticles } = get();
    const hasPrompts = Object.values(aiPrompts).some((v) => v.trim().length > 0);
    const candidateFilename = makeUniqueLoreFilename(cleanTopic, loreArticles, '.md');

    set({ isMutatingLore: true });
    try {
      const res = await worldsApi.wizardGenerateLore({
        mode: 'generate_article',
        passport,
        ai_prompts: hasPrompts ? aiPrompts : undefined,
        topic: cleanTopic,
        filename: candidateFilename,
        existing_titles: loreArticles.map((a) => a.title),
      });

      const generated = res.article;
      if (!generated) {
        throw new Error('ШІ не повернув текст статті');
      }

      const uniqueFilename = makeUniqueLoreFilename(
        generated.filename || candidateFilename,
        loreArticles,
        '.md'
      );
      const item: WorldLoreDraftItem = {
        filename: uniqueFilename,
        title: generated.title || cleanTopic,
        content: generated.content || `# ${cleanTopic}\n`,
      };

      if (mode === 'edit' && editingWorldId) {
        await worldsApi.saveLoreArticle(editingWorldId, item.filename, item.content);
      }

      set((state) => ({
        loreArticles: [...state.loreArticles, item],
        selectedLoreFilename: item.filename,
        isMutatingLore: false,
        isDirty: true,
      }));
      persistDraftIfCreate(get());
      useGameStore
        .getState()
        .setSystemAlert(`Статтю «${item.title}» згенеровано`, 'success');
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Помилка генерації статті';
      useGameStore
        .getState()
        .setSystemAlert(`Не вдалося згенерувати статтю лору: ${message}`, 'error');
      set({ isMutatingLore: false });
    }
  },

  generateStarterLore: async () => {
    const { passport, aiPrompts, mode, editingWorldId, loreGenProgress, isMutatingLore } = get();
    if (loreGenProgress?.active || isMutatingLore) return;

    if (!passport.title.trim()) {
      useGameStore
        .getState()
        .setSystemAlert('Спочатку вкажіть назву світу на Кроці 1.', 'info');
      return;
    }

    const hasPrompts = Object.values(aiPrompts).some((v) => v.trim().length > 0);
    set({
      loreGenProgress: {
        active: true,
        current: 0,
        total: 5,
        currentTitle: 'Планування 5 тем лору...',
      },
    });

    try {
      const planRes = await worldsApi.wizardGenerateLore({
        mode: 'plan_topics',
        passport,
        ai_prompts: hasPrompts ? aiPrompts : undefined,
        existing_titles: get().loreArticles.map((a) => a.title),
      });

      const topics = Array.isArray(planRes.topics) ? planRes.topics : [];
      if (topics.length === 0) {
        throw new Error('Не вдалося сформувати список тем для лору');
      }

      for (let i = 0; i < topics.length; i++) {
        const topicItem = topics[i];
        set({
          loreGenProgress: {
            active: true,
            current: i + 1,
            total: topics.length,
            currentTitle: topicItem.title,
          },
        });

        const currentArticles = get().loreArticles;
        const articleRes = await worldsApi.wizardGenerateLore({
          mode: 'generate_article',
          passport,
          ai_prompts: hasPrompts ? aiPrompts : undefined,
          topic: topicItem.brief
            ? `${topicItem.title} — ${topicItem.brief}`
            : topicItem.title,
          filename: topicItem.filename,
          existing_titles: currentArticles.map((a) => a.title),
        });

        if (articleRes.article) {
          const uniqueFilename = makeUniqueLoreFilename(
            articleRes.article.filename || topicItem.filename,
            currentArticles,
            '.md'
          );
          const draftItem: WorldLoreDraftItem = {
            filename: uniqueFilename,
            title: articleRes.article.title || topicItem.title,
            content: articleRes.article.content || '',
          };

          if (mode === 'edit' && editingWorldId) {
            await worldsApi.saveLoreArticle(
              editingWorldId,
              draftItem.filename,
              draftItem.content
            );
          }

          set((state) => ({
            loreArticles: [...state.loreArticles, draftItem],
            selectedLoreFilename: state.selectedLoreFilename || draftItem.filename,
            isDirty: true,
          }));
          persistDraftIfCreate(get());
        }
      }

      set({ loreGenProgress: null });
      useGameStore
        .getState()
        .setSystemAlert(`Згенеровано ${topics.length} стартових статей лору`, 'success');
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Помилка генерації лору';
      useGameStore
        .getState()
        .setSystemAlert(`Помилка генерації стартового лору: ${message}`, 'error');
      set({ loreGenProgress: null });
    }
  },

  expandLoreArticle: async (filename, instruction) => {
    const cleanInstruction = instruction.trim();
    if (!cleanInstruction || get().isMutatingLore || get().loreGenProgress?.active) return;

    const { mode, editingWorldId, passport, aiPrompts, loreArticles } = get();
    const target = loreArticles.find((a) => a.filename === filename);
    if (!target) return;

    const hasPrompts = Object.values(aiPrompts).some((v) => v.trim().length > 0);
    set({ isMutatingLore: true });

    try {
      const res = await worldsApi.wizardGenerateLore({
        mode: 'expand_article',
        passport,
        ai_prompts: hasPrompts ? aiPrompts : undefined,
        topic: target.title,
        filename: target.filename,
        existing_content: target.content,
        instruction: cleanInstruction,
      });

      const updated = res.article;
      if (!updated) {
        throw new Error('ШІ не повернув оновлений текст статті');
      }

      const nextTitle = updated.title || target.title;
      const nextContent = updated.content || target.content;

      if (mode === 'edit' && editingWorldId) {
        await worldsApi.saveLoreArticle(editingWorldId, target.filename, nextContent);
      }

      set((state) => ({
        loreArticles: state.loreArticles.map((art) =>
          art.filename === filename
            ? { ...art, title: nextTitle, content: nextContent }
            : art
        ),
        dirtyLoreFilenames: state.dirtyLoreFilenames.filter((f) => f !== filename),
        isMutatingLore: false,
        isDirty: true,
      }));
      persistDraftIfCreate(get());
      useGameStore
        .getState()
        .setSystemAlert(`Статтю «${nextTitle}» оновлено за допомогою ШІ`, 'success');
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Помилка розширення статті';
      useGameStore
        .getState()
        .setSystemAlert(`Не вдалося доповнити статтю: ${message}`, 'error');
      set({ isMutatingLore: false });
    }
  },

  importLoreFile: async (file) => {
    const { mode, editingWorldId } = get();
    set({ isMutatingLore: true });

    try {
      const parsed = await readLoreFileWithEncoding(file);
      const uniqueFilename = makeUniqueLoreFilename(
        parsed.filename,
        get().loreArticles,
        parsed.filename.endsWith('.txt') ? '.txt' : '.md'
      );

      const newItem: WorldLoreDraftItem = {
        filename: uniqueFilename,
        title: parsed.title,
        content: parsed.content,
      };

      if (mode === 'edit' && editingWorldId) {
        await worldsApi.saveLoreArticle(editingWorldId, newItem.filename, newItem.content);
      }

      set((state) => ({
        loreArticles: [...state.loreArticles, newItem],
        selectedLoreFilename: newItem.filename,
        isMutatingLore: false,
        isDirty: true,
      }));
      persistDraftIfCreate(get());
      useGameStore
        .getState()
        .setSystemAlert(
          `Файл «${file.name}» імпортовано (${parsed.encoding})`,
          'success'
        );
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Помилка імпорту файлу';
      useGameStore.getState().setSystemAlert(message, 'error');
      set({ isMutatingLore: false });
    }
  },

  deleteLoreArticleItem: async (filename) => {
    const { mode, editingWorldId, loreArticles, selectedLoreFilename } = get();

    if (mode === 'edit' && editingWorldId) {
      set({ isMutatingLore: true });
      try {
        await worldsApi.deleteLoreArticle(editingWorldId, filename);
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Помилка видалення статті';
        useGameStore.getState().setSystemAlert(message, 'error');
        set({ isMutatingLore: false });
        return;
      }
    }

    const remaining = loreArticles.filter((a) => a.filename !== filename);
    const nextSelected =
      selectedLoreFilename === filename
        ? remaining[0]?.filename || null
        : selectedLoreFilename;

    set((state) => ({
      loreArticles: remaining,
      selectedLoreFilename: nextSelected,
      dirtyLoreFilenames: state.dirtyLoreFilenames.filter((f) => f !== filename),
      isMutatingLore: false,
      isDirty: true,
    }));
    persistDraftIfCreate(get());
  },

  // --- КРОК 4: ШАБЛОН АНКЕТИ ТА ФІНАЛІЗАЦІЯ ---

  setTemplateCustomInstruction: (text) => set({ templateCustomInstruction: text }),
  setIsJsonMode: (isJsonMode) => set({ isJsonMode }),

  generateWorldTemplate: async (customInstruction?: string) => {
    const {
      passport,
      aiPrompts,
      loreArticles,
      templateDraft,
      templateCustomInstruction,
      isGeneratingTemplate,
    } = get();
    if (isGeneratingTemplate) return;

    if (!passport.title.trim()) {
      useGameStore
        .getState()
        .setSystemAlert('Спочатку вкажіть назву світу на Кроці 1.', 'info');
      return;
    }

    const instruction = (customInstruction ?? templateCustomInstruction).trim();
    const hasPrompts = Object.values(aiPrompts).some((v) => v.trim().length > 0);
    const hasTemplate = Object.keys(templateDraft || {}).length > 0;

    set({ isGeneratingTemplate: true });

    try {
      const response = await worldsApi.wizardGenerateTemplate({
        passport,
        ai_prompts: hasPrompts ? aiPrompts : undefined,
        lore_digest: buildLoreDigest(loreArticles),
        custom_instruction: instruction || undefined,
        current_template: hasTemplate ? templateDraft : undefined,
      });

      set({
        templateDraft: response.character_template || {},
        demoState: response.demo_state || {},
        templateSummaryNote: response.summary_note || null,
        isJsonMode: false,
        isGeneratingTemplate: false,
        isDirty: true,
      });
      persistDraftIfCreate(get());
      useGameStore
        .getState()
        .setSystemAlert('Шаблон анкети та демо-дані згенеровано', 'success');
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Помилка генерації шаблону';
      useGameStore
        .getState()
        .setSystemAlert(`Не вдалося згенерувати шаблон анкети: ${message}`, 'error');
      set({ isGeneratingTemplate: false });
    }
  },

  addTemplateSection: (input) => {
    set((state) => {
      const baseTemplate =
        state.templateDraft &&
        typeof state.templateDraft === 'object' &&
        'meta' in state.templateDraft
          ? state.templateDraft
          : {
              ...state.templateDraft,
              meta: {
                name: '',
                location: state.passport.starting_locations[0] || '',
                overall_state: 'Нормальний стан',
              },
            };

      const { nextState, sectionPath } = addCustomSectionToState(baseTemplate, input);
      const hasDemo = Object.keys(state.demoState || {}).length > 0;
      const nextDemo: Record<string, any> = hasDemo
        ? addCustomSectionToState(state.demoState, input, nextState._schema_meta).nextState
        : {};

      if (hasDemo && nextState._schema_meta) {
        nextDemo._schema_meta = JSON.parse(JSON.stringify(nextState._schema_meta));
      }

      return {
        templateDraft: nextState,
        demoState: hasDemo ? nextDemo : state.demoState,
        templateSummaryNote: `Додано секцію «${input.title.trim()}» (${sectionPath})`,
        isDirty: true,
      };
    });
    persistDraftIfCreate(get());
  },

  removeTemplateSection: (sectionPath) => {
    set((state) => {
      const nextTemplate = removeSectionFromState(state.templateDraft, sectionPath);
      const nextDemo =
        Object.keys(state.demoState || {}).length > 0
          ? removeSectionFromState(state.demoState, sectionPath, nextTemplate._schema_meta)
          : state.demoState;

      return {
        templateDraft: nextTemplate,
        demoState: nextDemo,
        isDirty: true,
      };
    });
    persistDraftIfCreate(get());
  },

  applyTemplateJson: (rawJson) => {
    try {
      const parsed: unknown = JSON.parse(rawJson);
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        return {
          ok: false,
          error: 'Кореневим елементом шаблону повинен бути JSON-об’єкт.',
        };
      }

      const templateObj = parsed as Record<string, any>;
      set((state) => {
        const syncedDemo =
          Object.keys(state.demoState || {}).length > 0 && templateObj._schema_meta
            ? {
                ...state.demoState,
                _schema_meta: JSON.parse(JSON.stringify(templateObj._schema_meta)),
              }
            : state.demoState;

        return {
          templateDraft: templateObj,
          demoState: syncedDemo,
          isDirty: true,
        };
      });
      persistDraftIfCreate(get());
      useGameStore.getState().setSystemAlert('JSON шаблону застосовано', 'success');
      return { ok: true };
    } catch (err: unknown) {
      return {
        ok: false,
        error: err instanceof Error ? err.message : 'Некоректний синтаксис JSON',
      };
    }
  },

  finalizeCreateWorld: async () => {
    const { mode, passport, aiPrompts, templateDraft, loreArticles, isSavingWorld } = get();
    if (mode !== 'create' || isSavingWorld) return false;

    if (!passport.title.trim()) {
      useGameStore.getState().setSystemAlert('Вкажіть назву світу на Кроці 1.', 'error');
      return false;
    }

    if (Object.keys(templateDraft || {}).length === 0) {
      useGameStore
        .getState()
        .setSystemAlert(
          'Спочатку згенеруйте або задайте шаблон анкети персонажа на Кроці 4.',
          'info'
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
}));
