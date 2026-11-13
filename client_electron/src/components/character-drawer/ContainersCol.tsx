import React from 'react';
import { ChevronDown } from 'lucide-react';
import { useGameStore } from '../../store/useGameStore';
import type { ItemObject } from '../../types/api';

interface ContainersColProps {
  containers?: Record<string, Array<ItemObject | Record<string, any> | string>>;
}

export const ContainersCol: React.FC<ContainersColProps> = ({ containers = {} }) => {
  const { expandedContainers, toggleContainerExpanded } = useGameStore();
  const containerNames = Object.keys(containers);

  return (
    <div className="bg-[#1C1C1C] border border-[#2A2A2A] rounded-lg p-3 flex flex-col h-full max-h-[340px]">
      <div className="text-xs font-bold text-[#34D399] tracking-[0.5px] pb-2 border-b border-[#262626] mb-2 flex items-center gap-1.5">
        <span>🎒</span>
        <span>КОНТЕЙНЕРИ ТА РЮКЗАК</span>
      </div>

      <div className="flex-1 overflow-y-auto pr-1 flex flex-col gap-2">
        {containerNames.length === 0 ? (
          <span className="text-xs text-[#6B7280] italic py-2">
            Контейнери порожні
          </span>
        ) : (
          containerNames.map((cName) => {
            const items = containers[cName] || [];
            // By default, if not explicitly expanded/collapsed, let's keep open if it's the first or per store
            const isExpanded = expandedContainers[cName] ?? true;

            return (
              <div
                key={cName}
                className="bg-[#141414] border border-[#252525] rounded-md overflow-hidden transition-all duration-150"
              >
                {/* Expander Header */}
                <button
                  type="button"
                  onClick={() => toggleContainerExpanded(cName)}
                  className="w-full flex items-center justify-between p-2 text-left bg-transparent hover:bg-[#1A1A1A] transition-colors cursor-pointer"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-xs font-semibold text-[#6EE7B7] truncate">
                      {cName}
                    </span>
                    <span className="text-[10px] font-semibold bg-[#142B20] border border-[#1C4231] text-[#A7F3D0] px-1.5 py-0.2 rounded">
                      {items.length}
                    </span>
                  </div>
                  <ChevronDown
                    size={13}
                    className={`text-[#34D399] transition-transform duration-200 shrink-0 ml-1 ${
                      isExpanded ? 'rotate-180' : 'rotate-0'
                    }`}
                  />
                </button>

                {/* Expander Content */}
                {isExpanded && (
                  <div className="p-2 border-t border-[#153327] bg-[#0B1712] flex flex-col gap-1.5 animate-fade-in">
                    {items.length === 0 ? (
                      <span className="text-[11px] text-[#6B7280] italic">
                        Порожньо
                      </span>
                    ) : (
                      items.map((item, idx) => {
                        const name = typeof item === 'string' ? item : item.name;
                        const desc = typeof item === 'string' ? '' : item.desc;

                        return (
                          <div
                            key={idx}
                            title={desc || name}
                            className="bg-[#0E1E17] border border-[#183B2C] rounded p-1.5 flex flex-col gap-0.5"
                          >
                            <span className="text-[11px] font-semibold text-[#D1FAE5]">
                              • {name}
                            </span>
                            {desc && (
                              <span className="text-[10px] text-[#6EE7B7] opacity-80 leading-tight pl-2">
                                {desc}
                              </span>
                            )}
                          </div>
                        );
                      })
                    )}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
