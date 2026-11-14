import React from 'react';
import { User, RefreshCw, Edit3, Trash2 } from 'lucide-react';
import { useGameStore } from '../../store/useGameStore';
import type { CharacterSummary } from '../../types/api';

interface ActiveHeroCardProps {
  onEditCharacter?: (char: CharacterSummary) => void;
  onRequestDeleteCharacter?: (char: CharacterSummary) => void;
}

export const ActiveHeroCard: React.FC<ActiveHeroCardProps> = ({
  onEditCharacter,
  onRequestDeleteCharacter,
}) => {
  const {
    characters,
    activeCharacterId,
    activeCharacter,
    isHeroSelectorOpen,
    toggleHeroSelector,
    selectCharacter,
  } = useGameStore();

  const currentSummary = characters.find((c) => c.char_id === activeCharacterId);
  const heroName = activeCharacter?.meta?.name || currentSummary?.name || 'Не обрано';
  const heroBackground =
    activeCharacter?.meta?.background || currentSummary?.background || 'Оберіть героя зі списку';

  return (
    <div className="flex flex-col">
      <div className="flex items-center justify-between text-[11px] font-bold text-[#9CA3AF] tracking-[0.8px] mb-2">
        <span>АКТИВНИЙ ГЕРОЙ</span>
      </div>

      {/* Головна картка героя */}
      <div className="bg-[#161616] border border-[#262626] rounded-lg p-2.5 flex items-center justify-between transition-colors duration-150 hover:border-[#333333]">
        {/* Аватар + Інфо */}
        <div className="flex items-center gap-2.5 min-w-0 flex-1">
          <div className="w-9 h-9 rounded-full bg-[#222222] border border-[#353535] flex items-center justify-center shrink-0">
            <User size={16} className="text-[#60A5FA]" />
          </div>
          <div className="flex flex-col min-w-0 flex-1">
            <span className="text-[13px] font-bold text-[#F3F4F6] truncate">
              {heroName}
            </span>
            <span className="text-[10px] text-[#9CA3AF] truncate">
              {heroBackground}
            </span>
          </div>
        </div>

        {/* Кнопки дій */}
        <div className="flex items-center gap-1 shrink-0 ml-2">
          {/* Кнопка відкриття інлайн-шторки вибору героя */}
          <button
            type="button"
            onClick={toggleHeroSelector}
            title="Змінити активного героя"
            className={`w-7 h-7 rounded flex items-center justify-center text-[#9CA3AF] hover:text-[#E5E7EB] hover:bg-[#222222] transition-colors cursor-pointer ${
              isHeroSelectorOpen ? 'bg-[#222222] text-[#60A5FA]' : ''
            }`}
          >
            <RefreshCw size={13} className={`transition-transform duration-200 ${isHeroSelectorOpen ? 'rotate-180' : ''}`} />
          </button>

          {/* Редагувати заготовку */}
          {currentSummary && onEditCharacter && (
            <button
              type="button"
              onClick={() => onEditCharacter(currentSummary)}
              title="Редагувати заготовку"
              className="w-7 h-7 rounded flex items-center justify-center text-[#9CA3AF] hover:text-[#E5E7EB] hover:bg-[#222222] transition-colors cursor-pointer"
            >
              <Edit3 size={12} />
            </button>
          )}

          {/* Видалити героя */}
          {currentSummary && onRequestDeleteCharacter && (
            <button
              type="button"
              onClick={() => onRequestDeleteCharacter(currentSummary)}
              title="Видалити героя"
              className="w-7 h-7 rounded flex items-center justify-center text-[#9CA3AF] hover:text-[#EF4444] hover:bg-[#2A1418] transition-colors cursor-pointer"
            >
              <Trash2 size={12} />
            </button>
          )}
        </div>
      </div>

      {/* Інлайн-шторка вибору героя (плавний виїзд точно по ширині картки) */}
      <div
        className={`transition-all duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] overflow-hidden ${
          isHeroSelectorOpen
            ? 'max-h-[200px] opacity-100 mt-2 pointer-events-auto'
            : 'max-h-0 opacity-0 mt-0 pointer-events-none'
        }`}
      >
        <div className="bg-[#161616] border border-[#262626] rounded-lg p-2 flex flex-col gap-1 max-h-[180px] overflow-y-auto shadow-xl">
          <div className="text-[10px] font-bold text-[#9CA3AF] px-2 py-1">
            ОБЕРІТЬ ГЕРОЯ
          </div>
          {characters.length === 0 ? (
            <div className="text-xs text-[#6B7280] italic px-2 py-1">
              Герої відсутні
            </div>
          ) : (
            characters.map((char) => {
              const isSelected = char.char_id === activeCharacterId;
              return (
                <button
                  key={char.char_id}
                  type="button"
                  onClick={() => selectCharacter(char.char_id)}
                  className={`w-full flex items-center gap-2 px-2 py-1.5 rounded text-left text-xs transition-colors cursor-pointer ${
                    isSelected
                      ? 'bg-[#7E0018]/30 border border-[#7E0018]/60 text-white font-semibold'
                      : 'text-[#E5E7EB] hover:bg-[#222222]'
                  }`}
                >
                  <User size={13} className={isSelected ? 'text-[#EF4444]' : 'text-[#9CA3AF]'} />
                  <span className="truncate flex-1">{char.name}</span>
                  {isSelected && <span className="text-[10px] text-[#EF4444]">Активний</span>}
                </button>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};
