import React from 'react';
import type { AbilityItem } from '../../types/api';

interface AbilitiesColProps {
  abilities?: Array<AbilityItem | Record<string, any> | string>;
}

export const AbilitiesCol: React.FC<AbilitiesColProps> = ({ abilities = [] }) => {
  return (
    <div className="bg-[#1C1C1C] border border-[#2A2A2A] rounded-lg p-3 flex flex-col h-full max-h-[340px]">
      <div className="text-xs font-bold text-[#C084FC] tracking-[0.5px] pb-2 border-b border-[#262626] mb-2 flex items-center gap-1.5">
        <span>⚡</span>
        <span>ЗДІБНОСТІ ТА ЗАКЛЯТТЯ</span>
      </div>

      <div className="flex-1 overflow-y-auto pr-1 flex flex-col gap-2">
        {abilities.length === 0 ? (
          <span className="text-xs text-[#6B7280] italic py-2">
            Здібності відсутні
          </span>
        ) : (
          abilities.map((item, idx) => {
            const name = typeof item === 'string' ? item : item.name || '';
            const desc =
              typeof item === 'string'
                ? ''
                : item.desc || (item as any).description || '';

            return (
              <div
                key={idx}
                title={desc || name}
                className="bg-[#161220] border border-[#35244C] rounded-md p-2 flex flex-col gap-0.5"
              >
                <span className="text-xs font-semibold text-[#E9D5FF]">
                  {name}
                </span>
                {desc && (
                  <span className="text-[11px] text-[#A855F7] leading-relaxed line-clamp-2">
                    {desc}
                  </span>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
