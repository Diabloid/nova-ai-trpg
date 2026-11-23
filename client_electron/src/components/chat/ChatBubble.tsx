import React, { useEffect, useRef, useState } from 'react';
import { Copy, Check, RotateCcw, AlertTriangle, Pencil, Loader2, X } from 'lucide-react';
import type { ChatMessage } from '../../types/game';
import { RollbackBtn } from './RollbackBtn';
import { TypingStatus } from './TypingStatus';
import type { NovaTokenType } from '../../utils/novaSyntax';
import { formatSystemTime } from '../../utils/formatTime';
import { RUBY_BUTTON_SURFACE_CLASS } from '../ui/Button';
import { Textarea } from '../ui/Input';
import { useGameStore } from '../../store/useGameStore';

// Приглушена єдина палітра для читабельності логу чату (на відміну від яскравої підсвітки редактора)
const CHAT_LOG_TOKEN_CLASSES: Record<NovaTokenType, string> = {
  normal: '',
  action: 'text-[#F3F4F6]',
  thought: 'nova-thought-italic text-[#93C5FD]/85',
  speech: 'text-[#D1FAE5]',
  ooc: 'text-[#9CA3AF]',
};

interface ChatBubbleProps {
  message: ChatMessage;
  canRollback?: boolean;
  canEdit?: boolean;
  hasPlayerTurns?: boolean;
}

