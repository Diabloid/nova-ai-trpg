import React from 'react';
import { RotateCcw } from 'lucide-react';
import { useGameStore } from '../../store/useGameStore';

export const RollbackBtn: React.FC = () => {
  const { rollbackLastTurn, isLoading, isStreaming } = useGameStore();

  return (
    <button
      type="button"
      onClick={() => rollbackLastTurn()}
      disabled={isLoading || isStreaming}
      title="Відкотити цей хід і повернути дію в поле вводу"
      className="group flex items-center gap-1.5 h-[28px] px-2.5 py-0.5 rounded-t-[6px] rounded-b-none bg-[#1A1A1A] hover:bg-[#2A1418] border border-[#2D2D2D] border-b-0 hover:border-[#7E0018] text-[#9CA3AF] hover:text-[#EF4444] text-[11px] font-semibold transition-all duration-150 cursor-pointer shadow-sm disabled:opacity-50 disabled:cursor-not-allowed select-none"
    >
      <RotateCcw size={11} className="text-[#EF4444] group-hover:-rotate-45 transition-transform" />
      <span>Відкат</span>
    </button>
  );
};
