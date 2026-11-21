import { ApiError, apiClient } from './client';
import type {
  CharacterTemplateDraftResponse,
  LoreArticleResponse,
  TemplatePreset,
  TranslateKeysResponse,
  WorldAiPrompts,
  WorldCloneRequest,
  WorldCreateRequest,
  WorldDeleteConflict,
  WorldDetailResponse,
  WorldFinalizeRequest,
  WorldLoreGenRequest,
  WorldLoreGenResponse,
  WorldPassportDraftResponse,
  WorldPromptsGenRequest,
  WorldSummary,
  WorldTemplateGenRequest,
  WorldUpdateRequest,
  WorldWizardStepRequest,
} from '../types/api';

/**
 * Спеціалізована помилка видалення світу (HTTP 409 Conflict),
 * що несе кількість залежних персонажів та кампаній для модалки підтвердження.
 */
export class WorldDeleteConflictError extends ApiError {
  conflict: WorldDeleteConflict;

  constructor(conflict: WorldDeleteConflict) {
    super(conflict.detail || 'У світі є залежні персонажі або кампанії', 409, conflict);
    this.name = 'WorldDeleteConflictError';
    this.conflict = conflict;
  }
}

/**
 * Безпечний type-guard для витягування WorldDeleteConflict із помилки deleteWorld.
 */
export function extractWorldDeleteConflict(err: unknown): WorldDeleteConflict | null {
  if (err instanceof WorldDeleteConflictError) {
    return err.conflict;
  }
  if (err instanceof ApiError && err.status === 409 && err.data && typeof err.data === 'object') {
    const data = err.data as Record<string, unknown>;
    return {
      detail: typeof data.detail === 'string' ? data.detail : err.message,
      world_id: typeof data.world_id === 'string' ? data.world_id : '',
      dependent_characters:
        typeof data.dependent_characters === 'number' ? data.dependent_characters : 0,
      dependent_campaigns:
        typeof data.dependent_campaigns === 'number' ? data.dependent_campaigns : 0,
    };
  }
  return null;
}

/**
 * Повний API-клієнт Світів, Бази Лору, Пресетів та 4-Крокового AI-Майстра Світів.
 */
