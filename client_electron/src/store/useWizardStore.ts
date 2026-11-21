import { create } from 'zustand';
import { createDialogSlice } from './wizard/dialogSlice';
import { createDraftSlice } from './wizard/draftSlice';
import { createSessionSlice } from './wizard/sessionSlice';
import type { HeaderPatch, WizardState } from './wizard/types';

export type { HeaderPatch, WizardState };

export const useWizardStore = create<WizardState>()((...a) => ({
  ...createSessionSlice(...a),
  ...createDraftSlice(...a),
  ...createDialogSlice(...a),
}));
