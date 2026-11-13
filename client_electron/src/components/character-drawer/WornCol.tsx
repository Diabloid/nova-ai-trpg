import React from 'react';
import type { ItemObject } from '../../types/api';

interface WornColProps {
  worn?: Array<ItemObject | Record<string, any> | string>;
}

export const WornCol: React.FC<WornColProps> = ({ worn = [] }) => {
  return (
    <div className="bg-[#1C1C1C] border border-[#2A2A2A] rounded-lg p-3 flex flex-col h-full max-h-[340px]">
      <div className="text-xs font-bold text-[#60A5FA] tracking-[0.5px] pb-2 border-b border-[#262626] mb-2 flex items-center gap-1.5">
        <span>🛡</span>
        <span>ЕКІПІРУВАННЯ (WORN)</span>
      </div>

      <div className="flex-1 overflow-y-auto pr-1 flex flex-col gap-2">
        {worn.length === 0 ? (
          <span className="text-xs text-[#6B7280] italic py-2">
            Нічого не одягнено
          </span>
        ) : (
          worn.map((item, idx) => {
            const name = typeof item === 'string' ? item : item.name;
            const desc = typeof item === 'string' ? '' : item.desc;

            return (
              <div
                key={idx}
                title={desc || name}
                className="bg-[#131E2B] border border-[#1E3A5F] rounded-md p-2 flex flex-col gap-0.5"
              >
                <span className="text-xs font-semibold text-[#93C5FD]">
                  {name}
                </span>
                {desc && (
                  <span className="text-[11px] text-[#6B7280] leading-relaxed line-clamp-2">
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
