import React, { useRef, useEffect } from 'react';
import { RefreshCw, Swords, WifiOff, Loader2 } from 'lucide-react';
import { useGameStore } from '../../store/useGameStore';
import { useWizardStore } from '../../store/useWizardStore';
import { ChatBubble } from './ChatBubble';
import { Button } from '../ui/Button';

interface ChatContainerProps {
  onNewCampaign?: () => void;
}

export const ChatContainer: React.FC<ChatContainerProps> = ({ onNewCampaign }) => {
  const {
    messages,
    isLoading,
    isStreaming,
    backendOffline,
    activeCampaignId,
    characters,
    loadCharacters,
  } = useGameStore();
  const openWizard = useWizardStore((s) => s.openWizard);
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
    if (!msg.isPlayer && msg.role !== 'player' && msg.role !== 'system') {
      lastNarratorIndex = i;
      break;
    }
  }

  const handleStartAdventure = () => {
    if (characters.length === 0) {
      openWizard();
    } else {
      onNewCampaign?.();
    }
  };

  const renderEmptyOrOfflineState = () => {
    // 1. Бекенд офлайн
    if (backendOffline) {
      return (
        <div className="flex flex-col items-center justify-center text-center py-16 px-6 max-w-md mx-auto">
          <div className="w-12 h-12 rounded-xl bg-[#211216] border border-[#7F1D1D] flex items-center justify-center mb-3 text-[#EF4444]">
            <WifiOff size={22} />
          </div>
          <span className="text-sm font-semibold text-[#F3F4F6]">
            Зв&apos;язок із ігровим рушієм перервано
          </span>
          <span className="text-xs text-[#6B7280] mt-1.5 leading-relaxed">
            Сервер гри зараз не відповідає. Переконайтеся, що застосунок повністю запущено, та спробуйте підключитися знову.
          </span>
          <div className="mt-4">
            <Button
              variant="primary"
              size="sm"
              isLoading={isLoading}
              onClick={() => {
                loadCharacters().catch(() => {});
              }}
            >
              <RefreshCw size={13} />
              <span>Повторити підключення</span>
            </Button>
          </div>
        </div>
      );
    }

    // 2. Скелетон початкового завантаження / завантаження порожньої кампанії
    if (isLoading && !isStreaming) {
      return (
        <div className="flex flex-col gap-4 py-8 px-2 w-full animate-pulse select-none">
          <div className="flex items-center gap-2 text-xs text-[#6B7280] justify-center mb-2">
            <Loader2 size={14} className="animate-spin text-[#9CA3AF]" />
            <span>Завантаження історії пригоди...</span>
          </div>
          <div className="h-16 w-2/3 rounded-lg bg-[#161616] border border-[#222222]" />
          <div className="h-24 w-full rounded-lg bg-[#161616] border border-[#222222]" />
        </div>
      );
    }

    // 3. Немає героя або не обрана жодна кампанія
    if (!activeCampaignId || characters.length === 0) {
      return (
        <div className="flex flex-col items-center justify-center text-center py-16 px-6 max-w-md mx-auto">
          <div className="w-12 h-12 rounded-xl bg-[#1A0D10] border border-[#5A0010] flex items-center justify-center mb-3 text-[#FCA5A5]">
            <Swords size={22} />
          </div>
          <span className="text-sm font-semibold text-[#E5E7EB]">
            Немає активної пригоди
          </span>
          <span className="text-xs text-[#6B7280] mt-1.5 leading-relaxed">
            {characters.length === 0
              ? 'У вас ще немає жодного персонажа. Створіть героя, щоб розпочати свою історію.'
              : 'Оберіть існуючу кампанію в боковому меню або створіть нову пригоду для цього героя.'}
          </span>
          <div className="mt-4">
            <Button variant="primary" size="sm" onClick={handleStartAdventure}>
              <Swords size={13} />
              <span>Розпочати нову кампанію</span>
            </Button>
          </div>
        </div>
      );
    }

    // 4. Кампанія обрана, але історія поки порожня
    return (
      <div className="flex flex-col items-center justify-center text-center py-20 text-[#6B7280]">
        <span className="text-sm font-medium">Кампанія готова до початку</span>
        <span className="text-xs text-[#4B5563] mt-1">
          Введіть дію персонажа або надиктуйте фразу голосом
        </span>
      </div>
    );
  };

  return (
    <div className="relative flex-1 bg-[#111111] border border-[#2A2A2A] rounded-[10px] p-[20px_10px_4px_10px] overflow-hidden flex flex-col shadow-inner">
      {/* Нейтральний індикатор завантаження при перемиканні кампаній поверх існуючого логу */}
      {isLoading && !isStreaming && messages.length > 0 && (
        <div className="absolute top-3 right-5 z-20 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-[#181818]/90 border border-[#2A2A2A] text-[11px] text-[#9CA3AF] shadow-md select-none">
          <Loader2 size={12} className="animate-spin text-[#9CA3AF]" />
          <span>Завантаження історії...</span>
        </div>
      )}

      {/* Скрол-контейнер із симетричним вертикальним фейдом (0.00..0.02 та 0.98..1.00) */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto pr-4 mask-fade-vertical"
      >
        <div className="flex flex-col min-h-full justify-end pt-[18px]">
          {messages.length === 0
            ? renderEmptyOrOfflineState()
            : messages.map((msg, idx) => {
                const canRollback =
                  idx === lastNarratorIndex && !isLoading && !isStreaming;
                return (
                  <ChatBubble
                    key={msg.id || idx}
                    message={msg}
                    canRollback={canRollback}
                  />
                );
              })}

          <div className="mb-2" />
        </div>
      </div>
    </div>
  );
};
