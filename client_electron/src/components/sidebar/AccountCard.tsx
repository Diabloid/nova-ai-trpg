import React, { useState } from 'react';
import { User, Settings, LogOut, ChevronUp } from 'lucide-react';

interface AccountCardProps {
  onOpenSettings?: () => void;
  onLogout?: () => void;
}

export const AccountCard: React.FC<AccountCardProps> = ({
  onOpenSettings,
  onLogout,
}) => {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="flex flex-col w-full relative">
      {/* Інлайн-меню акаунта, що виїжджає над карткою */}
      <div
        className={`transition-all duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] overflow-hidden ${
          isOpen
            ? 'max-h-[200px] opacity-100 mb-2 pointer-events-auto'
            : 'max-h-0 opacity-0 mb-0 pointer-events-none'
        }`}
      >
        <div className="bg-[#161616] border border-[#262626] rounded-lg p-1.5 flex flex-col gap-1 shadow-2xl">
          <button
            type="button"
            onClick={() => {
              setIsOpen(false);
              onOpenSettings?.();
            }}
            className="flex items-center gap-2.5 px-2.5 py-1.5 rounded text-xs text-[#E5E7EB] hover:bg-[#222222] transition-colors cursor-pointer text-left"
          >
            <Settings size={13} className="text-[#9CA3AF]" />
            <span>Налаштування</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setIsOpen(false);
              onLogout?.();
            }}
            className="flex items-center gap-2.5 px-2.5 py-1.5 rounded text-xs text-[#EF4444] hover:bg-[#2A1418] transition-colors cursor-pointer text-left"
          >
            <LogOut size={13} className="text-[#EF4444]" />
            <span>Вийти з акаунту</span>
          </button>
        </div>
      </div>

      {/* Головна кнопка-картка акаунта */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="w-full bg-[#161616] hover:bg-[#1C1C1C] border border-[#262626] hover:border-[#333333] rounded-lg p-2.5 flex items-center justify-between transition-colors cursor-pointer text-left"
      >
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="relative">
            <div className="w-9 h-9 rounded-full bg-[#222222] border border-[#353535] flex items-center justify-center">
              <User size={16} className="text-[#9CA3AF]" />
            </div>
            {/* Зелена цяточка онлайн статусу */}
            <span className="absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full bg-[#10B981] ring-2 ring-[#161616]" />
          </div>

          <div className="flex flex-col min-w-0">
            <span className="text-[13px] font-semibold text-[#F3F4F6] truncate">
              cute_metalhead
            </span>
            <span className="text-[10px] text-[#6B7280] truncate">
              cute_metalhead@nova.ai
            </span>
          </div>
        </div>

        <ChevronUp
          size={14}
          className={`text-[#9CA3AF] transition-transform duration-200 shrink-0 ml-1 ${
            isOpen ? 'rotate-180' : ''
          }`}
        />
      </button>
    </div>
  );
};
