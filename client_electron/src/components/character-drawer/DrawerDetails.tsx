import React, { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import type { PlayerMeta } from '../../types/api';

interface DrawerDetailsProps {
  meta?: PlayerMeta;
  customBlocks?: Record<string, any>;
}

const KNOWN_BLOCK_STYLES: Record<string, { title: string; color: string; icon: string }> = {
  reputation: { title: 'ФРАКЦІЇ ТА РЕПУТАЦІЯ', color: '#F59E0B', icon: '🏛️' },
  magic_schools: { title: 'МАГІЧНІ ШКОЛИ', color: '#C084FC', icon: '🔮' },
  afflictions: { title: 'ПРОКЛЯТТЯ ТА ХВОРОБИ', color: '#EF4444', icon: '☠️' },
  blessings: { title: 'БЛАГОСЛОВЕННЯ ТА АУРИ', color: '#34D399', icon: '✨' },
  status_effects: { title: 'СТАТУСИ ТА ЕФЕКТИ', color: '#38BDF8', icon: '⚡' },
  lore: { title: 'ЗНАННЯ СВІТУ ТА ТАЄМНИЦІ', color: '#A78BFA', icon: '📜' },
  titles_and_ranks: { title: 'ТИТУЛИ ТА ЗВАННЯ', color: '#FBBF24', icon: '👑' },
};

function formatTitle(raw: string): string {
  if (!raw) return '';
  const cleaned = raw.replace(/[_-]+/g, ' ').trim();
  return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
}

export const DrawerDetails: React.FC<DrawerDetailsProps> = ({
  meta,
  customBlocks = {},
}) => {
  const [isExpanded, setIsExpanded] = useState(false);

  if (!meta) return null;

  const appDetails = meta.appearance_details;
  const physique = appDetails?.physique;
  const height = appDetails?.height;
  const eyes = appDetails?.eyes;
  const hair = appDetails?.hair;
  const raceTraits = appDetails?.race_traits;

  const hasAppearanceBadges = !!(physique || height || eyes || hair || raceTraits);
  const titles = Array.isArray(meta.titles) ? meta.titles.join(', ') : meta.titles;
  const age = meta.age ? String(meta.age) : '';
  const biography = meta.biography || meta.background || '';

  // Фільтруємо службові дати з custom_blocks
  const filteredBlocks = Object.entries(customBlocks).filter(
    ([key]) => key !== 'created_at' && key !== 'updated_at'
  );

  const hasAnyDetails =
    titles || age || hasAppearanceBadges || biography || filteredBlocks.length > 0;

  if (!hasAnyDetails) return null;

  return (
    <div className="bg-[#141414] border border-[#262626] rounded-lg overflow-hidden transition-all duration-150 mt-1">
      {/* Заголовок спойлера */}
      <button
        type="button"
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center justify-between p-2.5 text-left bg-transparent hover:bg-[#1A1A1A] transition-colors cursor-pointer"
      >
        <div className="flex items-center gap-2">
          <span className="text-[12px] leading-none">📜</span>
          <span className="text-[11px] font-bold text-[#F59E0B] tracking-[0.5px]">
            ДЕТАЛІ ПЕРСОНАЖА, РИСИ ТА СВІТ
          </span>
        </div>
        <ChevronDown
          size={14}
          className={`text-[#F59E0B] transition-transform duration-200 ${
            isExpanded ? 'rotate-180' : 'rotate-0'
          }`}
        />
      </button>

      {/* Вміст спойлера */}
      {isExpanded && (
        <div className="p-3 border-t border-[#222222] flex flex-col gap-3 animate-fade-in text-xs">
          {/* Титули та вік */}
          <div className="grid grid-cols-2 gap-4">
            {titles && (
              <div className="flex flex-col gap-0.5">
                <span className="text-[10px] text-[#9CA3AF]">Титули та звання:</span>
                <span className="text-[11px] font-semibold text-[#FBBF24]">
                  {titles}
                </span>
              </div>
            )}
            {age && (
              <div className="flex flex-col gap-0.5">
                <span className="text-[10px] text-[#9CA3AF]">Вік:</span>
                <span className="text-[11px] font-semibold text-[#E5E7EB]">
                  {age}
                </span>
              </div>
            )}
          </div>

          {/* Деталі зовнішності (Бейджі WrapPanel) */}
          {hasAppearanceBadges && (
            <div className="flex flex-wrap gap-1.5 pt-0.5">
              {physique && (
                <span className="bg-[#1C1C1C] border border-[#2A2A2A] rounded px-1.5 py-0.5 text-[10px] text-[#D1D5DB]">
                  Статура: <strong className="text-white">{physique}</strong>
                </span>
              )}
              {height && (
                <span className="bg-[#1C1C1C] border border-[#2A2A2A] rounded px-1.5 py-0.5 text-[10px] text-[#D1D5DB]">
                  Зріст: <strong className="text-white">{height}</strong>
                </span>
              )}
              {eyes && (
                <span className="bg-[#1C1C1C] border border-[#2A2A2A] rounded px-1.5 py-0.5 text-[10px] text-[#D1D5DB]">
                  Очі: <strong className="text-white">{eyes}</strong>
                </span>
              )}
              {hair && (
                <span className="bg-[#1C1C1C] border border-[#2A2A2A] rounded px-1.5 py-0.5 text-[10px] text-[#D1D5DB]">
                  Волосся: <strong className="text-white">{hair}</strong>
                </span>
              )}
              {raceTraits && (
                <span className="bg-[#1C1C1C] border border-[#2A2A2A] rounded px-1.5 py-0.5 text-[10px] text-[#D1D5DB]">
                  Расові риси: <strong className="text-white">{raceTraits}</strong>
                </span>
              )}
            </div>
          )}

          {/* Хроніка та біографія */}
          {biography && (
            <div className="flex flex-col gap-1">
              <span className="text-[10px] text-[#9CA3AF]">Хроніка та біографія:</span>
              <div className="bg-[#111111] border border-[#222222] rounded-md p-2 text-[#D1D5DB] text-[11px] leading-[18px] whitespace-pre-wrap">
                {biography}
              </div>
            </div>
          )}

          {/* Динамічні блоки (Custom Blocks) 1-в-1 як у DynamicSheetHelper */}
          {filteredBlocks.length > 0 && (
            <div className="flex flex-col gap-2 pt-1 border-t border-[#1C1C1C]">
              {filteredBlocks.map(([rawKey, val]) => {
                const style = KNOWN_BLOCK_STYLES[rawKey.toLowerCase()] || {
                  title: formatTitle(rawKey).toUpperCase(),
                  color: '#E5E7EB',
                  icon: '🌐',
                };

                const isArray = Array.isArray(val);
                const isObject = typeof val === 'object' && val !== null && !isArray;

                return (
                  <div
                    key={rawKey}
                    className="bg-[#161616] border border-[#2A2A2A] rounded-md p-2.5 flex flex-col gap-2"
                  >
                    {/* Шапка блоку з іконкою та кольором */}
                    <div className="flex items-center gap-1.5">
                      <span className="text-[11px]">{style.icon}</span>
                      <span
                        className="text-[11px] font-bold tracking-[0.5px]"
                        style={{ color: style.color }}
                      >
                        {style.title}
                      </span>
                    </div>

                    {/* Рендеринг за типами значень */}
                    {isObject && (
                      <div className="flex flex-col gap-1">
                        {Object.entries(val).map(([fKey, fVal]) => (
                          <div key={fKey} className="flex items-start gap-1.5 text-[11px]">
                            <span className="text-[#9CA3AF] shrink-0">
                              {formatTitle(fKey)}:
                            </span>
                            <span className="text-[#E5E7EB] font-medium">
                              {typeof fVal === 'object' ? JSON.stringify(fVal) : String(fVal)}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}

                    {isArray && (
                      <div className="flex flex-wrap gap-1.5">
                        {val.map((item, idx) => {
                          if (typeof item === 'string') {
                            return (
                              <span
                                key={idx}
                                className="bg-[#222222] rounded px-1.5 py-0.5 text-[10px] text-[#F3F4F6]"
                              >
                                {item}
                              </span>
                            );
                          }
                          const itemName = item.name || item.title || '';
                          const itemDesc = item.desc || item.description || '';
                          return (
                            <div
                              key={idx}
                              className="w-full bg-[#111111] border border-[#262626] rounded p-1.5 flex flex-col"
                            >
                              <span className="text-[11px] font-semibold text-[#E5E7EB]">
                                {itemName}
                              </span>
                              {itemDesc && (
                                <span className="text-[10px] text-[#9CA3AF]">
                                  {itemDesc}
                                </span>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}

                    {!isObject && !isArray && (
                      <span className="text-[11px] text-[#D1D5DB]">
                        {String(val)}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
