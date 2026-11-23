import React, { useMemo } from 'react';
import { WifiOff, Heart, ChevronDown, Sparkles, MapPin } from 'lucide-react';
import { useGameStore } from '../../store/useGameStore';
import { extractHeaderAnchors } from '../../utils/dynamicSheet';
import { hexToRgba } from '../../utils/lucideIconMap';
import { DynamicLucideIcon } from '../ui/DynamicLucideIcon';
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

  const handleToggleDrawer = (e: React.MouseEvent<HTMLButtonElement>) => {
    if (e.detail > 0) {
      e.currentTarget.blur();
    }
    toggleCharacterDrawer();
  };

  return (
    <div className="w-full select-none">
      {/* Клікабельна плашка персонажа (відкриває/закриває детальну шторку) */}
      <button
        type="button"
        disabled={isBarDisabled}
        onClick={handleToggleDrawer}
        data-tooltip={
          backendOffline
            ? 'Очікування підключення до сервера гри'
            : isWorldEmpty
              ? `Світ «${activeWorld?.title || activeWorldId}» очікує на першого героя`
              : isCharacterDrawerOpen
                ? 'Згорнути детальну шторку'
                : 'Розгорнути детальну шторку листа персонажа'
        }
        className={`w-full bg-gradient-to-b from-[#1A1A1A] to-[#151515] border border-[#2A2A2A] rounded-xl px-4 py-2.5 transition-all duration-180 flex items-center justify-between gap-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.04),0_8px_24px_-8px_rgba(0,0,0,0.65)] group ${
          isBarDisabled
            ? 'opacity-90 disabled:cursor-default'
            : 'enabled:hover:from-[#1D1D1D] enabled:hover:to-[#171717] enabled:active:from-[#161616] enabled:active:to-[#131313] enabled:hover:border-[#5A1220] enabled:active:border-[#7E0018] enabled:active:translate-y-[1px] enabled:active:scale-[0.992] enabled:cursor-pointer'
        }`}
      >
        {backendOffline ? (
          <>
            <div className="flex items-center gap-3 min-w-0 py-1 flex-1">
              <WifiOff size={16} className="text-[#EF4444] shrink-0" />
              <span className="text-[14px] font-semibold text-[#FCA5A5] truncate">
                Сервер офлайн • Очікування підключення...
              </span>
            </div>
            <div className="px-2.5 py-0.5 rounded-full bg-[#2A1414]/70 border border-[#5A0010] text-[11px] font-medium text-[#FCA5A5] shrink-0">
              Офлайн
            </div>
          </>
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
                iconSize={17}
                iconClassName="text-[#9CA3AF] group-hover:text-white transition-colors"
                containerClassName="w-9 h-9 rounded-lg bg-[#1E1E1E] border border-[#323232] group-enabled:group-hover:border-[#5A1220] shadow-[inset_0_1px_0_rgba(255,255,255,0.05)] transition-colors"
              />

              <div className="flex flex-col text-left min-w-0">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-[15px] font-bold text-[#F3F4F6] tracking-tight truncate leading-tight group-hover:text-white transition-colors">
                    {heroName}
                  </span>
                  {activeCampaign?.title && (
                    <span
                      data-tooltip={`Активна кампанія: ${activeCampaign.title}`}
                      className={`px-2 py-0.5 rounded-md bg-[#202020] border border-[#303030] shadow-[inset_0_1px_0_rgba(255,255,255,0.03)] text-[10.5px] font-medium text-[#D1D5DB] truncate max-w-[170px] shrink-0 transition-opacity ${
                        isSidebarOpen ? 'hidden md:inline-block opacity-75' : 'inline-block opacity-100'
                      }`}
                    >
                      {activeCampaign.title}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-1.5 min-w-0 mt-0.5">
                  <MapPin size={11} className="text-[#6B7280] shrink-0" />
                  <span className="text-[12px] text-[#9CA3AF] truncate leading-tight">
                    {location}
                  </span>
                </div>
              </div>
            </div>

            {/* Права-центральна група: headerBadges + головний статус overallState */}
            <div className="flex items-center justify-end gap-2 min-w-0 shrink">
              {anchors.headerBadges.length > 0 && (
                <div className="hidden md:flex items-center gap-1.5 min-w-0 shrink overflow-hidden">
                  {anchors.headerBadges.slice(0, 3).map((badge) => (
                    <div
                      key={badge.key}
                      data-tooltip={`${badge.label}: ${badge.value}`}
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
                  data-tooltip={overallState}
                  className="flex items-center gap-2 px-3 py-1 rounded-full bg-gradient-to-b from-[#2E1418]/85 to-[#200E11]/85 border border-[#5C1A24]/80 shadow-[inset_0_1px_0_rgba(252,165,165,0.08)] max-w-[180px] sm:max-w-[240px] min-w-0 shrink-0"
                >
                  <Heart size={13} className="text-[#EF4444] fill-[#EF4444]/40 shrink-0" />
                  <span className="text-[12.5px] font-semibold text-[#FCA5A5] leading-none truncate">
                    {overallState}
                  </span>
                </div>
              )}

              {/* Індикатор шторки */}
              <div className="w-6 h-6 rounded-lg bg-[#202020]/70 border border-[#2D2D2D] group-enabled:group-hover:border-[#5A1220] group-enabled:group-hover:bg-[#261418] flex items-center justify-center text-[#9CA3AF] group-hover:text-white transition-all shrink-0 ml-0.5">
                <ChevronDown
                  size={14}
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
