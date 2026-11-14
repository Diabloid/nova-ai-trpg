import type { StateCreator } from 'zustand';
import type { ChatMessage } from '../../types/game';
import { campaignsApi } from '../../api/campaignsApi';
import { gameApi } from '../../api/gameApi';
import { parseIntents, cleanDisplayAction } from '../../utils/intentParser';
import type { SyntaxSelectionRange } from '../../utils/novaSyntax';
import { sanitizeStory } from '../../utils/textSanitizer';
import { formatSystemTime } from '../../utils/formatTime';
import type { GameState, GameplaySlice } from './types';

export const createGameplaySlice: StateCreator<GameState, [], [], GameplaySlice> = (set, get) => ({
  playerState: null,
  messages: [],
  userInput: '',
  suppressedSpans: [],

  // --- ХІД ГРАВЦЯ (SSE STREAMING) ---
  sendPlayerAction: async (rawText: string) => {
    const text = rawText.trim();
    const { activeCampaignId, isStreaming, isLoading, suppressedSpans } = get();
    if (!text || !activeCampaignId || isStreaming || isLoading) return;

    const leadingTrim = rawText.length - rawText.trimStart().length;
    const shiftedSuppressed =
      leadingTrim > 0
        ? suppressedSpans
            .map((s) => ({
              start: Math.max(0, s.start - leadingTrim),
              end: Math.min(text.length, s.end - leadingTrim),
            }))
            .filter((s) => s.end > s.start)
        : suppressedSpans;

    const intents = parseIntents(text, shiftedSuppressed);
    const cleanUserText = cleanDisplayAction(text, shiftedSuppressed);
    const timeNow = formatSystemTime();

    // 1. Оптимістично додаємо репліку гравця
    const playerMsg: ChatMessage = {
      id: `player-${Date.now()}`,
      sender: 'Ти:',
      text: cleanUserText,
      senderColor: '#60A5FA',
      timeText: timeNow,
      isPlayer: true,
    };

    // 2. Створюємо пусте стрімінгове повідомлення Оповідача
    const narratorMsgId = `narrator-${Date.now()}`;
    const placeholderNarratorMsg: ChatMessage = {
      id: narratorMsgId,
      sender: 'Оповідач:',
      text: '',
      senderColor: '#EAB308',
      timeText: timeNow,
      isPlayer: false,
      isStreaming: true,
      canRollback: false,
    };

    // Скидаємо відкат на старих повідомленнях і очищуємо поле вводу разом із suppressedSpans
    set((state) => ({
      userInput: '',
      suppressedSpans: [],
      isStreaming: true,
      statusText: 'Розмірковує над дією...',
      messages: [
        ...state.messages.map((m) => ({ ...m, canRollback: false })),
        playerMsg,
        placeholderNarratorMsg,
      ],
    }));

    try {
      let currentStory = '';

      const result = await gameApi.streamAction(
        {
          raw_text: text,
          intents,
          session_id: activeCampaignId,
        },
        {
          onToken: (chunk) => {
            currentStory += chunk;
            set((state) => ({
              messages: state.messages.map((m) =>
                m.id === narratorMsgId ? { ...m, text: currentStory } : m
              ),
            }));
          },
          onStatusChange: (status) => {
            set({ statusText: status });
          },
          onStateUpdate: (newState) => {
            set({ playerState: newState });
          },
          onError: (errMsg) => {
            get().setSystemAlert(errMsg, 'error');
          },
        }
      );

      // Фіналізація стрімінгу
      set((state) => ({
        isStreaming: false,
        statusText: '',
        playerState: result.playerState || state.playerState,
        messages: state.messages.map((m) =>
          m.id === narratorMsgId
            ? {
                ...m,
                text: sanitizeStory(result.story || m.text),
                isStreaming: false,
                canRollback: true,
              }
            : m
        ),
      }));
    } catch (err: any) {
      get().setSystemAlert(`Помилка ходу: ${err.message}`, 'error');

      // Видаляємо пусте стрімінгове повідомлення Оповідача при критичній помилці
      set((state) => ({
        isStreaming: false,
        statusText: '',
        messages: state.messages.filter((m) => m.id !== narratorMsgId || m.text.length > 0),
      }));
    }
  },

  // --- ВІДКАТ ХОДУ (UNDO) ---
  rollbackLastTurn: async () => {
    const { activeCampaignId, isStreaming, isLoading } = get();
    if (!activeCampaignId || isStreaming || isLoading) return;

    try {
      set({ isLoading: true });
      const res = await campaignsApi.rollbackCampaign(activeCampaignId);

      // Повертаємо попередній ввід гравця в інпут та скидаємо suppressedSpans
      set({
        userInput: res.previous_user_input,
        suppressedSpans: [],
        playerState: res.current_state,
      });

      // Перезавантажуємо історію кампанії для чистоти логу
      await get().selectCampaign(activeCampaignId);
      get().setSystemAlert('Хід успішно відкочено на 1 крок назад', 'info');
    } catch (err: any) {
      get().setSystemAlert(`Помилка відкату: ${err.message}`, 'error');
    } finally {
      set({ isLoading: false });
    }
  },

  setUserInput: (text: string) =>
    set((state) => ({
      userInput: text,
      suppressedSpans: text.length === 0 ? [] : state.suppressedSpans,
    })),

  setSuppressedSpans: (spans: SyntaxSelectionRange[]) => set({ suppressedSpans: spans }),
});
