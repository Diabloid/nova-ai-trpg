import React from 'react';
import { RotateCcw } from 'lucide-react';
import { useGameStore } from '../../store/useGameStore';

export const RollbackBtn: React.FC = () => {
  const { rollbackLastTurn, isLoading, isStreaming, isRollingBack, backendOffline } =
    useGameStore();

  return (
    <button
      type="button"
      onClick={() => rollbackLastTurn()}
      disabled={isLoading || isStreaming || isRollingBack || backendOffline}
      data-tooltip="Відкотити цей хід і повернути дію в поле вводу"
      className="group flex items-start justify-center h-[23px] enabled:hover:h-[28px] px-2.5 pt-[3px] rounded-[6px] enabled:hover:rounded-b-none bg-[#1A1A1A] enabled:hover:bg-[#2A1418] border border-[#2D2D2D] border-b-[#2D2D2D] enabled:hover:border-[#7E0018] enabled:hover:border-b-transparent text-[#9CA3AF] enabled:hover:text-[#EF4444] text-[11px] font-semibold transition-all duration-150 enabled:cursor-pointer shadow-sm disabled:opacity-50 disabled:cursor-default select-none"
    >
      <span className="inline-flex items-center gap-1.5 leading-[15px]">
        <RotateCcw
          size={11}
          className="text-[#EF4444] group-enabled:group-hover:-rotate-45 transition-transform shrink-0"
        />
        <span>Відкат</span>
      </span>
    </button>
  );
};
