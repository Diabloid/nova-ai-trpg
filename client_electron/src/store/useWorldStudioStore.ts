import { create } from 'zustand';
import { createLifecycleSlice } from './worldStudio/lifecycleSlice';
import { createLoreSlice } from './worldStudio/loreSlice';
import { createPassportSlice } from './worldStudio/passportSlice';
import { createPromptsSlice } from './worldStudio/promptsSlice';
import { createTemplateSlice } from './worldStudio/templateSlice';
import type { WorldStudioStoreState } from './worldStudio/types';

export {
  DEFAULT_PASSPORT_DRAFT,
  DEFAULT_WORLD_PROMPTS,
  WORLD_TONE_CHIPS,
  type LoreGenProgress,
  type WorldStudioMode,
  type WorldStudioStep,
  type WorldStudioStoreState,
} from './worldStudio/types';
export { clearWorldStudioDraftStorage } from './worldStudio/helpers';

export const useWorldStudioStore = create<WorldStudioStoreState>()((...a) => ({
  ...createLifecycleSlice(...a),
  ...createPassportSlice(...a),
  ...createLoreSlice(...a),
  ...createTemplateSlice(...a),
  ...createPromptsSlice(...a),
}));
