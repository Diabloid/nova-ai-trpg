import React, { useRef, useState, useEffect, useCallback } from 'react';
import { RefreshCw, Swords, WifiOff, Loader2, ArrowDown, Sparkles, MapPin } from 'lucide-react';
import { useGameStore } from '../../store/useGameStore';
import { useWizardStore } from '../../store/useWizardStore';
import { hexToRgba } from '../../utils/lucideIconMap';
import { DynamicLucideIcon } from '../ui/DynamicLucideIcon';
import { ChatBubble } from './ChatBubble';
import { RollbackGhost } from './RollbackGhost';
import { ChatInput } from '../input/ChatInput';
import { Button } from '../ui/Button';

interface ChatContainerProps {
  onNewCampaign?: () => void;
}

export const ChatContainer: React.FC<ChatContainerProps> = ({ onNewCampaign }) => {
  const {
    messages,
    isLoading,
    isStreaming,
    isRollingBack,
    activeCampaignRollbackDepth,
    backendOffline,
    activeCampaignId,
    activeWorldId,
    activeWorldDetail,
    characters,
    loadWorlds,
    loadCharacters,
  } = useGameStore();
  const openWizard = useWizardStore((s) => s.openWizard);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [isNearBottom, setIsNearBottom] = useState(true);
  const isNearBottomRef = useRef(true);
  const prevCampaignIdRef = useRef<string | null>(activeCampaignId);
  const pendingCampaignScrollRef = useRef<boolean>(true);

  const handleScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const near = el.scrollHeight - el.scrollTop - el.clientHeight <= 100;
    if (near !== isNearBottomRef.current) {
      isNearBottomRef.current = near;
      setIsNearBottom(near);
    }
  }, []);

  const scrollToBottom = useCallback((behavior: ScrollBehavior = 'smooth') => {
    const el = scrollRef.current;
    if (!el) return;
    isNearBottomRef.current = true;
    setIsNearBottom(true);
    el.scrollTo({
      top: el.scrollHeight,
      behavior,
    });
  }, []);

  // Розумний автоскрол: донизу при перемиканні кампанії або коли користувач біля нижнього краю
  useEffect(() => {
    if (activeCampaignId !== prevCampaignIdRef.current) {
      prevCampaignIdRef.current = activeCampaignId;
      pendingCampaignScrollRef.current = true;
    }

    const el = scrollRef.current;
    if (!el) return;

    if (pendingCampaignScrollRef.current && !isLoading) {
      pendingCampaignScrollRef.current = false;
      isNearBottomRef.current = true;
      el.scrollTo({ top: el.scrollHeight, behavior: 'auto' });
      const rafId = requestAnimationFrame(handleScroll);
      return () => cancelAnimationFrame(rafId);
    }

    if (isNearBottomRef.current) {
      el.scrollTo({
        top: el.scrollHeight,
        behavior: isStreaming ? 'auto' : 'smooth',
      });
    }
  }, [messages, isStreaming, isLoading, activeCampaignId, handleScroll]);

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
      openWizard(activeWorldId);
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
                void (async () => {
                  await loadWorlds();
                  await loadCharacters();
                })().catch(() => {});
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

    // 3A. Світ без героїв: показуємо візитівку обраного світу
    if (characters.length === 0 && activeWorldDetail) {
      const worldColor = activeWorldDetail.accent_color || '#7E0018';
      const worldLocations = Array.isArray(activeWorldDetail.starting_locations)
        ? activeWorldDetail.starting_locations.filter((loc) => typeof loc === 'string' && loc.trim())
        : [];

      return (
        <div className="flex flex-col items-center justify-center py-10 px-4 max-w-xl mx-auto">
          <div
            className="w-full rounded-2xl bg-[#161616]/90 border p-6 flex flex-col items-center text-center shadow-2xl"
            style={{ borderColor: hexToRgba(worldColor, 0.38) }}
          >
            <div
              className="w-14 h-14 rounded-2xl border flex items-center justify-center mb-3.5 shrink-0 shadow-inner"
              style={{
                backgroundColor: hexToRgba(worldColor, 0.16),
                borderColor: hexToRgba(worldColor, 0.48),
              }}
            >
              <DynamicLucideIcon
                icon={activeWorldDetail.icon || 'globe'}
                size={26}
                style={{ color: worldColor }}
              />
            </div>

            {activeWorldDetail.genre && (
              <span
                className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold border mb-2"
                style={{
                  backgroundColor: hexToRgba(worldColor, 0.12),
                  borderColor: hexToRgba(worldColor, 0.35),
                  color: '#F3F4F6',
                }}
              >
                {activeWorldDetail.genre}
              </span>
            )}

            <h2 className="text-lg font-bold text-[#F9FAFB] break-words">
              {activeWorldDetail.title}
            </h2>

            {activeWorldDetail.description && (
              <p className="text-xs text-[#9CA3AF] mt-2 leading-relaxed break-words max-w-md">
                {activeWorldDetail.description}
              </p>
            )}

            {worldLocations.length > 0 && (
              <div className="mt-4 w-full pt-3.5 border-t border-[#262626] flex flex-col items-center gap-2">
                <span className="text-[10px] font-bold uppercase tracking-wider text-[#6B7280]">
                  Стартові локації світу
                </span>
                <div className="flex flex-wrap items-center justify-center gap-1.5">
                  {worldLocations.map((loc, idx) => (
                    <span
                      key={`${loc}-${idx}`}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-[#111111] border border-[#2A2A2A] text-[11px] text-[#D1D5DB] break-words"
                    >
                      <MapPin size={11} style={{ color: worldColor }} className="shrink-0" />
                      <span>{loc}</span>
                    </span>
                  ))}
                </div>
              </div>
            )}

            <div className="mt-5">
              <Button
                variant="primary"
                size="md"
                onClick={() => {
                  openWizard(activeWorldId);
                }}
              >
                <Sparkles size={14} />
                <span>Створити першого героя для цього світу</span>
              </Button>
            </div>
          </div>
        </div>
      );
    }

    // 3B. Немає героя або не обрана жодна кампанія
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
              ? 'У цьому світі ще немає жодного персонажа. Створіть героя, щоб розпочати свою історію.'
              : 'Оберіть існуючу кампанію в боковому меню або створіть нову пригоду для цього героя.'}
          </span>
          <div className="mt-4">
            <Button variant="primary" size="sm" onClick={handleStartAdventure}>
              <Swords size={13} />
              <span>
                {characters.length === 0
                  ? 'Створити першого героя'
                  : 'Розпочати нову кампанію'}
              </span>
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
    <div className="relative flex-1 bg-[#111111] border border-[#262626] rounded-xl p-4 pb-3 overflow-hidden flex flex-col shadow-lg">
      <div className="relative flex-1 min-h-0 flex flex-col">
        {/* Нейтральний індикатор завантаження при перемиканні кампаній поверх існуючого логу */}
        {isLoading && !isStreaming && messages.length > 0 && (
          <div className="absolute top-1 right-3 z-20 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-[#181818]/90 border border-[#2A2A2A] text-[11px] text-[#9CA3AF] shadow-md select-none">
            <Loader2 size={12} className="animate-spin text-[#9CA3AF]" />
            <span>Завантаження історії...</span>
          </div>
        )}

        {/* Скрол-контейнер із симетричним вертикальним фейдом (0.00..0.02 та 0.98..1.00) */}
        <div
          ref={scrollRef}
          onScroll={handleScroll}
          className="flex-1 overflow-y-auto pr-2 mask-fade-vertical"
        >
          <div className="flex flex-col min-h-full justify-end pt-[18px]">
            {messages.length === 0
              ? renderEmptyOrOfflineState()
              : messages.map((msg, idx) => {
                  const canRollback =
                    idx === lastNarratorIndex &&
                    lastNarratorIndex > 0 &&
                    activeCampaignRollbackDepth > 0 &&
                    msg.canRollback !== false &&
                    !isLoading &&
                    !isStreaming &&
                    !isRollingBack;
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

        {/* Плаваюча кнопка повернення до останніх повідомлень при прокрутці вгору */}
        {messages.length > 0 && (
          <button
            type="button"
            onClick={() => scrollToBottom('smooth')}
            tabIndex={!isNearBottom ? 0 : -1}
            aria-hidden={isNearBottom}
            className={`absolute bottom-3 right-4 z-20 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border shadow-lg transition-[opacity,translate,background-color,border-color,color] duration-200 ease-in-out enabled:cursor-pointer select-none ${
              !isNearBottom
                ? 'opacity-100 translate-y-0 pointer-events-auto'
                : 'opacity-0 translate-y-2 pointer-events-none'
            } ${
              isStreaming
                ? 'bg-[#2A1418] border-[#EAB308]/60 text-[#FDE047] enabled:hover:bg-[#3A181F]'
                : 'bg-[#181818] border-[#333333] text-[#E5E7EB] enabled:hover:bg-[#222222] enabled:hover:border-[#5A0010]'
            }`}
          >
            <ArrowDown
              size={13}
              className={isStreaming ? 'text-[#EAB308] animate-pulse' : 'text-[#9CA3AF]'}
            />
            <span>Останні повідомлення</span>
          </button>
        )}
      </div>

      {/* Вкладений звужений глибокий док вводу всередині єдиної рамки чату */}
      <ChatInput />

      <RollbackGhost />
    </div>
  );
};