export const ChatBubble: React.FC<ChatBubbleProps> = ({
  message,
  canRollback = false,
  canEdit = false,
  hasPlayerTurns = true,
}) => {
  const [copied, setCopied] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [draftText, setDraftText] = useState('');
  const [recalculateState, setRecalculateState] = useState(hasPlayerTurns);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const retryFailedAction = useGameStore((s) => s.retryFailedAction);
  const editLastNarratorMessage = useGameStore((s) => s.editLastNarratorMessage);
  const isStreaming = useGameStore((s) => s.isStreaming);
  const isLoading = useGameStore((s) => s.isLoading);
  const isEditingNarrator = useGameStore((s) => s.isEditingNarrator);

  useEffect(() => {
    if (!isEditing) return;
    const el = textareaRef.current;
    if (!el) return;
    el.focus();
    const len = el.value.length;
    el.setSelectionRange(len, len);
  }, [isEditing]);

  useEffect(() => {
    if (!isEditing) return;
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }, [isEditing, draftText]);

  const isPlayer = message.isPlayer || message.role === 'player';
  const isFailed = Boolean(isPlayer && message.isFailed);

  const renderPlayerContent = () => {
    if (message.tokens && message.tokens.length > 0) {
      return message.tokens.map((token, index) => (
        <span
          key={index}
          className={token.isSuppressed ? '' : CHAT_LOG_TOKEN_CLASSES[token.type]}
        >
          {token.text}
        </span>
      ));
    }
    return message.text;
  };

  const renderNarratorContent = () => {
    const lines = message.text.split('\n');
    return lines.map((line, index) => {
      const isLast = index === lines.length - 1;
      const cursorNode =
        isLast && message.isStreaming ? (
          <span className="inline-block w-1.5 h-4 ml-1 bg-[#EAB308] animate-pulse align-middle" />
        ) : null;

      if (line.length === 0) {
        return (
          <div key={index} className="h-3">
            {cursorNode}
          </div>
        );
      }

      if (/^[ \t]*[-–—][ \t]+/.test(line)) {
        return (
          <div
            key={index}
            className="pl-3 py-0.5 my-1 border-l-2 border-[#34D399]/40 bg-[#34D399]/[0.025] rounded-r-md text-[#D1FAE5]"
          >
            {line}
            {cursorNode}
          </div>
        );
      }

      return (
        <div key={index}>
          {line}
          {cursorNode}
        </div>
      );
    });
  };

  const handleCopy = () => {
    const selectedText = window.getSelection()?.toString();
    const textToCopy = selectedText && selectedText.length > 0 ? selectedText : message.text;
    navigator.clipboard.writeText(textToCopy);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleStartEdit = () => {
    if (!canEdit || isEditingNarrator) return;
    setDraftText(message.text);
    setRecalculateState(hasPlayerTurns);
    setIsEditing(true);
  };

  const handleCancelEdit = () => {
    if (isEditingNarrator) return;
    setIsEditing(false);
  };

  const handleSaveEdit = async () => {
    if (isEditingNarrator || !draftText.trim()) return;
    const ok = await editLastNarratorMessage(
      draftText,
      hasPlayerTurns ? recalculateState : false
    );
    if (ok) {
      setIsEditing(false);
    }
  };

  const handleEditorKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      handleCancelEdit();
      return;
    }
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      void handleSaveEdit();
    }
  };

  const senderName = isPlayer ? 'Ти' : 'Оповідач';
  const senderColor = isFailed ? 'text-[#FCA5A5]' : isPlayer ? 'text-[#93C5FD]' : 'text-[#FDE047]';
  const roleDotColor = isFailed ? 'bg-[#EF4444]' : isPlayer ? 'bg-[#60A5FA]' : 'bg-[#EAB308]';
  const tabBg = isFailed
    ? 'bg-[#211216] border-[#7F1D1D]'
    : isPlayer
      ? 'bg-[#171B24] border-[#2A3342]'
      : 'bg-[#161616] border-[#262626]';
  const bodyBg = isFailed
    ? 'bg-gradient-to-b from-[#211216] to-[#1A0E12] border-[#7F1D1D] shadow-[inset_0_1px_0_rgba(239,68,68,0.08),0_8px_22px_-8px_rgba(0,0,0,0.65)]'
    : isPlayer
      ? 'bg-gradient-to-b from-[#171B24] to-[#131720] border-[#2A3342] group-hover:border-[#374357] shadow-[inset_0_1px_0_rgba(96,165,250,0.06),0_6px_20px_-8px_rgba(0,0,0,0.6)]'
      : 'bg-gradient-to-b from-[#161616] to-[#131313] border-[#262626] group-hover:border-[#323232] shadow-[inset_0_1px_0_rgba(255,255,255,0.03),0_8px_24px_-8px_rgba(0,0,0,0.65)]';

  // Форматування часу як у TimeText (відповідно до системного формату ОС)
  const timeFormatted = message.timeText || (message.createdAt ? formatSystemTime(message.createdAt) : '');

  return (
    <div
      data-chat-msg-id={message.id}
      className={`relative mb-5 flex flex-col group transition-all duration-300 origin-bottom w-full ${
        message.isRollingBack
          ? 'opacity-0 translate-y-3 scale-[0.96] pointer-events-none'
          : 'animate-fade-in opacity-100 translate-y-0 scale-100'
      }`}
    >
      {/* Верхній рядок: Вушко-вкладинка (Header Tab) ліворуч + Кнопка відкату праворуч */}
      <div className="flex items-end justify-between -mb-[1px] z-10 pr-3">
        <div
          className={`flex items-center gap-2 px-3 py-1 rounded-t-lg border-t border-x ${tabBg}`}
        >
          <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${roleDotColor}`} />
          <span className={`text-[12.5px] font-bold tracking-wide ${senderColor}`}>
            {senderName}
          </span>
          {timeFormatted && (
            <span className="text-[10px] text-[#6B7280] font-mono">
              {timeFormatted}
            </span>
          )}
        </div>

        {canRollback && !isPlayer && (
          <div className="h-[28px] flex items-start">
            <RollbackBtn />
          </div>
        )}
      </div>

      {/* Основне тіло плашки з текстом (min-width: 140px гарантує правильний баланс із вушком) */}
      <div
        data-context-copy={message.text}
        className={`relative rounded-b-xl rounded-tr-xl border px-4 py-3.5 min-w-[140px] transition-colors duration-200 ${bodyBg}`}
      >
        {/* Панель швидких дій у правому верхньому куті */}
        {!isEditing && message.text.length > 0 && (
          <div className="absolute top-2 right-2.5 flex items-center gap-0.5 p-0.5 rounded-lg bg-[#1A1A1A]/90 backdrop-blur-sm border border-[#2C2C2C] shadow-md opacity-0 group-hover:opacity-100 transition-all duration-150">
            {canEdit && (
              <button
                type="button"
                onClick={handleStartEdit}
                data-tooltip="Редагувати відповідь"
                className="p-1 rounded-md text-[#9CA3AF] hover:text-white hover:bg-[#262626] transition-colors cursor-pointer"
              >
                <Pencil size={12} />
              </button>
            )}
            <button
              type="button"
              onClick={handleCopy}
              data-tooltip="Копіювати"
              className="p-1 rounded-md text-[#9CA3AF] hover:text-white hover:bg-[#262626] transition-colors cursor-pointer"
            >
              {copied ? <Check size={12} className="text-[#10B981]" /> : <Copy size={12} />}
            </button>
          </div>
        )}

        {/* Текст повідомлення або інлайн-редактор відповіді Оповідача */}
        {isEditing ? (
          <div className="flex flex-col gap-2.5">
            <Textarea
              ref={textareaRef}
              variant="compact"
              value={draftText}
              disabled={isEditingNarrator}
              onChange={(e) => setDraftText(e.target.value)}
              onKeyDown={handleEditorKeyDown}
              placeholder="Введіть виправлену відповідь Оповідача..."
              className="text-[14px] leading-[24px] tracking-[0.2px] text-[#E5E7EB] resize-none overflow-hidden min-h-[72px]"
            />

            <div className="flex flex-wrap items-center justify-between gap-2 pt-0.5 select-none">
              <div className="flex items-center gap-3">
                {hasPlayerTurns ? (
                  <button
                    type="button"
                    role="checkbox"
                    aria-checked={recalculateState}
                    disabled={isEditingNarrator}
                    onClick={() => setRecalculateState((prev) => !prev)}
                    className="inline-flex items-center gap-2 text-xs text-[#D1D5DB] enabled:hover:text-white enabled:cursor-pointer disabled:opacity-55 disabled:cursor-default transition-colors"
                  >
                    <span
                      className={`w-4 h-4 rounded border flex items-center justify-center transition-colors shrink-0 ${
                        recalculateState
                          ? 'bg-[#7E0018] border-[#A3001F] text-white'
                          : 'bg-[#121212] border-[#383838] text-transparent'
                      }`}
                    >
                      <Check size={11} strokeWidth={3} />
                    </span>
                    <span>Оновити лист персонажа за новим текстом</span>
                  </button>
                ) : (
                  <span className="text-[11px] text-[#6B7280]">
                    Вступна сцена — змінюється лише текст
                  </span>
                )}
              </div>

              <div className="flex items-center gap-2 ml-auto">
                <button
                  type="button"
                  disabled={isEditingNarrator}
                  onClick={handleCancelEdit}
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md text-xs font-medium bg-[#1F1F1F] border border-[#323232] text-[#D1D5DB] enabled:hover:bg-[#282828] enabled:hover:text-white enabled:cursor-pointer disabled:opacity-50 disabled:cursor-default transition-colors"
                >
                  <X size={12} />
                  <span>Скасувати</span>
                </button>
                <button
                  type="button"
                  disabled={isEditingNarrator || !draftText.trim()}
                  onClick={() => {
                    void handleSaveEdit();
                  }}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold enabled:active:scale-[0.98] transition-all enabled:cursor-pointer disabled:opacity-50 disabled:cursor-default ${RUBY_BUTTON_SURFACE_CLASS}`}
                >
                  {isEditingNarrator ? (
                    <>
                      <Loader2 size={12} className="animate-spin" />
                      <span>Оновлюю...</span>
                    </>
                  ) : (
                    <>
                      <Check size={12} />
                      <span>Зберегти</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        ) : (
          message.text.length > 0 && (
            <div className="text-[14px] leading-[24px] text-[#E5E7EB] tracking-[0.2px] select-text whitespace-pre-wrap break-words">
              {isPlayer ? renderPlayerContent() : renderNarratorContent()}
            </div>
          )
        )}

        {/* Статус Оповідача / Аналізатора всередині самої бульбашки з моменту старту ходу */}
        {message.isStreaming && <TypingStatus hasText={message.text.length > 0} />}

        {/* Статус обриву SSE та кнопка повтору */}
        {isFailed && (
          <div className="mt-2.5 pt-2 border-t border-[#7F1D1D]/50 flex items-center justify-between gap-3 select-none">
            <span className="inline-flex items-center gap-1.5 text-[11px] text-[#FCA5A5]">
              <AlertTriangle size={12} className="text-[#EF4444] shrink-0" />
              Не вдалося доставити хід
            </span>
            <button
              type="button"
              disabled={isStreaming || isLoading}
              onClick={() => {
                retryFailedAction(message.id).catch(() => {});
              }}
              className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-semibold enabled:active:scale-[0.98] transition-all enabled:cursor-pointer disabled:opacity-50 disabled:cursor-default ${RUBY_BUTTON_SURFACE_CLASS}`}
            >
              <RotateCcw size={11} />
              <span>Повторити хід</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