export const worldsApi = {
  // --- СВІТИ (CRUD) ---

  /** Отримати список усіх світів із лічильником героїв */
  getWorlds: (options?: RequestInit): Promise<WorldSummary[]> => {
    return apiClient.get<WorldSummary[]>('/worlds', options);
  },

  /** Отримати паспорт, промпти, статті лору та шаблон анкети обраного світу */
  getWorld: (worldId: string, options?: RequestInit): Promise<WorldDetailResponse> => {
    return apiClient.get<WorldDetailResponse>(`/worlds/${encodeURIComponent(worldId)}`, options);
  },

  /** Створити світ вручну */
  createWorld: (data: WorldCreateRequest, options?: RequestInit): Promise<WorldSummary> => {
    return apiClient.post<WorldSummary>('/worlds', data, options);
  },

  /** Оновити паспорт, ai_prompts або character_template існуючого світу */
  updateWorld: (
    worldId: string,
    data: WorldUpdateRequest,
    options?: RequestInit
  ): Promise<WorldDetailResponse> => {
    return apiClient.put<WorldDetailResponse>(
      `/worlds/${encodeURIComponent(worldId)}`,
      data,
      options
    );
  },

  /** Клонувати існуючий світ як базу для нового */
  cloneWorld: (
    worldId: string,
    data: WorldCloneRequest,
    options?: RequestInit
  ): Promise<WorldSummary> => {
    return apiClient.post<WorldSummary>(
      `/worlds/${encodeURIComponent(worldId)}/clone`,
      data,
      options
    );
  },

  /**
   * Видалити кастомний світ. При наявності героїв чи кампаній і cascade=false
   * кидає типізований WorldDeleteConflictError (HTTP 409).
   */
  deleteWorld: async (
    worldId: string,
    cascade = false,
    options?: RequestInit
  ): Promise<{ status: string; world_id: string }> => {
    const query = cascade ? '?cascade=true' : '';
    try {
      return await apiClient.delete<{ status: string; world_id: string }>(
        `/worlds/${encodeURIComponent(worldId)}${query}`,
        options
      );
    } catch (err: unknown) {
      if (err instanceof ApiError && err.status === 409) {
        const data = (err.data && typeof err.data === 'object' ? err.data : {}) as Record<
          string,
          unknown
        >;
        throw new WorldDeleteConflictError({
          detail: typeof data.detail === 'string' ? data.detail : err.message,
          world_id: typeof data.world_id === 'string' ? data.world_id : worldId,
          dependent_characters:
            typeof data.dependent_characters === 'number' ? data.dependent_characters : 0,
          dependent_campaigns:
            typeof data.dependent_campaigns === 'number' ? data.dependent_campaigns : 0,
        });
      }
      throw err;
    }
  },

  // --- БАЗА ЛОРУ ---

  /** Отримати повний текст статті лору */
  getLoreArticle: (
    worldId: string,
    filename: string,
    options?: RequestInit
  ): Promise<LoreArticleResponse> => {
    return apiClient.get<LoreArticleResponse>(
      `/worlds/${encodeURIComponent(worldId)}/lore/${encodeURIComponent(filename)}`,
      options
    );
  },

  /** Створити або оновити статтю лору (.md / .txt) */
  saveLoreArticle: (
    worldId: string,
    filename: string,
    content: string,
    options?: RequestInit
  ): Promise<{ status: string; filename: string }> => {
    return apiClient.put<{ status: string; filename: string }>(
      `/worlds/${encodeURIComponent(worldId)}/lore/${encodeURIComponent(filename)}`,
      { content },
      options
    );
  },

  /** Видалити статтю лору світу */
  deleteLoreArticle: (
    worldId: string,
    filename: string,
    options?: RequestInit
  ): Promise<{ status: string; filename: string }> => {
    return apiClient.delete<{ status: string; filename: string }>(
      `/worlds/${encodeURIComponent(worldId)}/lore/${encodeURIComponent(filename)}`,
      options
    );
  },

  // --- ЖАНРОВІ ПРЕСЕТИ ---

  /** Отримати список вбудованих жанрових пресетів анкет */
  getTemplatePresets: (options?: RequestInit): Promise<TemplatePreset[]> => {
    return apiClient.get<TemplatePreset[]>('/templates/presets', options);
  },

  // --- 4-КРОКОВИЙ AI-МАЙСТЕР СВІТІВ ---

  /** Крок 1: діалог з AI-Архітектором або one-shot генерація чернетки паспорта */
  wizardStepPassport: (
    req: WorldWizardStepRequest,
    options?: RequestInit
  ): Promise<WorldPassportDraftResponse> => {
    return apiClient.post<WorldPassportDraftResponse>('/worlds/wizard/step-passport', req, options);
  },

  /** Крок 4: генерація або оновлення 4 AI-правил світу (ai_prompts) з урахуванням лору та шаблону */
  wizardGeneratePrompts: (
    req: WorldPromptsGenRequest,
    options?: RequestInit
  ): Promise<WorldAiPrompts> => {
    return apiClient.post<WorldAiPrompts>('/worlds/wizard/generate-prompts', req, options);
  },

  /** Крок 2: планування 5 стартових тем, генерація або розширення статті лору */
  wizardGenerateLore: (
    req: WorldLoreGenRequest,
    options?: RequestInit
  ): Promise<WorldLoreGenResponse> => {
    return apiClient.post<WorldLoreGenResponse>('/worlds/wizard/generate-lore', req, options);
  },

  /** Крок 3: AI-генерація/коригування character_template.json + демо-дані прев'ю */
  wizardGenerateTemplate: (
    req: WorldTemplateGenRequest,
    options?: RequestInit
  ): Promise<CharacterTemplateDraftResponse> => {
    return apiClient.post<CharacterTemplateDraftResponse>(
      '/worlds/wizard/generate-template',
      req,
      options
    );
  },

  /** Атомарна фіналізація та збереження пакета світу на диск */
  wizardFinalize: (
    req: WorldFinalizeRequest,
    options?: RequestInit
  ): Promise<WorldDetailResponse> => {
    return apiClient.post<WorldDetailResponse>('/worlds/wizard/finalize', req, options);
  },

  /** Разовий кешований TRPG-переклад невідомих не-кириличних ключів анкети */
  translateTemplateKeys: (
    keys: string[],
    options?: RequestInit
  ): Promise<TranslateKeysResponse> => {
    return apiClient.post<TranslateKeysResponse>(
      '/templates/translate-keys',
      { keys },
      options
    );
  },
};
