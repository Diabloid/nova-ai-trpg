import { worldsApi } from '../../api/worldsApi';
import { addCustomSectionToState, removeSectionFromState } from '../../utils/schemaMergeUtils';
import { useGameStore } from '../useGameStore';
import {
  buildLoreDigest,
  isWorldActionBlockedOffline,
  persistDraftIfCreate,
} from './helpers';
import type { TemplateSlice, WorldStudioSliceCreator } from './types';

export const createTemplateSlice: WorldStudioSliceCreator<TemplateSlice> = (set, get) => ({
  templateDraft: {},
  demoState: {},
  templateSummaryNote: null,
  templateCustomInstruction: '',
  isJsonMode: false,
  isGeneratingTemplate: false,

  setTemplateCustomInstruction: (text) => set({ templateCustomInstruction: text }),
  setIsJsonMode: (isJsonMode) => set({ isJsonMode }),
  clearTemplateSummaryNote: () => set({ templateSummaryNote: null }),

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
    if (isWorldActionBlockedOffline('ШІ-генерація шаблону анкети')) return;

    if (!passport.title.trim()) {
      useGameStore
        .getState()
        .setSystemAlert('Спочатку вкажіть назву світу на Кроці 1.', 'warning');
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
        templateSummaryNote: response.summary_note || 'Шаблон анкети та демо-дані згенеровано',
        isJsonMode: false,
        isGeneratingTemplate: false,
        isDirty: true,
      });
      persistDraftIfCreate(get());
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
});
