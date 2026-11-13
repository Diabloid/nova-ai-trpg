import React, { useRef, useEffect } from 'react';
import { useGameStore } from '../../store/useGameStore';
import { ChatBubble } from './ChatBubble';
import { TypingStatus } from './TypingStatus';

export const ChatContainer: React.FC = () => {
  const { messages, isLoading, isStreaming } = useGameStore();
  const scrollRef = useRef<HTMLDivElement>(null);

  // Автоскрол донизу при надходженні нових повідомлень та стрімінгу токенів
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTo({
        top: scrollRef.current.scrollHeight,
        behavior: isStreaming ? 'auto' : 'smooth',
      });
    }
  }, [messages, isStreaming, isLoading]);

  // Знаходимо індекс останнього повідомлення Оповідача для кнопки відкату
  let lastNarratorIndex = -1;
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i];
    if (!msg.isPlayer && !msg.isSystem && msg.role !== 'player' && msg.role !== 'system') {
      lastNarratorIndex = i;
      break;
    }
  }

  return (
    <div className="relative flex-1 bg-[#111111] border border-[#2A2A2A] rounded-[10px] p-[20px_10px_4px_10px] overflow-hidden flex flex-col shadow-inner">
      {/* Скрол-контейнер із симетричним вертикальним фейдом (0.00..0.02 та 0.98..1.00) */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto pr-4 mask-fade-vertical"
      >
        <div className="flex flex-col min-h-full justify-end pt-[18px]">
          {messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center text-center py-20 text-[#6B7280]">
              <span className="text-sm font-medium">Кампанія готова до початку</span>
              <span className="text-xs text-[#4B5563] mt-1">
                Введіть дію персонажа або надиктуйте фразу голосом
              </span>
            </div>
          ) : (
            messages.map((msg, idx) => {
              const canRollback =
                idx === lastNarratorIndex && !isLoading && !isStreaming;
              return (
                <ChatBubble
                  key={msg.id || idx}
                  message={msg}
                  canRollback={canRollback}
                />
              );
            })
          )}

          {/* Індикатор очікування та стану генерації ходу */}
          <div className="mb-6">
            <TypingStatus />
          </div>
        </div>
      </div>
    </div>
  );
};
