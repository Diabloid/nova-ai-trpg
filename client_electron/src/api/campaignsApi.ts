import { apiClient } from './client';
import type {
  CampaignSummary,
  CampaignCreateRequest,
  CampaignPinRequest,
  HistoryMessage,
  RollbackResponse,
  PlayerState,
} from '../types/api';

export const campaignsApi = {
  /** Отримати список кампаній персонажа (закріплені вгорі) */
  getCampaigns: (charId: string, options?: RequestInit): Promise<CampaignSummary[]> => {
    return apiClient.get<CampaignSummary[]>(`/characters/${encodeURIComponent(charId)}/campaigns`, options);
  },

  /** Створити нову кампанію для героя з автогенерацією вступного посту */
  createCampaign: (charId: string, title?: string, options?: RequestInit): Promise<CampaignSummary> => {
    const req: CampaignCreateRequest = { title: title || 'Нова пригода' };
    return apiClient.post<CampaignSummary>(`/characters/${encodeURIComponent(charId)}/campaigns`, req, options);
  },

  /** Отримати повний журнал повідомлень кампанії з chat_log.json */
  getCampaignHistory: (campaignId: string, options?: RequestInit): Promise<HistoryMessage[]> => {
    return apiClient.get<HistoryMessage[]>(`/campaigns/${encodeURIComponent(campaignId)}/history`, options);
  },

  /** Закріпити чи відкріпити кампанію (is_pinned: true/false) */
  pinCampaign: (campaignId: string, isPinned: boolean, options?: RequestInit): Promise<CampaignSummary> => {
    const req: CampaignPinRequest = { is_pinned: isPinned };
    return apiClient.patch<CampaignSummary>(`/campaigns/${encodeURIComponent(campaignId)}/pin`, req, options);
  },

  /** Видалити кампанію */
  deleteCampaign: (campaignId: string, options?: RequestInit): Promise<{ status: string }> => {
    return apiClient.delete<{ status: string }>(`/campaigns/${encodeURIComponent(campaignId)}`, options);
  },

  /** Відкат на 1 крок назад (Undo) */
  rollbackCampaign: (campaignId: string, options?: RequestInit): Promise<RollbackResponse> => {
    return apiClient.post<RollbackResponse>(`/campaigns/${encodeURIComponent(campaignId)}/rollback`, {}, options);
  },

  /** Отримати поточний живий стан героя в кампанії */
  getCampaignState: (sessionId: string, options?: RequestInit): Promise<PlayerState> => {
    return apiClient.get<PlayerState>(`/state?session_id=${encodeURIComponent(sessionId)}`, options);
  },
};
