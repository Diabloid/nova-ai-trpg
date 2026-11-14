import React, { useState } from 'react';
import { Copy, Check, RotateCcw, AlertTriangle } from 'lucide-react';
import type { ChatMessage } from '../../types/game';
import { RollbackBtn } from './RollbackBtn';
import { TypingStatus } from './TypingStatus';
import { formatSystemTime } from '../../utils/formatTime';
import { useGameStore } from '../../store/useGameStore';

interface ChatBubbleProps {
  message: ChatMessage;
  canRollback?: boolean;
}

export const ChatBubble: React.FC<ChatBubbleProps> = ({
  message,
  canRollback = false,
}) => {
  const [copied, setCopied] = useState(false);
  const retryFailedAction = useGameStore((s) => s.retryFailedAction);
  const isStreaming = useGameStore((s) => s.isStreaming);
  const isLoading = useGameStore((s) => s.isLoading);

  const isPlayer = message.isPlayer || message.role === 'player';
  const isFailed = Boolean(isPlayer && message.isFailed);

  const handleCopy = () => {
    const selectedText = window.getSelection()?.toString();
    const textToCopy = selectedText && selectedText.length > 0 ? selectedText : message.text;
    navigator.clipboard.writeText(textToCopy);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const senderName = isPlayer ? 'Ти:' : 'Оповідач:';
  const senderColor = isFailed ? 'text-[#FCA5A5]' : isPlayer ? 'text-[#60A5FA]' : 'text-[#EAB308]';
  const tabBg = isFailed
    ? 'bg-[#211216] border-[#7F1D1D]'
    : isPlayer
      ? 'bg-[#181B22] border-[#2D3748]'
      : 'bg-[#161616] border-[#262626]';
  const bodyBg = isFailed
    ? 'bg-[#211216] border-[#7F1D1D]'
    : isPlayer
      ? 'bg-[#181B22] border-[#2D3748]'
      : 'bg-[#161616] border-[#262626]';

  // Форматування часу як у TimeText (відповідно до системного формату ОС)
  const timeFormatted = message.timeText || (message.createdAt ? formatSystemTime(message.createdAt) : '');

  return (
    <div className={`relative mb-5 flex flex-col group animate-fade-in ${isPlayer ? 'self-start max-w-[85%]' : 'w-full'}`}>
      {/* Верхній рядок: Вушко-вкладинка (Header Tab) ліворуч + Кнопка відкату праворуч */}
      <div className="flex items-end justify-between -mb-[1px] z-10 pr-3">
        <div
          className={`flex items-center gap-2 px-3 py-1 rounded-t-lg border-t border-x ${tabBg}`}
        >
          <span className={`text-[13px] font-bold ${senderColor}`}>
            {senderName}
          </span>
          {timeFormatted && (
            <span className="text-[10px] text-[#6B7280] font-mono mt-0.5">
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
        className={`relative rounded-b-lg rounded-tr-lg border p-[12px_14px] min-w-[140px] ${bodyBg} shadow-lg`}
      >
        {/* Кнопка швидкого копіювання */}
        {message.text.length > 0 && (
          <button
            type="button"
            onClick={handleCopy}
            title="Копіювати"
            className="absolute top-2 right-2 opacity-0 group-hover:opacity-80 hover:opacity-100 transition-opacity p-1 rounded bg-[#222222]/80 hover:bg-[#2A2A2A] text-[#9CA3AF] hover:text-white cursor-pointer"
          >
            {copied ? <Check size={12} className="text-[#10B981]" /> : <Copy size={12} />}
          </button>
        )}

        {/* Текст повідомлення */}
        {message.text.length > 0 && (
          <div className="text-[14px] leading-[24px] text-[#E5E7EB] tracking-[0.2px] select-text whitespace-pre-wrap break-words">
            {message.text}
            {message.isStreaming && (
              <span className="inline-block w-1.5 h-4 ml-1 bg-[#EAB308] animate-pulse align-middle" />
            )}
          </div>
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
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-semibold bg-[#7E0018] hover:bg-[#9E0020] text-white border border-[#9E0020] transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
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
