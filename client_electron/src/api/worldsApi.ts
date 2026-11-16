import { apiClient } from './client';
import type {
  TemplatePreset,
  WorldDetailResponse,
  WorldSummary,
} from '../types/api';

/**
 * Read-only API-клієнт Світів та Жанрових Пресетів (Контракт v2.0.0, Етап 2A).
 */
export const worldsApi = {
  /** Отримати список усіх світів із лічильником героїв */
  getWorlds: (options?: RequestInit): Promise<WorldSummary[]> => {
    return apiClient.get<WorldSummary[]>('/worlds', options);
  },

  /** Отримати паспорт, промпти, статті лору та шаблон анкети обраного світу */
  getWorld: (worldId: string, options?: RequestInit): Promise<WorldDetailResponse> => {
    return apiClient.get<WorldDetailResponse>(`/worlds/${encodeURIComponent(worldId)}`, options);
  },

  /** Отримати список вбудованих жанрових пресетів анкет */
  getTemplatePresets: (options?: RequestInit): Promise<TemplatePreset[]> => {
    return apiClient.get<TemplatePreset[]>('/templates/presets', options);
  },
};
