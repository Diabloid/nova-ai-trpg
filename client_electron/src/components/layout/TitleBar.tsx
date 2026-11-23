import React, { useEffect, useRef, useState } from 'react';
import { Minus, Square, Copy, X, RefreshCw, Keyboard, Globe, Swords } from 'lucide-react';
import { useGameStore } from '../../store/useGameStore';
import { useWizardStore } from '../../store/useWizardStore';
import { useWorldStudioStore } from '../../store/useWorldStudioStore';
import { RUBY_BUTTON_SURFACE_CLASS } from '../ui/Button';

export const TitleBar: React.FC = () => {
  const [isMaximized, setIsMaximized] = useState(false);
  const [isPopoverOpen, setIsPopoverOpen] = useState(false);
  const popoverRef = useRef<HTMLDivElement>(null);

  const backendOffline = useGameStore((s) => s.backendOffline);
  const isLoading = useGameStore((s) => s.isLoading);
  const isStreaming = useGameStore((s) => s.isStreaming);
  const isEditingNarrator = useGameStore((s) => s.isEditingNarrator);
  const activeWorldId = useGameStore((s) => s.activeWorldId);
  const activeWorldDetail = useGameStore((s) => s.activeWorldDetail);
  const worlds = useGameStore((s) => s.worlds);
  const activeCampaign = useGameStore((s) => s.activeCampaign);
  const loadWorlds = useGameStore((s) => s.loadWorlds);
  const loadCharacters = useGameStore((s) => s.loadCharacters);

  const isWizardBusy = useWizardStore((s) => s.isSyncingDraft || s.isLoadingWorldSchema);
  const isWorldStudioBusy = useWorldStudioStore(
    (s) =>
      s.isGeneratingPassport ||
      s.isGeneratingTemplate ||
      s.isGeneratingPrompts ||
      s.isLoadingWorld
  );

  const isAiBusy = isLoading || isStreaming || isEditingNarrator || isWizardBusy || isWorldStudioBusy;

  useEffect(() => {
    // Check initial state
    window.electronAPI?.isMaximized().then(setIsMaximized);

    // Subscribe to maximize changes
    const cleanup = window.electronAPI?.onMaximizedChange((max) => {
      setIsMaximized(max);
    });

    return () => {
      cleanup?.();
    };
  }, []);

  useEffect(() => {
    if (!isPopoverOpen) return;

    const handleMouseDown = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        setIsPopoverOpen(false);
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsPopoverOpen(false);
      }
    };

    document.addEventListener('mousedown', handleMouseDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleMouseDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isPopoverOpen]);

  const activeWorldTitle =
    activeWorldDetail?.title ||
    worlds.find((w) => w.world_id === activeWorldId)?.title ||
    activeWorldId ||
    'Стандартний світ';

  const dotClass = backendOffline
    ? 'bg-danger animate-pulse'
    : isAiBusy
      ? 'bg-warning animate-pulse'
      : 'bg-accent-ruby';

  const statusTooltip = backendOffline
    ? 'Стан рушія: Офлайн (очікування сервера)'
    : isAiBusy
      ? 'Стан рушія: Генерація ШІ...'
      : 'Стан рушія: Онлайн • Готовий до гри';

  const handleReconnect = () => {
    void (async () => {
      await loadWorlds();
      await loadCharacters();
    })().catch(() => {});
  };

  const handleMinimize = () => {
    window.electronAPI?.minimize();
  };

  const handleMaximize = () => {
    window.electronAPI?.maximize();
  };

  const handleClose = () => {
    window.electronAPI?.close();
  };

  return (
    <header className="relative w-full h-[34px] bg-[#121212] border-b border-[#222222] flex items-center justify-between select-none shrink-0 z-50">
      {/* Free draggable region (left & center) */}
      <div className="flex-1 h-full flex items-center pl-2.5 drag-region">
        <div ref={popoverRef} className="relative no-drag flex items-center">
          <button
            type="button"
            onClick={() => setIsPopoverOpen((prev) => !prev)}
            data-tooltip={statusTooltip}
            aria-label="Стан системи NOVA AI TRPG"
            aria-expanded={isPopoverOpen}
            className={`w-6 h-6 rounded-md flex items-center justify-center transition-all duration-150 cursor-pointer no-drag ${
              isPopoverOpen
                ? 'bg-[#1E1E1E] ring-1 ring-[#7E0018]/65'
                : 'hover:bg-[#1E1E1E]'
            }`}
          >
            <span
              className={`w-2.5 h-2.5 rounded-full transition-transform duration-200 ${
                isPopoverOpen ? 'scale-110' : 'scale-100'
              } ${dotClass}`}
            />
          </button>

          <div
            aria-hidden={!isPopoverOpen}
            className={`absolute top-[30px] left-0 w-[300px] bg-[#161616]/95 backdrop-blur-md border border-[#2A2A2A] shadow-[0_18px_42px_-8px_rgba(0,0,0,0.9),inset_0_1px_0_rgba(255,255,255,0.05)] p-3.5 z-50 text-xs select-none origin-[12px_-12px] will-change-[transform,scale,translate,opacity,border-radius,filter] transition-all ${
              isPopoverOpen
                ? 'opacity-100 scale-100 translate-y-0 rounded-xl blur-0 pointer-events-auto duration-[380ms] ease-[cubic-bezier(0.16,1.08,0.3,1)]'
                : 'opacity-0 scale-[0.04] -translate-y-1.5 rounded-[48px] blur-[4px] pointer-events-none duration-[240ms] ease-[cubic-bezier(0.4,0,0.2,1)]'
            }`}
          >
            <div
              className={`flex flex-col gap-3 transition-opacity ${
                isPopoverOpen
                  ? 'opacity-100 duration-250 delay-100'
                  : 'opacity-0 duration-100 delay-0'
              }`}
            >
              {/* Заголовок та статус-бейдж */}
              <div className="flex items-center justify-between gap-2 pb-2 border-b border-[#242424]">
                <span className="font-bold text-[#F3F4F6] text-[12px] tracking-wide">
                  NOVA AI TRPG • Стан системи
                </span>
                <span
                  className={`px-2 py-0.5 rounded-full text-[10px] font-semibold border ${
                    backendOffline
                      ? 'bg-[#2A1414] border-[#7F1D1D] text-[#FCA5A5]'
                      : isAiBusy
                        ? 'bg-[#2A2112] border-[#92400E] text-[#FDE047]'
                        : 'bg-[#10261D] border-[#065F46] text-[#34D399]'
                  }`}
                >
                  {backendOffline ? 'Офлайн' : isAiBusy ? 'Генерація...' : 'Онлайн'}
                </span>
              </div>

              {/* Коротке зведення: активний світ та кампанія */}
              <div className="flex flex-col gap-1.5 text-[11px]">
                <div className="flex items-center justify-between gap-2">
                  <span className="inline-flex items-center gap-1.5 text-[#9CA3AF]">
                    <Globe size={12} className="text-[#9CA3AF]" />
                    <span>Світ:</span>
                  </span>
                  <span className="text-[#E5E7EB] font-medium truncate max-w-[175px]">
                    {activeWorldTitle}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <span className="inline-flex items-center gap-1.5 text-[#9CA3AF]">
                    <Swords size={12} className="text-[#9CA3AF]" />
                    <span>Кампанія:</span>
                  </span>
                  <span className="text-[#E5E7EB] font-medium truncate max-w-[175px]">
                    {activeCampaign?.title || 'Головне меню'}
                  </span>
                </div>
              </div>

              {/* Міні-довідник гарячих клавіш */}
              <div className="pt-2 border-t border-[#242424] flex flex-col gap-1.5">
                <div className="inline-flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-[#6B7280] font-semibold">
                  <Keyboard size={11} />
                  <span>Гарячі клавіші</span>
                </div>
                <div className="grid grid-cols-[auto_1fr] gap-x-2.5 gap-y-1 text-[11px]">
                  <span className="font-mono text-[#D1D5DB]">Enter</span>
                  <span className="text-[#9CA3AF]">надіслати дію</span>
                  <span className="font-mono text-[#D1D5DB]">Shift + Enter</span>
                  <span className="text-[#9CA3AF]">новий рядок</span>
                  <span className="font-mono text-[#D1D5DB]">Ctrl + Z / Y</span>
                  <span className="text-[#9CA3AF]">відмінити / повернути</span>
                  <span className="font-mono text-[#D1D5DB]">Ctrl + Enter</span>
                  <span className="text-[#9CA3AF]">зберегти редагування</span>
                </div>
              </div>

              {/* Кнопка швидкого перепідключення в офлайні */}
              {backendOffline && (
                <button
                  type="button"
                  tabIndex={isPopoverOpen ? 0 : -1}
                  disabled={isLoading}
                  onClick={handleReconnect}
                  className={`w-full inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold enabled:active:scale-[0.98] transition-all enabled:cursor-pointer disabled:opacity-50 disabled:cursor-default ${RUBY_BUTTON_SURFACE_CLASS}`}
                >
                  <RefreshCw size={12} className={isLoading ? 'animate-spin' : ''} />
                  <span>Перевірити зв&apos;язок</span>
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Center Title (over header, non-interactive so drag passes through) */}
      <div className="absolute left-1/2 -translate-x-1/2 text-[11px] font-semibold tracking-[0.2em] text-[#888888] uppercase pointer-events-none">
        NOVA AI TRPG
      </div>

      {/* Right Window Controls */}
      <div className="flex items-center h-full no-drag shrink-0">
        <button
          type="button"
          onClick={handleMinimize}
          className="w-[46px] h-[34px] inline-flex items-center justify-center text-[#888888] hover:text-[#FFFFFF] hover:bg-[#222222] transition-colors cursor-pointer no-drag"
          data-tooltip="Згорнути"
        >
          <Minus size={13} strokeWidth={2} />
        </button>

        <button
          type="button"
          onClick={handleMaximize}
          className="w-[46px] h-[34px] inline-flex items-center justify-center text-[#888888] hover:text-[#FFFFFF] hover:bg-[#222222] transition-colors cursor-pointer no-drag"
          data-tooltip={isMaximized ? 'Відновити' : 'Розгорнути'}
        >
          {isMaximized ? (
            <Copy size={11} strokeWidth={2} className="rotate-90" />
          ) : (
            <Square size={11} strokeWidth={2} />
          )}
        </button>

        <button
          type="button"
          onClick={handleClose}
          className="w-[46px] h-[34px] inline-flex items-center justify-center text-[#888888] hover:text-white hover:bg-[#7E0018] transition-colors cursor-pointer no-drag"
          data-tooltip="Закрити"
        >
          <X size={14} strokeWidth={2} />
        </button>
      </div>
    </header>
  );
};
