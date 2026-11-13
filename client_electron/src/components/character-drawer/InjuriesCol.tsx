import React from 'react';
import type { InjuryItem } from '../../types/api';

interface InjuriesColProps {
  injuries?: Array<InjuryItem | Record<string, any> | string>;
}

export const InjuriesCol: React.FC<InjuriesColProps> = ({ injuries = [] }) => {
  return (
    <div className="bg-[#1C1C1C] border border-[#2A2A2A] rounded-lg p-3 flex flex-col h-full max-h-[340px]">
      <div className="text-xs font-bold text-[#EF4444] tracking-[0.5px] pb-2 border-b border-[#262626] mb-2 flex items-center gap-1.5">
        <span>🩸</span>
        <span>АНАТОМІЯ ТА ТРАВМИ</span>
      </div>

      <div className="flex-1 overflow-y-auto pr-1 flex flex-col gap-2">
        {injuries.length === 0 ? (
          <span className="text-xs text-[#6B7280] italic py-2">
            Травми відсутні
          </span>
        ) : (
          injuries.map((item, idx) => {
            const location =
              typeof item === 'string' ? 'Поранення' : item.location || 'Поранення';
            const description =
              typeof item === 'string'
                ? item
                : item.description || (item as any).desc || '';

            return (
              <div
                key={idx}
                className="bg-[#2A1414] border border-[#4A1818] rounded-md p-2 flex flex-col gap-0.5"
              >
                <span className="text-xs font-semibold text-[#FCA5A5]">
                  {location}
                </span>
                {description && (
                  <span className="text-[11px] text-[#F87171] leading-relaxed">
                    {description}
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
