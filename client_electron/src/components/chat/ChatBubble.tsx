import React, { useState } from 'react';
import { Copy, Check } from 'lucide-react';
import type { ChatMessage } from '../../types/game';
import { RollbackBtn } from './RollbackBtn';
import { formatSystemTime } from '../../utils/formatTime';

interface ChatBubbleProps {
  message: ChatMessage;
  canRollback?: boolean;
}

export const ChatBubble: React.FC<ChatBubbleProps> = ({
  message,
  canRollback = false,
}) => {
  const [copied, setCopied] = useState(false);

  const isPlayer = message.isPlayer || message.role === 'player';
  const isSystem = message.isSystem || message.role === 'system';

  const handleCopy = () => {
    navigator.clipboard.writeText(message.text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Системні ефемерні сповіщення
  if (isSystem) {
    return (
      <div className="w-full my-2 flex justify-center animate-fade-in select-none">
        <div className="max-w-lg bg-[#7E0018]/20 border border-[#7E0018]/40 rounded-full px-4 py-1 text-xs text-[#EF4444] text-center font-medium shadow-md">
          {message.text}
        </div>
      </div>
    );
  }

  const senderName = isPlayer ? 'Ти:' : 'Оповідач:';
  const senderColor = isPlayer ? 'text-[#60A5FA]' : 'text-[#EAB308]';
  const tabBg = isPlayer
    ? 'bg-[#181B22] border-[#2D3748]'
    : 'bg-[#161616] border-[#262626]';
  const bodyBg = isPlayer
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

        {canRollback && !isPlayer && <RollbackBtn />}
      </div>

      {/* Основне тіло плашки з текстом (min-width: 140px гарантує правильний баланс із вушком) */}
      <div
        className={`relative rounded-b-lg rounded-tr-lg border p-[12px_14px] min-w-[140px] ${bodyBg} shadow-lg`}
      >
        {/* Кнопка швидкого копіювання */}
        <button
          type="button"
          onClick={handleCopy}
          title="Копіювати"
          className="absolute top-2 right-2 opacity-0 group-hover:opacity-80 hover:opacity-100 transition-opacity p-1 rounded bg-[#222222]/80 hover:bg-[#2A2A2A] text-[#9CA3AF] hover:text-white cursor-pointer"
        >
          {copied ? <Check size={12} className="text-[#10B981]" /> : <Copy size={12} />}
        </button>

        {/* Текст повідомлення */}
        <div className="text-[14px] leading-[24px] text-[#E5E7EB] tracking-[0.2px] select-text whitespace-pre-wrap break-words">
          {message.text}
          {message.isStreaming && (
            <span className="inline-block w-1.5 h-4 ml-1 bg-[#EAB308] animate-pulse align-middle" />
          )}
        </div>
      </div>
    </div>
  );
};
