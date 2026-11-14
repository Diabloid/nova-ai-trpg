import React from 'react';

export const SyntaxHelpTooltip: React.FC = () => {
  return (
    <div className="relative group flex items-end">
      {/* Кнопка-підказка синтаксису (26x26) */}
      <div
        title="Підказка синтаксису"
        className="w-[26px] h-[26px] rounded-[12px] bg-[#222222] hover:bg-[#2A1215] border border-[#333333] hover:border-[#7E0018] text-[#9CA3AF] hover:text-[#EF4444] flex items-center justify-center text-[14px] font-bold transition-all duration-150 cursor-help select-none"
      >
        ?
      </div>

      {/* Тултіп підказки синтаксису */}
      <div className="absolute bottom-9 right-0 hidden group-hover:flex flex-col gap-2 p-3 bg-[#161616] border border-[#262626] rounded-lg shadow-2xl z-50 w-72 text-xs animate-fade-in pointer-events-none">
        <span className="font-bold text-[#F3F4F6] text-xs pb-1 border-b border-[#222222]">
          Синтаксис введення дій:
        </span>
        <div className="flex items-center gap-2">
          <span className="font-bold text-[#EAB308]">**Дія**</span>
          <span className="text-[#D1D5DB]">— фізичні дії персонажа</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="nova-thought-italic text-[#60A5FA]">&quot;Думка&quot;</span>
          <span className="text-[#D1D5DB]">— внутрішній голос / монолог</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[#4ADE80] font-medium">- Репліка</span>
          <span className="text-[#D1D5DB]">— пряма мова (без закриття)</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[#9CA3AF]">(OOC)</span>
          <span className="text-[#D1D5DB]">— позаігрове звернення до ШІ</span>
        </div>
        <div className="pt-1 text-[10px] text-[#6B7280] italic">
          * За замовчуванням текст та голос сприймаються як дія.
        </div>
      </div>
    </div>
  );
};
