import { apiClient } from './client';
import type {
  CharacterSummary,
  PlayerState,
  CharacterDialogRequest,
  CharacterDialogResponse,
  CharacterFinalizeRequest,
} from '../types/api';

export const charactersApi = {
  /** Отримати список усіх заготовок героїв */
  getCharacters: (options?: RequestInit): Promise<CharacterSummary[]> => {
    return apiClient.get<CharacterSummary[]>('/characters', options);
  },

  /** Отримати повний лист конкретного персонажа */
  getCharacter: (charId: string, options?: RequestInit): Promise<PlayerState> => {
    return apiClient.get<PlayerState>(`/characters/${encodeURIComponent(charId)}`, options);
  },

  /** Створити заготовку персонажа вручну */
  createCharacter: (data: PlayerState, options?: RequestInit): Promise<CharacterSummary> => {
    return apiClient.post<CharacterSummary>('/characters', data, options);
  },

  /** Редагувати заготовку героя */
  updateCharacter: (charId: string, data: PlayerState, options?: RequestInit): Promise<PlayerState> => {
    return apiClient.put<PlayerState>(`/characters/${encodeURIComponent(charId)}`, data, options);
  },

  /** Видалити заготовку персонажа */
  deleteCharacter: (charId: string, options?: RequestInit): Promise<{ status: string }> => {
    return apiClient.delete<{ status: string }>(`/characters/${encodeURIComponent(charId)}`, options);
  },

  /** Діалог створення героя з AI Творцем Долі */
  characterDialog: (req: CharacterDialogRequest, options?: RequestInit): Promise<CharacterDialogResponse> => {
    return apiClient.post<CharacterDialogResponse>('/character/dialog', req, options);
  },

  /** Синхронізація ручних правок прев'ю з ШІ */
  syncDraft: (draft: PlayerState, options?: RequestInit): Promise<PlayerState> => {
    return apiClient.post<PlayerState>('/character/sync-draft', draft, options);
  },

  /** Фіналізація генерації персонажа та збереження на диск */
  finalizeCharacter: (req: CharacterFinalizeRequest, options?: RequestInit): Promise<PlayerState> => {
    return apiClient.post<PlayerState>('/character/finalize', req, options);
  },
};
