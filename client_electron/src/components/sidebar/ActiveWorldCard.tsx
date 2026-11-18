import React from 'react';
import { ChevronDown, Copy, Edit3, Plus, Trash2 } from 'lucide-react';
import { useGameStore } from '../../store/useGameStore';
import type { WorldSummary } from '../../types/api';
import { hexToRgba } from '../../utils/lucideIconMap';
import { DynamicLucideIcon } from '../dynamic-sheet';

interface ActiveWorldCardProps {
  onCreateWorld?: () => void;
  onEditWorld?: (world: WorldSummary) => void;
  onCloneWorld?: (world: WorldSummary) => void;
  onRequestDeleteWorld?: (world: WorldSummary) => void;
}

function formatHeroCount(count: number): string {
  const safe = Math.max(0, Math.floor(count));
  const mod100 = safe % 100;
  const mod10 = safe % 10;
  if (mod100 >= 11 && mod100 <= 14) return `${safe} героїв`;
  if (mod10 === 1) return `${safe} герой`;
  if (mod10 >= 2 && mod10 <= 4) return `${safe} герої`;
  return `${safe} героїв`;
}

export const ActiveWorldCard: React.FC<ActiveWorldCardProps> = ({
  onCreateWorld,
  onEditWorld,
  onCloneWorld,
  onRequestDeleteWorld,
}) => {
  const {
    worlds,
    activeWorldId,
    activeWorldDetail,
    isWorldSelectorOpen,
    toggleWorldSelector,
    selectWorld,
  } = useGameStore();

  const currentWorld =
    worlds.find((w) => w.world_id === activeWorldId) || activeWorldDetail || null;

  const worldTitle = currentWorld?.title || 'Світ за замовчуванням';
  const worldGenre = currentWorld?.genre || 'Темне фентезі';
  const worldIcon = currentWorld?.icon || 'globe';
  const accentColor = currentWorld?.accent_color || '#7E0018';

  return (
    <div className="flex flex-col shrink-0">
      <div className="flex items-center justify-between text-[11px] font-bold text-[#9CA3AF] tracking-[0.8px] mb-2">
        <span>АКТИВНИЙ СВІТ</span>
      </div>

      {/* Головна картка активного світу */}
      <div className="bg-[#161616] border border-[#262626] rounded-lg p-2 flex items-center justify-between transition-colors duration-150 hover:border-[#333333]">
        <button
          type="button"
          onClick={toggleWorldSelector}
          title={
            isWorldSelectorOpen
              ? 'Згорнути список світів'
              : 'Розгорнути список світів для перемикання'
          }
          className="flex items-center gap-2.5 min-w-0 flex-1 text-left rounded-md px-0.5 py-0.5 transition-colors enabled:cursor-pointer"
        >
          <div
            className="w-9 h-9 rounded-lg border flex items-center justify-center shrink-0"
            style={{
              backgroundColor: hexToRgba(accentColor, 0.14),
              borderColor: hexToRgba(accentColor, 0.45),
            }}
          >
            <DynamicLucideIcon
              icon={worldIcon}
              size={16}
              style={{ color: accentColor }}
            />
          </div>

          <div className="flex flex-col min-w-0 flex-1">
            <span className="text-[13px] font-bold text-[#F3F4F6] truncate">
              {worldTitle}
            </span>
            <span className="text-[10px] text-[#9CA3AF] truncate">
              {worldGenre}
            </span>
          </div>
        </button>

        {/* Кнопки швидких дій та індикатор розкриття */}
        <div className="flex items-center gap-1 shrink-0 ml-1.5">
          {currentWorld && onEditWorld && (
            <button
              type="button"
              onClick={() => onEditWorld(currentWorld)}
              title="Редагувати активний світ"
              className="w-7 h-7 rounded flex items-center justify-center text-[#9CA3AF] enabled:hover:text-[#E5E7EB] enabled:hover:bg-[#222222] transition-colors enabled:cursor-pointer"
            >
              <Edit3 size={12} />
            </button>
          )}

          <button
            type="button"
            onClick={toggleWorldSelector}
            title={isWorldSelectorOpen ? 'Згорнути список світів' : 'Перемкнути світ'}
            className={`w-7 h-7 rounded flex items-center justify-center text-[#9CA3AF] enabled:hover:text-[#E5E7EB] enabled:hover:bg-[#222222] transition-colors enabled:cursor-pointer ${
              isWorldSelectorOpen ? 'bg-[#222222] text-[#F3F4F6]' : ''
            }`}
          >
            <ChevronDown
              size={14}
              className={`transition-transform duration-200 ${
                isWorldSelectorOpen ? 'rotate-180' : 'rotate-0'
              }`}
            />
          </button>
        </div>
      </div>

      {/* Інлайн-шторка списку світів */}
      <div
        className={`transition-all duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] overflow-hidden ${
          isWorldSelectorOpen
            ? 'max-h-[300px] opacity-100 mt-2 pointer-events-auto'
            : 'max-h-0 opacity-0 mt-0 pointer-events-none'
        }`}
      >
        <div className="bg-[#161616] border border-[#262626] rounded-lg p-2 flex flex-col gap-2 shadow-xl">
          <div className="text-[10px] font-bold text-[#9CA3AF] px-1.5 pt-0.5 tracking-[0.6px]">
            ДОСТУПНІ ВСЕСВІТИ
          </div>

          <div className="flex flex-col gap-1 max-h-[190px] overflow-y-auto pr-0.5">
            {worlds.length === 0 ? (
              <div className="text-xs text-[#6B7280] italic px-2 py-1.5">
                Світи ще не завантажені
              </div>
            ) : (
              worlds.map((world) => {
                const isSelected = world.world_id === activeWorldId;
                const rowColor = world.accent_color || '#7E0018';

                return (
                  <div
                    key={world.world_id}
                    className={`group/world flex items-center gap-1 rounded-md border px-1.5 py-1 transition-colors ${
                      isSelected
                        ? 'bg-[#211216] border-[#7E0018]/65 text-white'
                        : 'bg-[#141414] border-transparent hover:bg-[#1E1E1E] hover:border-[#2C2C2C] text-[#E5E7EB]'
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => {
                        void selectWorld(world.world_id);
                      }}
                      className="flex items-center gap-2 min-w-0 flex-1 text-left py-0.5 enabled:cursor-pointer"
                    >
                      <div
                        className="w-6 h-6 rounded flex items-center justify-center shrink-0 border"
                        style={{
                          backgroundColor: hexToRgba(rowColor, 0.14),
                          borderColor: hexToRgba(rowColor, 0.4),
                        }}
                      >
                        <DynamicLucideIcon
                          icon={world.icon || 'globe'}
                          size={12}
                          style={{ color: rowColor }}
                        />
                      </div>

                      <div className="flex flex-col min-w-0 flex-1">
                        <span
                          className={`text-xs truncate ${
                            isSelected ? 'font-semibold text-white' : 'font-medium text-[#E5E7EB]'
                          }`}
                        >
                          {world.title}
                        </span>
                        <span className="text-[10px] text-[#9CA3AF] truncate">
                          {formatHeroCount(world.character_count)}
                        </span>
                      </div>
                    </button>

                    {/* Дії зі світом праворуч */}
                    <div className="flex items-center gap-0.5 shrink-0">
                      {onEditWorld && (
                        <button
                          type="button"
                          onClick={() => onEditWorld(world)}
                          title={`Редагувати «${world.title}»`}
                          className="w-6 h-6 rounded flex items-center justify-center text-[#9CA3AF] opacity-80 group-hover/world:opacity-100 enabled:hover:text-[#F3F4F6] enabled:hover:bg-[#2A2A2A] transition-colors enabled:cursor-pointer"
                        >
                          <Edit3 size={11} />
                        </button>
                      )}

                      {onCloneWorld && (
                        <button
                          type="button"
                          onClick={() => onCloneWorld(world)}
                          title={`Клонувати «${world.title}»`}
                          className="w-6 h-6 rounded flex items-center justify-center text-[#9CA3AF] opacity-80 group-hover/world:opacity-100 enabled:hover:text-[#93C5FD] enabled:hover:bg-[#1E293B]/60 transition-colors enabled:cursor-pointer"
                        >
                          <Copy size={11} />
                        </button>
                      )}

                      {onRequestDeleteWorld && (
                        <button
                          type="button"
                          disabled={world.is_default}
                          onClick={() => onRequestDeleteWorld(world)}
                          title={
                            world.is_default
                              ? 'Базовий світ неможливо видалити'
                              : `Видалити «${world.title}»`
                          }
                          className="w-6 h-6 rounded flex items-center justify-center text-[#9CA3AF] opacity-80 group-hover/world:opacity-100 enabled:hover:text-[#EF4444] enabled:hover:bg-[#2A1418] transition-colors enabled:cursor-pointer disabled:opacity-30 disabled:cursor-default"
                        >
                          <Trash2 size={11} />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>

          <button
            type="button"
            onClick={onCreateWorld}
            className="w-full bg-[#7E0018] enabled:hover:bg-[#9E0020] enabled:active:bg-[#5C0012] text-white text-xs font-semibold py-2 px-3 rounded-md flex items-center justify-center gap-1.5 transition-colors enabled:cursor-pointer shadow-sm shrink-0"
          >
            <Plus size={13} />
            <span>Створити новий світ</span>
          </button>
        </div>
      </div>
    </div>
  );
};
