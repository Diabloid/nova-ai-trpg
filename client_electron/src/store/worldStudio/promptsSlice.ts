import { worldsApi } from '../../api/worldsApi';
import type { WorldAiPrompts } from '../../types/api';
import { useGameStore } from '../useGameStore';
import {
  buildLoreDigest,
  isWorldActionBlockedOffline,
  persistDraftIfCreate,
} from './helpers';
import {
  DEFAULT_WORLD_PROMPTS,
  type PromptsSlice,
  type WorldStudioSliceCreator,
} from './types';

export const createPromptsSlice: WorldStudioSliceCreator<PromptsSlice> = (set, get) => ({
  aiPrompts: { ...DEFAULT_WORLD_PROMPTS },
  aiGeneratedPromptsSnapshot: null,
  selectedToneChips: [],
  promptsCustomInstruction: '',
  isGeneratingPrompts: false,

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
      loreArticles,
      templateDraft,
      selectedToneChips,
      promptsCustomInstruction,
      aiPrompts,
      isGeneratingPrompts,
    } = get();
    if (isGeneratingPrompts) return;
    if (isWorldActionBlockedOffline('ШІ-генерація промптів')) return;

    if (!passport.title.trim()) {
      useGameStore
        .getState()
        .setSystemAlert('Спочатку вкажіть хоча б назву світу на Кроці 1.', 'warning');
      return;
    }

    set({ isGeneratingPrompts: true });

    try {
      const hasExistingPrompts = Object.values(aiPrompts).some((v) => v.trim().length > 0);
      const hasTemplate = Object.keys(templateDraft || {}).length > 0;
      const generated = await worldsApi.wizardGeneratePrompts({
        passport,
        tone_chips: selectedToneChips.length > 0 ? selectedToneChips : undefined,
        custom_instruction: promptsCustomInstruction.trim() || undefined,
        current_prompts: hasExistingPrompts ? aiPrompts : undefined,
        lore_digest: buildLoreDigest(loreArticles),
        character_template: hasTemplate ? templateDraft : undefined,
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
});
