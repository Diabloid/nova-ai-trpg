import React, { useMemo } from 'react';
import { WifiOff, Heart, ChevronDown, Sparkles } from 'lucide-react';
import { useGameStore } from '../../store/useGameStore';
import { extractHeaderAnchors } from '../../utils/dynamicSheetParser';
import { hexToRgba } from '../../utils/lucideIconMap';
import { DynamicLucideIcon } from '../dynamic-sheet';
import { HeroAvatar } from '../ui/HeroAvatar';

export const HeaderStatusBar: React.FC = () => {
  const {
    characters,
    activeCharacter,
    activeCampaign,
    activeWorldId,
    activeWorldDetail,
    worlds,
    playerState,
    backendOffline,
    isSidebarOpen,
    isCharacterDrawerOpen,
    toggleCharacterDrawer,
  } = useGameStore();

  const state = playerState || activeCharacter;

  const anchors = useMemo(
    () => extractHeaderAnchors(state, activeCampaign),
    [state, activeCampaign]
  );

  const heroName = anchors.name || 'Безіменний герой';
  const location = anchors.location || 'Невідома локація';
  const overallState = anchors.overallState;
  const avatar = anchors.avatar;

  const isWorldEmpty = !backendOffline && characters.length === 0;
  const activeWorld =
    activeWorldDetail || worlds.find((w) => w.world_id === activeWorldId) || null;
  const worldColor = activeWorld?.accent_color || '#7E0018';
  const isBarDisabled = backendOffline || isWorldEmpty;

  return (
    <div className="w-full select-none">
      {/* Клікабельна плашка персонажа (відкриває/закриває детальну шторку) */}
      <button
        type="button"
        disabled={isBarDisabled}
        onClick={toggleCharacterDrawer}
        title={
          backendOffline
            ? 'Очікування підключення до сервера гри'
            : isWorldEmpty
              ? `Світ «${activeWorld?.title || activeWorldId}» очікує на першого героя`
              : isCharacterDrawerOpen
                ? 'Згорнути детальну шторку'
                : 'Розгорнути детальну шторку листа персонажа'
        }
        className={`w-full bg-[#1A1A1A] border border-[#2A2A2A] rounded-[10px] px-5 py-2.5 transition-all duration-180 flex items-center justify-between gap-3 shadow-md group ${
          isBarDisabled
            ? 'opacity-90 disabled:cursor-default'
            : 'enabled:hover:bg-[#1E1E1E] enabled:active:bg-[#161616] enabled:hover:border-[#4A1218] enabled:active:border-[#5A0010] enabled:active:translate-y-[2px] enabled:active:scale-[0.985] enabled:cursor-pointer'
        }`}
      >
        {backendOffline ? (
          <div className="flex items-center gap-3 min-w-0 py-1">
            <WifiOff size={16} className="text-[#6B7280] shrink-0" />
            <span className="text-[14px] font-medium text-[#9CA3AF] truncate">
              Очікування підключення...
            </span>
          </div>
        ) : isWorldEmpty ? (
          <>
            <div className="flex items-center gap-3 min-w-[130px] flex-1">
              <div
                className="w-7 h-7 rounded-lg border flex items-center justify-center shrink-0"
                style={{
                  backgroundColor: hexToRgba(worldColor, 0.14),
                  borderColor: hexToRgba(worldColor, 0.42),
                }}
              >
                <DynamicLucideIcon
                  icon={activeWorld?.icon || 'globe'}
                  size={15}
                  style={{ color: worldColor }}
                />
              </div>

              <div className="flex flex-col text-left min-w-0">
                <span className="text-[15px] font-bold text-[#F3F4F6] truncate leading-tight">
                  {activeWorld?.title || 'Обраний світ'}
                </span>
                <span className="text-[12px] text-[#9CA3AF] truncate leading-tight mt-0.5">
                  {activeWorld?.genre
                    ? `${activeWorld.genre} • Очікує першого героя`
                    : 'Світ порожній — створіть першого героя'}
                </span>
              </div>
            </div>

            <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#1F1F1F] border border-[#2E2E2E] text-[12px] font-medium text-[#D1D5DB] shrink-0">
              <Sparkles size={13} style={{ color: worldColor }} className="shrink-0" />
              <span>Готовий до пригод</span>
            </div>
          </>
        ) : (
          <>
            {/* Ліва частина: Аватар + Ім'я + бейдж активної кампанії + Локація */}
            <div className="flex items-center gap-3 min-w-[130px] flex-1">
              <HeroAvatar
                avatar={avatar}
                name={heroName}
                iconSize={15}
                iconClassName="text-[#9CA3AF] group-hover:text-white transition-colors"
                containerClassName="w-7 h-7 rounded-lg bg-[#222222] border border-[#2E2E2E] transition-colors"
              />

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

            {/* Права-центральна група: headerBadges + головний статус overallState */}
            <div className="flex items-center justify-end gap-2 min-w-0 shrink">
              {anchors.headerBadges.length > 0 && (
                <div className="hidden md:flex items-center gap-1.5 min-w-0 shrink overflow-hidden">
                  {anchors.headerBadges.slice(0, 3).map((badge) => (
                    <div
                      key={badge.key}
                      title={`${badge.label}: ${badge.value}`}
                      className="flex items-center gap-1.5 px-2.5 py-1 rounded-full border max-w-[135px] min-w-0 shrink"
                      style={{
                        backgroundColor: hexToRgba(badge.color, 0.14),
                        borderColor: hexToRgba(badge.color, 0.38),
                      }}
                    >
                      <DynamicLucideIcon
                        icon={badge.icon}
                        size={12}
                        className="shrink-0"
                        style={{ color: badge.color }}
                      />
                      <span className="text-[11px] font-medium text-[#D1D5DB] truncate">
                        {badge.label}:{' '}
                        <strong className="text-white font-semibold">{badge.value}</strong>
                      </span>
                    </div>
                  ))}
                </div>
              )}

              {state && overallState && (
                <div
                  title={overallState}
                  className="flex items-center gap-2 px-3 py-1 rounded-full bg-[#2A1414]/60 border border-[#4A1818]/80 max-w-[180px] sm:max-w-[240px] min-w-0 shrink-0"
                >
                  <Heart size={13} className="text-[#EF4444] fill-[#EF4444]/40 shrink-0" />
                  <span className="text-[13px] font-semibold text-[#FCA5A5] leading-none truncate">
                    {overallState}
                  </span>
                </div>
              )}

              {/* Індикатор шторки */}
              <div className="flex items-center gap-2 text-[#9CA3AF] group-hover:text-white transition-colors shrink-0 ml-1">
                <ChevronDown
                  size={15}
                  className={`transition-transform duration-200 ${
                    isCharacterDrawerOpen ? 'rotate-180 text-[#EF4444]' : 'rotate-0'
                  }`}
                />
              </div>
            </div>
          </>
        )}
      </button>
    </div>
  );
};
