import type { StateCreator } from 'zustand';
import type {
  WorldAiPrompts,
  WorldLoreDraftItem,
  WorldPassportDraft,
} from '../../types/api';
import type { ChatMessage } from '../../types/game';
import type { AddSectionInput } from '../../utils/schemaMergeUtils';

export type WorldStudioMode = 'create' | 'edit';
export type WorldStudioStep = 1 | 2 | 3 | 4;

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

export interface PersistedWorldStudioDraft {
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

export interface PassportSlice {
  passport: WorldPassportDraft;
  passportMessages: ChatMessage[];
  passportInput: string;
  oneShotDescription: string;
  isGeneratingPassport: boolean;

  updatePassport: (patch: Partial<WorldPassportDraft>) => void;
  addStartingLocation: (location: string) => void;
  removeStartingLocation: (index: number) => void;
  updateStartingLocation: (index: number, value: string) => void;
  setPassportInput: (text: string) => void;
  setOneShotDescription: (text: string) => void;
  sendPassportDialog: (rawMessage: string) => Promise<void>;
  generatePassportOneShot: (rawDescription?: string) => Promise<void>;
}

export interface LoreSlice {
  loreArticles: WorldLoreDraftItem[];
  selectedLoreFilename: string | null;
  dirtyLoreFilenames: string[];
  loreGenProgress: LoreGenProgress | null;
  isMutatingLore: boolean;

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
}

export interface TemplateSlice {
  templateDraft: Record<string, any>;
  demoState: Record<string, any>;
  templateSummaryNote: string | null;
  templateCustomInstruction: string;
  isJsonMode: boolean;
  isGeneratingTemplate: boolean;

  setTemplateCustomInstruction: (text: string) => void;
  setIsJsonMode: (isJsonMode: boolean) => void;
  clearTemplateSummaryNote: () => void;
  generateWorldTemplate: (customInstruction?: string) => Promise<void>;
  addTemplateSection: (input: AddSectionInput) => void;
  removeTemplateSection: (sectionPath: string) => void;
  applyTemplateJson: (rawJson: string) => { ok: boolean; error?: string };
}

export interface PromptsSlice {
  aiPrompts: WorldAiPrompts;
  aiGeneratedPromptsSnapshot: WorldAiPrompts | null;
  selectedToneChips: string[];
  promptsCustomInstruction: string;
  isGeneratingPrompts: boolean;

  toggleToneChip: (chip: string) => void;
  setPromptsCustomInstruction: (text: string) => void;
  updateAiPromptField: (field: keyof WorldAiPrompts, value: string) => void;
  generateAiPrompts: () => Promise<void>;
  resetPromptToAi: (field?: keyof WorldAiPrompts) => void;
}

export interface LifecycleSlice {
  isOpen: boolean;
  mode: WorldStudioMode;
  editingWorldId: string | null;
  currentStep: WorldStudioStep;
  isLoadingWorld: boolean;
  isSavingWorld: boolean;
  isDirty: boolean;

  openCreateStudio: () => void;
  openEditStudio: (worldId: string) => Promise<void>;
  closeStudio: (discardDraft?: boolean) => void;
  setCurrentStep: (step: WorldStudioStep) => void;
  nextStep: () => void;
  prevStep: () => void;
  finalizeCreateWorld: () => Promise<boolean>;
  saveEditWorld: () => Promise<boolean>;
}

export type WorldStudioStoreState = LifecycleSlice &
  PassportSlice &
  LoreSlice &
  TemplateSlice &
  PromptsSlice;

export type WorldStudioSliceCreator<TSlice> = StateCreator<
  WorldStudioStoreState,
  [],
  [],
  TSlice
>;
