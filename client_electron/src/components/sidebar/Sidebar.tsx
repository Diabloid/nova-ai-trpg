import React from 'react';
import { Sparkles, ChevronRight } from 'lucide-react';
import { useGameStore } from '../../store/useGameStore';
import { ActiveHeroCard } from './ActiveHeroCard';
import { CampaignList } from './CampaignList';
import { AccountCard } from './AccountCard';
import type { CharacterSummary, CampaignSummary } from '../../types/api';

interface SidebarProps {
  onOpenWizard?: () => void;
  onEditCharacter?: (char: CharacterSummary) => void;
  onRequestDeleteCharacter?: (char: CharacterSummary) => void;
  onNewCampaign?: () => void;
  onRequestDeleteCampaign?: (camp: CampaignSummary) => void;
  onOpenSettings?: () => void;
  onLogout?: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  onOpenWizard,
  onEditCharacter,
  onRequestDeleteCharacter,
  onNewCampaign,
  onRequestDeleteCampaign,
  onOpenSettings,
  onLogout,
}) => {
  const { isSidebarOpen, toggleSidebar } = useGameStore();

  return (
    <aside className="relative flex h-full z-40 select-none shrink-0">
      {/* Основна панель меню (290px) */}
      <div
        className={`h-full bg-[#111111] border-r border-[#2A2A2A] transition-all duration-[380ms] ease-[cubic-bezier(0.22,1,0.36,1)] overflow-hidden flex flex-col justify-between ${
          isSidebarOpen ? 'w-[290px] opacity-100' : 'w-0 opacity-0 border-r-0'
        }`}
      >
        <div className="min-w-[290px] w-[290px] shrink-0 px-[15px] pt-6 pb-4 flex flex-col h-full justify-between">
          {/* Верхня частина: Напис МЕНЮ + Кнопка створення героя */}
          <div className="flex flex-col gap-3">
            <div className="text-center text-[#9CA3AF] font-bold text-[13px] tracking-[1.5px]">
              МЕНЮ
            </div>

            <button
              type="button"
              onClick={onOpenWizard}
              className="w-full bg-[#7E0018] hover:bg-[#9E0020] active:bg-[#5C0012] text-white text-xs font-semibold py-2 px-3 rounded-lg flex items-center justify-center gap-1.5 transition-colors cursor-pointer shadow-md"
            >
              <Sparkles size={13} className="text-[#FCA5A5]" />
              <span>Створити нового персонажа</span>
            </button>

            <div className="h-[1px] bg-[#222222] my-1" />
          </div>

          {/* Середня скрол-зона: Герой та Кампанії */}
          <div className="flex-1 overflow-y-auto py-2 pr-1 flex flex-col gap-5">
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
        title={isSidebarOpen ? 'Згорнути бічне меню' : 'Розгорнути бічне меню'}
        className="absolute top-10 -right-7 z-50 group flex items-center justify-center cursor-pointer outline-none"
        style={{ width: '28px', height: '56px' }}
      >
        {/* Фонова плашка, що плавно розширюється на hover */}
        <div
          className={`absolute left-0 w-7 rounded-r-lg border-y border-r border-[#2A2A2A] bg-[#181818] transition-all duration-150 ease-out group-hover:h-[54px] group-hover:bg-[#202020] group-hover:border-[#383838] ${
            isSidebarOpen ? 'h-[46px]' : 'h-[46px]'
          }`}
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
