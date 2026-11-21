import { create } from 'zustand';
import type { GameState } from './game/types';
import { createUiSlice } from './game/uiSlice';
import { createEntitySlice } from './game/entitySlice';
import { createGameplaySlice } from './game/gameplaySlice';
import { createWorldSlice } from './game/worldSlice';

export type { GameState };

export const useGameStore = create<GameState>()((...a) => ({
  ...createUiSlice(...a),
  ...createEntitySlice(...a),
  ...createGameplaySlice(...a),
  ...createWorldSlice(...a),
}));
