import React from 'react';
import { WifiOff, User, Heart, ChevronDown } from 'lucide-react';
import { useGameStore } from '../../store/useGameStore';

export const HeaderStatusBar: React.FC = () => {
  const {
    activeCharacter,
    activeCampaign,
    playerState,
    backendOffline,
    isSidebarOpen,
    isCharacterDrawerOpen,
    toggleCharacterDrawer,
  } = useGameStore();

  const state = playerState || activeCharacter;
  const heroName = state?.meta?.name || 'Безіменний герой';
  const location =
    activeCampaign?.current_location || state?.meta?.location || 'Невідома локація';
  const hpText = state?.anatomy_and_health?.overall_state || 'Здоровий';

  return (
    <div className="w-full select-none">
      {/* Клікабельна плашка персонажа (відкриває/закриває детальну шторку) */}
      <button
        type="button"
        disabled={backendOffline}
        onClick={toggleCharacterDrawer}
        title={
          backendOffline
            ? 'Очікування підключення до сервера гри'
            : isCharacterDrawerOpen
              ? 'Згорнути детальну шторку'
              : 'Розгорнути детальну шторку листа персонажа'
        }
        className={`w-full bg-[#1A1A1A] border border-[#2A2A2A] rounded-[10px] px-5 py-2.5 transition-all duration-180 flex items-center justify-between gap-3 shadow-md group ${
          backendOffline
            ? 'opacity-80 cursor-default'
            : 'hover:bg-[#1E1E1E] active:bg-[#161616] hover:border-[#4A1218] active:border-[#5A0010] active:translate-y-[2px] active:scale-[0.985] cursor-pointer'
        }`}
      >
        {backendOffline ? (
          <div className="flex items-center gap-3 min-w-0 py-1">
            <WifiOff size={16} className="text-[#6B7280] shrink-0" />
            <span className="text-[14px] font-medium text-[#9CA3AF] truncate">
              Очікування підключення...
            </span>
          </div>
        ) : (
          <>
            {/* Ліва частина: Інфо персонажа + бейдж активної кампанії */}
            <div className="flex items-center gap-3 min-w-0 flex-1">
              <div className="w-7 h-7 rounded-lg bg-[#222222] border border-[#2E2E2E] flex items-center justify-center text-[#9CA3AF] group-hover:text-white shrink-0 transition-colors">
                <User size={15} />
              </div>
              <div className="flex flex-col text-left min-w-0">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-[15px] font-bold text-[#F3F4F6] truncate leading-tight group-hover:text-white transition-colors">
                    {heroName}
                  </span>
                  {activeCampaign?.title && (
                    <span
                      title={`Активна кампанія: ${activeCampaign.title}`}
                      className={`px-2 py-0.5 rounded-md bg-[#222222] border border-[#2F2F2F] text-[10px] font-medium text-[#D1D5DB] truncate max-w-[160px] shrink-0 transition-opacity ${
                        isSidebarOpen ? 'hidden md:inline-block opacity-75' : 'inline-block opacity-100'
                      }`}
                    >
                      {activeCampaign.title}
                    </span>
                  )}
                </div>
                <span className="text-[12px] text-[#9CA3AF] truncate leading-tight mt-0.5">
                  {location}
                </span>
              </div>
            </div>

            {/* Центральна частина: Загальний стан здоров'я із захистом від переповнення */}
            {state && (
              <div
                title={hpText}
                className="flex items-center gap-2 px-3 py-1 rounded-full bg-[#2A1414]/60 border border-[#4A1818]/80 max-w-[200px] sm:max-w-[260px] min-w-0 shrink-0"
              >
                <Heart size={13} className="text-[#EF4444] fill-[#EF4444]/40 shrink-0" />
                <span className="text-[13px] font-semibold text-[#FCA5A5] leading-none truncate">
                  {hpText}
                </span>
              </div>
            )}

            {/* Права частина: Індикатор шторки */}
            <div className="flex items-center gap-2 text-[#9CA3AF] group-hover:text-white transition-colors shrink-0">
              <ChevronDown
                size={15}
                className={`transition-transform duration-200 ${
                  isCharacterDrawerOpen ? 'rotate-180 text-[#EF4444]' : 'rotate-0'
                }`}
              />
            </div>
          </>
        )}
      </button>
    </div>
  );
};
