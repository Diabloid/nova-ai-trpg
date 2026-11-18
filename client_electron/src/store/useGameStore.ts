import { create } from 'zustand';
import type { GameState } from './slices/types';
import { createUiSlice } from './slices/uiSlice';
import { createEntitySlice } from './slices/entitySlice';
import { createGameplaySlice } from './slices/gameplaySlice';
import { createWorldSlice } from './slices/worldSlice';

export type { GameState };

export const useGameStore = create<GameState>()((...a) => ({
  ...createUiSlice(...a),
  ...createEntitySlice(...a),
  ...createGameplaySlice(...a),
  ...createWorldSlice(...a),
}));
