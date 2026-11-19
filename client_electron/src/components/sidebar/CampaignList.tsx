import React from 'react';
import { Pin, Trash2, Plus } from 'lucide-react';
import { useGameStore } from '../../store/useGameStore';
import type { CampaignSummary } from '../../types/api';

interface CampaignListProps {
  onNewCampaign?: () => void;
  onRequestDeleteCampaign?: (camp: CampaignSummary) => void;
}

export const CampaignList: React.FC<CampaignListProps> = ({
  onNewCampaign,
  onRequestDeleteCampaign,
}) => {
  const {
    campaigns,
    activeCharacterId,
    activeCampaignId,
    backendOffline,
    selectCampaign,
    togglePinCampaign,
  } = useGameStore();

  return (
    <div className="flex flex-col gap-2">
      {/* Заголовок + кнопка Нова кампанія */}
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-bold text-[#9CA3AF] tracking-[0.8px]">
          КАМПАНІЇ ГЕРОЯ
        </span>
        <button
          type="button"
          disabled={!activeCharacterId || backendOffline}
          onClick={onNewCampaign}
          data-tooltip={
            backendOffline
              ? 'Недоступно в офлайн-режимі'
              : activeCharacterId
                ? 'Створити нову кампанію за цього героя'
                : 'Спочатку створіть або оберіть героя'
          }
          className="text-[11px] font-semibold text-[#9CA3AF] bg-[#1A1A1A] border border-[#2D2D2D] px-2 py-0.5 rounded transition-colors flex items-center gap-1 enabled:hover:text-[#E5E7EB] enabled:hover:bg-[#262626] enabled:cursor-pointer disabled:opacity-40 disabled:cursor-default"
        >
          <Plus size={11} />
          <span>Нова кампанія</span>
        </button>
      </div>

      {/* Список кампаній */}
      <div className="flex flex-col gap-1.5">
        {campaigns.length === 0 ? (
          <div className="text-xs text-[#555555] italic py-2">
            Кампанії відсутні
          </div>
        ) : (
          campaigns.map((camp) => {
            const isActive = camp.campaign_id === activeCampaignId;
            const isPinned = camp.is_pinned;

            return (
              <div
                key={camp.campaign_id}
                className={`relative group flex items-center justify-between rounded-[7px] border transition-all duration-150 overflow-hidden ${
                  isActive
                    ? 'bg-[#1C1C1C] border-[#383838]'
                    : 'bg-[#141414] border-[#252525] hover:bg-[#1C1C1C] hover:border-[#333333]'
                }`}
              >
                {/* Ліва вертикальна смужка 3px кольору #7E0018 виключно для закріплених кампаній */}
                {isPinned && (
                  <div className="absolute left-0 top-0 bottom-0 w-[3px] bg-[#7E0018] rounded-l-[7px]" />
                )}

                {/* Клікабельне тіло кампанії */}
                <button
                  type="button"
                  onClick={() => selectCampaign(camp.campaign_id)}
                  className={`flex-1 text-left py-2 min-w-0 cursor-pointer ${
                    isPinned ? 'pl-3.5 pr-2' : 'px-2.5'
                  }`}
                >
                  <div className="flex flex-col gap-0.5">
                    <span
                      className={`text-xs font-semibold truncate ${
                        isActive ? 'text-white' : 'text-[#E5E7EB]'
                      }`}
                    >
                      {camp.title}
                    </span>
                    <span className="text-[10px] text-[#6B7280] truncate">
                      {camp.current_location || 'Початкова локація'}
                    </span>
                  </div>
                </button>

                {/* Дії з кампанією: Закріпити / Видалити */}
                <div className="flex items-center gap-1 pr-2 opacity-80 group-hover:opacity-100 transition-opacity shrink-0">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      togglePinCampaign(camp.campaign_id);
                    }}
                    data-tooltip={isPinned ? 'Відкріпити кампанію' : 'Закріпити кампанію'}
                    className={`w-6 h-6 rounded flex items-center justify-center transition-colors cursor-pointer ${
                      isPinned
                        ? 'text-[#EAB308] hover:bg-[#222222]'
                        : 'text-[#6B7280] hover:text-[#E5E7EB] hover:bg-[#222222]'
                    }`}
                  >
                    <Pin size={12} className={isPinned ? 'rotate-45 fill-current' : ''} />
                  </button>

                  {onRequestDeleteCampaign && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onRequestDeleteCampaign(camp);
                      }}
                      data-tooltip="Видалити кампанію"
                      className="w-6 h-6 rounded flex items-center justify-center text-[#6B7280] hover:text-[#EF4444] hover:bg-[#2A1418] transition-colors cursor-pointer"
                    >
                      <Trash2 size={12} />
                    </button>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
