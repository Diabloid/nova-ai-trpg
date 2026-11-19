import React from 'react';

export const SyntaxHelpTooltip: React.FC = () => {
  return (
    <div className="relative group flex items-center shrink-0">
      {/* Кнопка-підказка синтаксису (36x36, концентричний радіус 10px у нейтральній палітрі) */}
      <div
        aria-label="Підказка синтаксису"
        className="w-9 h-9 rounded-[10px] bg-gradient-to-b from-[#202020] to-[#181818] hover:from-[#2C1317] hover:to-[#1F0D10] border border-[#303030] hover:border-[#7E0018] text-[#9CA3AF] hover:text-[#FCA5A5] flex items-center justify-center text-[15px] font-bold leading-none shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] transition-all duration-150 cursor-help select-none shrink-0"
      >
        <span className="leading-none block">?</span>
      </div>

      {/* Тултіп підказки синтаксису з плавною появою */}
      <div className="absolute bottom-11 right-0 flex flex-col gap-2 p-3 bg-[#161616] border border-[#2A2A2A] rounded-xl shadow-2xl z-50 w-72 text-xs pointer-events-none opacity-0 translate-y-1 group-hover:opacity-100 group-hover:translate-y-0 transition-all duration-150 ease-out">
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
