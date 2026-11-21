import { create } from 'zustand';
import { createLifecycleSlice } from './world-studio/lifecycleSlice';
import { createLoreSlice } from './world-studio/loreSlice';
import { createPassportSlice } from './world-studio/passportSlice';
import { createPromptsSlice } from './world-studio/promptsSlice';
import { createTemplateSlice } from './world-studio/templateSlice';
import type { WorldStudioStoreState } from './world-studio/types';

export {
  DEFAULT_PASSPORT_DRAFT,
  DEFAULT_WORLD_PROMPTS,
  WORLD_TONE_CHIPS,
  type LoreGenProgress,
  type WorldStudioMode,
  type WorldStudioStep,
  type WorldStudioStoreState,
} from './world-studio/types';
export { clearWorldStudioDraftStorage } from './world-studio/helpers';

export const useWorldStudioStore = create<WorldStudioStoreState>()((...a) => ({
  ...createLifecycleSlice(...a),
  ...createPassportSlice(...a),
  ...createLoreSlice(...a),
  ...createTemplateSlice(...a),
  ...createPromptsSlice(...a),
}));
