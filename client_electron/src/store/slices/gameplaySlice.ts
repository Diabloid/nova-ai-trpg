import type { StateCreator } from 'zustand';
import type { ChatMessage } from '../../types/game';
import { campaignsApi } from '../../api/campaignsApi';
import { gameApi } from '../../api/gameApi';
import { parseIntents, cleanDisplayAction } from '../../utils/intentParser';
import type { SyntaxSelectionRange } from '../../utils/novaSyntax';
import { sanitizeStory } from '../../utils/textSanitizer';
import { formatSystemTime } from '../../utils/formatTime';
import type { GameState, GameplaySlice } from './types';

type StoreSet = Parameters<StateCreator<GameState, [], [], GameplaySlice>>[0];
type StoreGet = Parameters<StateCreator<GameState, [], [], GameplaySlice>>[1];

/**
 * Спільний цикл відправки ходу та SSE-стрімінгу (для нового ходу і повтору після обриву),
 * зі збереженням копії вводу й захистом від дублювання невдалих повідомлень.
 */
async function dispatchPlayerAction(
  rawText: string,
  actionSuppressedSpans: SyntaxSelectionRange[],
  retryMessageId: string | undefined,
  set: StoreSet,
  get: StoreGet
): Promise<void> {
  const text = rawText.trim();
  const { activeCampaignId, isStreaming, isLoading } = get();

  if (!activeCampaignId) {
    get().setSystemAlert('Спочатку оберіть або створіть кампанію', 'info');
    return;
  }
  if (!text || isStreaming || isLoading) return;

  const savedRawText = rawText;
  const savedSuppressedSpans = actionSuppressedSpans.map((s) => ({ ...s }));

  const leadingTrim = rawText.length - rawText.trimStart().length;
  const shiftedSuppressed =
    leadingTrim > 0
      ? savedSuppressedSpans
          .map((s) => ({
            start: Math.max(0, s.start - leadingTrim),
            end: Math.min(text.length, s.end - leadingTrim),
          }))
          .filter((s) => s.end > s.start)
      : savedSuppressedSpans;

  const intents = parseIntents(text, shiftedSuppressed);
  const cleanUserText = cleanDisplayAction(text, shiftedSuppressed);
  const timeNow = formatSystemTime();

  const playerMsgId = retryMessageId ?? `player-${Date.now()}`;
  const playerMsg: ChatMessage = {
    id: playerMsgId,
    sender: 'Ти:',
    text: cleanUserText,
    senderColor: '#60A5FA',
    timeText: timeNow,
    isPlayer: true,
    isFailed: false,
  };

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

  // Прибираємо старі невдалі репліки або замінюємо цільову на місці; очищуємо інпут лише якщо він не містить нової чернетки
  set((state) => {
    const shouldClearInput = !retryMessageId || state.userInput === savedRawText;
    const baseMessages = state.messages
      .filter((m) => !m.isFailed && m.id !== retryMessageId)
      .map((m) => ({ ...m, canRollback: false }));

    return {
      ...(shouldClearInput ? { userInput: '', suppressedSpans: [] } : {}),
      isStreaming: true,
      statusText: 'Розмірковує над дією',
      messages: [...baseMessages, playerMsg, placeholderNarratorMsg],
    };
  });

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
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : 'Невідома помилка';
    get().setSystemAlert(`Помилка ходу: ${errMsg}`, 'error');

    // Позначаємо репліку гравця як невдалу з payload для повтору та повертаємо чернетку в інпут, якщо поле порожнє
    set((state) => {
      const shouldRestoreInput = state.userInput.trim().length === 0;
      const updatedMessages = state.messages
        .filter((m) => m.id !== narratorMsgId || m.text.length > 0)
        .map((m) =>
          m.id === playerMsgId
            ? {
                ...m,
                isFailed: true,
                retryPayload: {
                  rawText: savedRawText,
                  suppressedSpans: savedSuppressedSpans,
                },
              }
            : m
        );

      return {
        isStreaming: false,
        statusText: '',
        ...(shouldRestoreInput
          ? { userInput: savedRawText, suppressedSpans: savedSuppressedSpans }
          : {}),
        messages: updatedMessages,
      };
    });
  }
}

export const createGameplaySlice: StateCreator<GameState, [], [], GameplaySlice> = (set, get) => ({
  playerState: null,
  messages: [],
  userInput: '',
  suppressedSpans: [],

  // --- ХІД ГРАВЦЯ (SSE STREAMING) ---
  sendPlayerAction: async (rawText: string) => {
    const { suppressedSpans } = get();
    await dispatchPlayerAction(rawText, suppressedSpans, undefined, set, get);
  },

  // --- ПОВТОР НЕВДАЛОГО ХОДУ ПІСЛЯ ОБРИВУ SSE ---
  retryFailedAction: async (messageId: string) => {
    const failedMsg = get().messages.find((m) => m.id === messageId && m.isFailed);
    if (!failedMsg?.retryPayload) return;

    await dispatchPlayerAction(
      failedMsg.retryPayload.rawText,
      failedMsg.retryPayload.suppressedSpans,
      messageId,
      set,
      get
    );
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
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : 'Невідома помилка';
      get().setSystemAlert(`Помилка відкату: ${errMsg}`, 'error');
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
