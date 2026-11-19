import { apiClient, BASE_URL, ApiError, notifyNetworkStatus } from './client';
import type { ActionRequest, ActionResponse, PlayerState, VoiceTranscriptionResponse } from '../types/api';

export interface StreamActionCallbacks {
  onToken?: (chunk: string) => void;
  onStatusChange?: (status: string) => void;
  onStateUpdate?: (state: PlayerState) => void;
  onError?: (errMessage: string) => void;
}

export const gameApi = {
  /** Легкий heartbeat-запит доступності сервера */
  checkHealth: async (signal?: AbortSignal): Promise<boolean> => {
    const res = await apiClient.get<{ status?: string }>('/health', {
      signal,
      cache: 'no-store',
    });
    return Boolean(res);
  },

  /** Звичайний синхронний REST-хід у кампанії */
  sendAction: (req: ActionRequest, options?: RequestInit): Promise<ActionResponse> => {
    return apiClient.post<ActionResponse>('/action', req, options);
  },

  /**
   * Потокове виконання ходу через SSE (Server-Sent Events)
   * Читає токени Оповідача в реальному часі та оновлений стан персонажа від Аналізатора
   */
  streamAction: async (
    req: ActionRequest,
    callbacks: StreamActionCallbacks = {},
    signal?: AbortSignal
  ): Promise<{ story: string; playerState?: PlayerState }> => {
    const url = `${BASE_URL}/action/stream`;

    let response: Response;
    try {
      response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'text/event-stream',
        },
        body: JSON.stringify(req),
        signal,
      });
    } catch (error) {
      const err = error as Error;
      if (err.name === 'AbortError') throw err;
      notifyNetworkStatus(true);
      throw new ApiError(err.message || "Мережева помилка з'єднання з бекендом", 0);
    }

    notifyNetworkStatus(false);

    if (!response.ok) {
      let errorMsg = `HTTP ${response.status} ${response.statusText}`;
      try {
        const errorJson = await response.json();
        errorMsg = errorJson.detail || errorJson.error_message || errorMsg;
      } catch {
        // Body is not JSON
      }
      throw new ApiError(errorMsg, response.status);
    }

    if (!response.body) {
      throw new ApiError('Потік відповіді сервера недоступний', 0);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder('utf-8');
    let buffer = '';
    let accumulatedStory = '';
    let finalPlayerState: PlayerState | undefined;

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        // SSE повідомлення розділені подвійним перенесенням рядка \n\n
        const messages = buffer.split('\n\n');
        // Останній фрагмент може бути неповним — залишаємо його в буфері
        buffer = messages.pop() || '';

        for (const rawMessage of messages) {
          if (!rawMessage.trim()) continue;

          let eventType = 'message';
          let eventData = '';

          const lines = rawMessage.split('\n');
          for (const line of lines) {
            if (line.startsWith('event:')) {
              eventType = line.slice(6).trim();
            } else if (line.startsWith('data:')) {
              eventData = line.slice(5).trim();
            }
          }

          if (!eventData) continue;

          try {
            const parsedData = JSON.parse(eventData);

            switch (eventType) {
              case 'story_chunk':
                if (parsedData.chunk) {
                  accumulatedStory += parsedData.chunk;
                  callbacks.onToken?.(parsedData.chunk);
                }
                break;

              case 'state_analyzing':
                callbacks.onStatusChange?.(parsedData.message || 'Аналізую зміни інвентарю та здоров\'я...');
                break;

              case 'complete':
                if (parsedData.player_state) {
                  finalPlayerState = parsedData.player_state as PlayerState;
                  callbacks.onStateUpdate?.(finalPlayerState);
                }
                if (parsedData.story && !accumulatedStory) {
                  accumulatedStory = parsedData.story;
                }
                break;

              case 'error':
                const errMsg = parsedData.error_message || 'Помилка під час генерації ходу';
                callbacks.onError?.(errMsg);
                throw new ApiError(errMsg, 500, parsedData);
            }
          } catch (jsonErr) {
            if (jsonErr instanceof ApiError) throw jsonErr;
            // Якщо сирий data не є JSON (наприклад звичайний рядок)
            if (eventType === 'story_chunk') {
              accumulatedStory += eventData;
              callbacks.onToken?.(eventData);
            }
          }
        }
      }
    } finally {
      reader.releaseLock();
    }

    return {
      story: accumulatedStory,
      playerState: finalPlayerState,
    };
  },

  /**
   * Розпізнавання голосового запису (WAV/WebM) через Groq Whisper v3
   */
  transcribeAudio: async (audioBlob: Blob, filename = 'recording.wav', signal?: AbortSignal): Promise<string> => {
    const formData = new FormData();
    formData.append('file', audioBlob, filename);

    let response: Response;
    try {
      response = await fetch(`${BASE_URL}/voice/transcribe`, {
        method: 'POST',
        body: formData,
        signal,
      });
    } catch (error) {
      const err = error as Error;
      if (err.name === 'AbortError') throw err;
      notifyNetworkStatus(true);
      throw new ApiError(err.message || "Мережева помилка з'єднання з бекендом", 0);
    }

    notifyNetworkStatus(false);

    if (!response.ok) {
      throw new ApiError(`Помилка розпізнавання аудіо: HTTP ${response.status}`, response.status);
    }

    const data = (await response.json()) as VoiceTranscriptionResponse;
    return data.text || '';
  },
};
