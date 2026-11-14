import type { StateCreator } from 'zustand';
import type { ChatMessage } from '../../types/game';
import { campaignsApi } from '../../api/campaignsApi';
import { gameApi } from '../../api/gameApi';
import { parseIntents, cleanDisplayAction } from '../../utils/intentParser';
import { buildDisplayTokens, type SyntaxSelectionRange } from '../../utils/novaSyntax';
import { sanitizeStory } from '../../utils/textSanitizer';
import { formatSystemTime } from '../../utils/formatTime';
import type { GameState, GameplaySlice, RollbackGhostState } from './types';

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
  const { activeCampaignId, isStreaming, isLoading, isRollingBack } = get();

  if (!activeCampaignId) {
    get().setSystemAlert('Спочатку оберіть або створіть кампанію', 'info');
    return;
  }
  if (!text || isStreaming || isLoading || isRollingBack) return;

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
  const displayTokens = buildDisplayTokens(text, shiftedSuppressed);
  const timeNow = formatSystemTime();

  const playerMsgId = retryMessageId ?? `player-${Date.now()}`;
  const playerMsg: ChatMessage = {
    id: playerMsgId,
    sender: 'Ти:',
    text: cleanUserText,
    tokens: displayTokens,
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
  isRollingBack: false,
  rollbackInputSignal: 0,
  rollbackGhost: null,

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

  // --- ПЛАВНИЙ ВІДКАТ ХОДУ (UNDO) БЕЗ ПЕРЕЗАВАНТАЖЕННЯ КАМПАНІЇ ---
  rollbackLastTurn: async () => {
    const { activeCampaignId, isStreaming, isLoading, isRollingBack } = get();
    if (!activeCampaignId || isStreaming || isLoading || isRollingBack) return;

    try {
      set({ isRollingBack: true });
      const res = await campaignsApi.rollbackCampaign(activeCampaignId);
      const nextLocation = res.current_state?.meta?.location;

      // Знаходимо 2 останні повідомлення ходу (гравець + оповідач) для плавного зникнення
      const currentMessages = get().messages;
      let lastNarratorIdx = -1;
      for (let i = currentMessages.length - 1; i >= 0; i--) {
        const msg = currentMessages[i];
        if (!msg.isPlayer && msg.role !== 'system') {
          lastNarratorIdx = i;
          break;
        }
      }

      const targetIds = new Set<string>();
      let prevPlayerMsgId: string | null = null;
      if (lastNarratorIdx !== -1) {
        targetIds.add(currentMessages[lastNarratorIdx].id);
        const prevMsg = currentMessages[lastNarratorIdx - 1];
        if (prevMsg && prevMsg.isPlayer && !prevMsg.isFailed) {
          targetIds.add(prevMsg.id);
          prevPlayerMsgId = prevMsg.id;
        }
      }

      // Заміряємо координати бульбашки гравця та поля вводу для анімації перельоту тексту
      let ghostPayload: RollbackGhostState | null = null;
      if (prevPlayerMsgId && res.previous_user_input && typeof document !== 'undefined') {
        const bubbleRoot = document.querySelector(`[data-chat-msg-id="${prevPlayerMsgId}"]`);
        const bubbleBody = bubbleRoot?.querySelector('[data-context-copy]') ?? bubbleRoot;
        const inputBox = document.querySelector('[data-chat-input-box="true"]');
        if (bubbleBody && inputBox) {
          const from = bubbleBody.getBoundingClientRect();
          const to = inputBox.getBoundingClientRect();
          if (from.width > 0 && to.width > 0) {
            ghostPayload = {
              text: res.previous_user_input,
              fromRect: { left: from.left, top: from.top, width: from.width, height: from.height },
              toRect: { left: to.left, top: to.top, width: to.width, height: to.height },
            };
          }
        }
      }

      // Тихо оновлюємо стан і локацію; вмикаємо згасання бульбашок і переліт тексту в інпут
      set((state) => ({
        playerState: res.current_state,
        rollbackGhost: ghostPayload,
        activeCampaign:
          state.activeCampaign && state.activeCampaign.campaign_id === activeCampaignId && nextLocation
            ? { ...state.activeCampaign, current_location: nextLocation }
            : state.activeCampaign,
        campaigns: nextLocation
          ? state.campaigns.map((c) =>
              c.campaign_id === activeCampaignId ? { ...c, current_location: nextLocation } : c
            )
          : state.campaigns,
        messages: state.messages.map((m) =>
          targetIds.has(m.id) ? { ...m, isRollingBack: true, canRollback: false } : m
        ),
      }));

      if (targetIds.size > 0 || ghostPayload) {
        await new Promise((resolve) => setTimeout(resolve, ghostPayload ? 460 : 280));
      }

      set((state) => {
        const remaining = state.messages.filter((m) => !targetIds.has(m.id));
        let newLastNarratorIdx = -1;
        for (let i = remaining.length - 1; i >= 0; i--) {
          const msg = remaining[i];
          if (!msg.isPlayer && msg.role !== 'system') {
            newLastNarratorIdx = i;
            break;
          }
        }
        // Початкове привітання (індекс 0 без жодного ходу гравця) не можна відкочувати
        const canRollbackNext = newLastNarratorIdx > 0;
        return {
          userInput: res.previous_user_input,
          suppressedSpans: [],
          rollbackInputSignal: state.rollbackInputSignal + 1,
          rollbackGhost: null,
          messages: remaining.map((m, idx) => ({
            ...m,
            canRollback: idx === newLastNarratorIdx ? canRollbackNext : false,
          })),
        };
      });
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : 'Невідома помилка';
      set({ rollbackGhost: null });
      get().setSystemAlert(`Помилка відкату: ${errMsg}`, 'error');
    } finally {
      set({ isRollingBack: false, rollbackGhost: null });
    }
  },

  setUserInput: (text: string) =>
    set((state) => ({
      userInput: text,
      suppressedSpans: text.length === 0 ? [] : state.suppressedSpans,
    })),

  setSuppressedSpans: (spans: SyntaxSelectionRange[]) => set({ suppressedSpans: spans }),
});
