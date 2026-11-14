import React from 'react';
import { WifiOff } from 'lucide-react';
import { useGameStore } from '../../store/useGameStore';

export const HeaderStatusBar: React.FC = () => {
  const {
    activeCharacter,
    activeCampaign,
    playerState,
    backendOffline,
    isCharacterDrawerOpen,
    toggleCharacterDrawer,
  } = useGameStore();

  const state = playerState || activeCharacter;
  const heroName = state?.meta?.name || 'Безіменний герой';
  const location =
    activeCampaign?.current_location || state?.meta?.location || 'Невідома локація';
  const hpText = state?.anatomy_and_health?.overall_state;

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
        className={`w-full bg-[#1A1A1A] border border-[#2A2A2A] rounded-[10px] px-5 py-2.5 transition-all duration-180 flex items-center justify-between shadow-md group ${
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
            {/* Ліва частина: Інфо персонажа */}
            <div className="flex items-center gap-3 min-w-0">
              <span className="text-[16px] leading-none shrink-0" role="img" aria-label="avatar">
                👤
              </span>
              <div className="flex flex-col text-left min-w-0">
                <span className="text-[15px] font-bold text-[#F3F4F6] truncate leading-tight group-hover:text-white transition-colors">
                  {heroName}
                </span>
                <span className="text-[12px] text-[#9CA3AF] truncate leading-tight mt-0.5">
                  {location}
                </span>
              </div>
            </div>

            {/* Центральна частина: Загальний стан здоров'я (показується лише після завантаження даних) */}
            {state && (
              <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-[#2A1414]/60 border border-[#4A1818]/80">
                <span className="text-[14px] text-[#EF4444] leading-none">❤</span>
                <span className="text-[14px] font-semibold text-[#FCA5A5] leading-none">
                  {hpText || 'Здоровий'}
                </span>
              </div>
            )}

            {/* Права частина: Індикатор шторки зі стрілочкою ▼ */}
            <div className="flex items-center gap-2 text-[#9CA3AF] group-hover:text-white transition-colors ml-2 shrink-0">
              <span
                className={`text-[12px] inline-block transition-transform duration-200 ${
                  isCharacterDrawerOpen ? 'rotate-180 text-[#EF4444]' : 'rotate-0'
                }`}
              >
                ▼
              </span>
            </div>
          </>
        )}
      </button>
    </div>
  );
};
