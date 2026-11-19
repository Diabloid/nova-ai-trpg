import React from 'react';
import { Sparkles, ChevronRight, WifiOff, Globe } from 'lucide-react';
import { useGameStore } from '../../store/useGameStore';
import { ActiveWorldCard } from './ActiveWorldCard';
import { ActiveHeroCard } from './ActiveHeroCard';
import { CampaignList } from './CampaignList';
import { AccountCard } from './AccountCard';
import { RUBY_BUTTON_SURFACE_CLASS } from '../ui/Button';
import type { CharacterSummary, CampaignSummary, WorldSummary } from '../../types/api';

const SIDEBAR_CREATE_BUTTON_CLASS = `w-full text-xs font-semibold py-2 px-3 rounded-lg flex items-center justify-center gap-1.5 transition-all duration-150 enabled:active:scale-[0.98] enabled:cursor-pointer disabled:opacity-45 disabled:cursor-default ${RUBY_BUTTON_SURFACE_CLASS}`;

interface SidebarProps {
  onOpenWizard?: () => void;
  onCreateWorld?: () => void;
  onEditWorld?: (world: WorldSummary) => void;
  onCloneWorld?: (world: WorldSummary) => void;
  onRequestDeleteWorld?: (world: WorldSummary) => void;
  onEditCharacter?: (char: CharacterSummary) => void;
  onRequestDeleteCharacter?: (char: CharacterSummary) => void;
  onNewCampaign?: () => void;
  onRequestDeleteCampaign?: (camp: CampaignSummary) => void;
  onOpenSettings?: () => void;
  onLogout?: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  onOpenWizard,
  onCreateWorld,
  onEditWorld,
  onCloneWorld,
  onRequestDeleteWorld,
  onEditCharacter,
  onRequestDeleteCharacter,
  onNewCampaign,
  onRequestDeleteCampaign,
  onOpenSettings,
  onLogout,
}) => {
  const { isSidebarOpen, toggleSidebar, backendOffline } = useGameStore();

  return (
    <aside className="relative flex h-full z-40 select-none shrink-0">
      {/* Основна панель меню (290px) */}
      <div
        className={`h-full bg-[#111111] border-r border-[#2A2A2A] transition-all duration-[350ms] ease-[cubic-bezier(0.4,0,0.2,1)] will-change-[width,opacity] overflow-hidden flex flex-col justify-between ${
          isSidebarOpen ? 'w-[290px] opacity-100' : 'w-0 opacity-0 border-r-0'
        }`}
      >
        <div
          className={`min-w-[290px] w-[290px] shrink-0 px-[15px] pt-6 pb-4 flex flex-col h-full justify-between transition-[transform,opacity] duration-300 ease-out ${
            isSidebarOpen ? 'translate-x-0 opacity-100' : '-translate-x-4 opacity-0'
          }`}
        >
          {/* Верхня частина: Напис МЕНЮ + Кнопки створення світу й героя */}
          <div className="flex flex-col gap-2.5">
            <div className="text-center text-[#9CA3AF] font-bold text-[13px] tracking-[1.5px] mb-0.5">
              МЕНЮ
            </div>

            {backendOffline && (
              <div className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-[#211216] border border-[#7F1D1D] text-[11px] font-medium text-[#FCA5A5]">
                <WifiOff size={12} className="text-[#EF4444] shrink-0" />
                <span>Сервер офлайн</span>
              </div>
            )}

            <button
              type="button"
              disabled={backendOffline}
              onClick={onCreateWorld}
              data-tooltip={
                backendOffline
                  ? 'Недоступно в офлайн-режимі'
                  : 'Відкрити 4-кроковий майстер створення нового світу'
              }
              className={SIDEBAR_CREATE_BUTTON_CLASS}
            >
              <Globe size={13} className="text-[#FCA5A5]" />
              <span>Створити новий світ</span>
            </button>

            <button
              type="button"
              disabled={backendOffline}
              onClick={onOpenWizard}
              data-tooltip={
                backendOffline
                  ? 'Недоступно в офлайн-режимі'
                  : 'Відкрити майстер створення нового персонажа'
              }
              className={SIDEBAR_CREATE_BUTTON_CLASS}
            >
              <Sparkles size={13} className="text-[#FCA5A5]" />
              <span>Створити нового персонажа</span>
            </button>

            <div className="h-[1px] bg-[#222222] my-1" />
          </div>

          {/* Середня скрол-зона: Світ, Герой та Кампанії */}
          <div className="flex-1 overflow-y-auto py-2 pr-1 flex flex-col gap-5">
            <ActiveWorldCard
              onEditWorld={onEditWorld}
              onCloneWorld={onCloneWorld}
              onRequestDeleteWorld={onRequestDeleteWorld}
            />
            <ActiveHeroCard
              onEditCharacter={onEditCharacter}
              onRequestDeleteCharacter={onRequestDeleteCharacter}
            />
            <CampaignList
              onNewCampaign={onNewCampaign}
              onRequestDeleteCampaign={onRequestDeleteCampaign}
            />
          </div>

          {/* Нижня зона: Акаунт */}
          <div className="pt-2 border-t border-[#1C1C1C]">
            <AccountCard
              onOpenSettings={onOpenSettings}
              onLogout={onLogout}
            />
          </div>
        </div>
      </div>

      {/* Фірмова крайова кнопка-вкладка меню (Edge Docked Tab) */}
      <button
        type="button"
        onClick={toggleSidebar}
        data-tooltip={isSidebarOpen ? 'Згорнути бічне меню' : 'Розгорнути бічне меню'}
        className="absolute top-[17px] -right-7 z-50 group flex items-center justify-center cursor-pointer outline-none"
        style={{ width: '28px', height: '56px' }}
      >
        {/* Фонова плашка, що плавно розширюється на hover */}
        <div
          className="absolute left-0 w-7 h-[46px] rounded-r-lg border-y border-r border-[#2A2A2A] bg-[#181818] transition-all duration-150 ease-out group-hover:h-[54px] group-hover:bg-[#202020] group-hover:border-[#383838]"
        />
        {/* Шеврон, що обертається на 180° */}
        <ChevronRight
          size={14}
          className={`relative z-10 text-[#9CA3AF] group-hover:text-white transition-all duration-300 ${
            isSidebarOpen ? 'rotate-180' : 'rotate-0'
          }`}
        />
      </button>
    </aside>
  );
};
