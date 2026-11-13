import React from 'react';
import { ChevronDown, RefreshCw } from 'lucide-react';
import { useGameStore } from '../../store/useGameStore';
import { Button } from '../ui/Button';

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

export const LivePreview: React.FC = () => {
  const {
    wizardDraft,
    setWizardDraft,
    isWizardAppearanceDetailsExpanded,
    toggleWizardAppearanceDetails,
    isSyncingDraft,
    syncWizardDraft,
    finalizeWizard,
    isWizardTyping,
    wizardMessages,
  } = useGameStore();

  const handleInputChange = (field: keyof typeof wizardDraft, val: string) => {
    setWizardDraft({ [field]: val });
  };

  const injuries = wizardDraft.injuries || [];
  const abilities = wizardDraft.abilities || [];
  const equipment = wizardDraft.equipment || [];
  const customBlocks = wizardDraft.customBlocks || {};

  const filteredCustomBlocks = Object.entries(customBlocks).filter(
    ([k]) => k !== 'created_at' && k !== 'updated_at'
  );

  return (
    <div className="w-[340px] shrink-0 bg-[#161616] border border-[#262626] rounded-xl p-4 pb-2.5 flex flex-col h-full shadow-lg">
      {/* 1. Верхня смуга дій: Заголовок + Кнопка ручної синхронізації */}
      <div className="flex items-center justify-between pb-3 border-b border-[#222222]">
        <span className="text-[#9CA3AF] text-[11px] font-bold tracking-wider uppercase">
          ПОПЕРЕДНІЙ ПЕРЕГЛЯД
        </span>
        <button
          type="button"
          onClick={() => syncWizardDraft()}
          disabled={isSyncingDraft || isWizardTyping}
          title="Синхронізувати ручні правки з ШІ (узгоджує характеристики, здібності та спорядження)"
          className="flex items-center gap-1.5 px-2 py-1 bg-[#1A1A1A] hover:bg-[#252525] border border-[#333333] rounded-md text-[#D1D5DB] text-[10px] font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
        >
          <RefreshCw className={`w-3 h-3 ${isSyncingDraft ? 'animate-spin text-[#A78BFA]' : ''}`} />
          <span>{isSyncingDraft ? 'Синхронізація...' : 'Синхронізувати'}</span>
        </button>
      </div>

      {/* 2. Скрол форми чернетки з маскою розсіювання (mask-fade-vertical) */}
      <div className="flex-1 overflow-y-auto mask-fade-vertical pr-1 py-3 space-y-3.5">
        {/* Ім'я героя */}
        <div className="space-y-1">
          <label className="block text-[11px] text-[#9CA3AF]">Ім'я героя:</label>
          <input
            type="text"
            value={wizardDraft.charName}
            onChange={(e) => handleInputChange('charName', e.target.value)}
            placeholder="Буде виведено з діалогу..."
            className="w-full bg-[#121212] border border-[#2B2B2B] focus:border-[#7E0018] rounded-md px-2.5 py-1.5 text-xs text-[#E5E7EB] placeholder-[#555555] outline-none transition-colors"
          />
        </div>

        {/* Титули та вік */}
        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1">
            <label className="block text-[11px] text-[#9CA3AF]">Титули / Звання:</label>
            <input
              type="text"
              value={wizardDraft.charTitles}
              onChange={(e) => handleInputChange('charTitles', e.target.value)}
              placeholder="Звання, епітет..."
              className="w-full bg-[#121212] border border-[#2B2B2B] focus:border-[#7E0018] rounded-md px-2.5 py-1.5 text-xs text-[#E5E7EB] placeholder-[#555555] outline-none transition-colors"
            />
          </div>
          <div className="space-y-1">
            <label className="block text-[11px] text-[#9CA3AF]">Вік:</label>
            <input
              type="text"
              value={wizardDraft.charAge}
              onChange={(e) => handleInputChange('charAge', e.target.value)}
              placeholder="25 років..."
              className="w-full bg-[#121212] border border-[#2B2B2B] focus:border-[#7E0018] rounded-md px-2.5 py-1.5 text-xs text-[#E5E7EB] placeholder-[#555555] outline-none transition-colors"
            />
          </div>
        </div>

        {/* Походження / Архетип */}
        <div className="space-y-1">
          <label className="block text-[11px] text-[#9CA3AF]">Походження / Архетип:</label>
          <textarea
            value={wizardDraft.charBackground}
            onChange={(e) => handleInputChange('charBackground', e.target.value)}
            placeholder="Буде сформовано ШІ..."
            rows={2}
            className="w-full bg-[#121212] border border-[#2B2B2B] focus:border-[#7E0018] rounded-md px-2.5 py-1.5 text-xs text-[#E5E7EB] placeholder-[#555555] outline-none transition-colors resize-y min-h-[50px] max-h-[120px]"
          />
        </div>

        {/* Зовнішність */}
        <div className="space-y-1">
          <label className="block text-[11px] text-[#9CA3AF]">Зовнішність:</label>
          <textarea
            value={wizardDraft.charAppearance}
            onChange={(e) => handleInputChange('charAppearance', e.target.value)}
            placeholder="Буде сформовано ШІ..."
            rows={2}
            className="w-full bg-[#121212] border border-[#2B2B2B] focus:border-[#7E0018] rounded-md px-2.5 py-1.5 text-xs text-[#E5E7EB] placeholder-[#555555] outline-none transition-colors resize-y min-h-[50px] max-h-[120px]"
          />
        </div>

        {/* Деталі зовнішності (розгортний блок) */}
        <div className="bg-[#141414] border border-[#262626] rounded-md p-2 space-y-2">
          <button
            type="button"
            onClick={toggleWizardAppearanceDetails}
            className="w-full flex items-center justify-between text-left cursor-pointer group"
          >
            <span className="text-[11px] font-semibold text-[#9CA3AF] group-hover:text-[#D1D5DB] transition-colors">
              🎭 Деталі зовнішності та риси
            </span>
            <ChevronDown
              className={`w-3.5 h-3.5 text-[#6B7280] transition-transform duration-200 ${
                isWizardAppearanceDetailsExpanded ? 'rotate-180' : ''
              }`}
            />
          </button>

          {isWizardAppearanceDetailsExpanded && (
            <div className="space-y-2 pt-1 border-t border-[#222222]">
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-0.5">
                  <label className="block text-[10px] text-[#6B7280]">Статура:</label>
                  <input
                    type="text"
                    value={wizardDraft.physique}
                    onChange={(e) => handleInputChange('physique', e.target.value)}
                    placeholder="Атлетична..."
                    className="w-full bg-[#111111] border border-[#222222] focus:border-[#7E0018] rounded px-2 py-1 text-[11px] text-[#E5E7EB] placeholder-[#4B5563] outline-none"
                  />
                </div>
                <div className="space-y-0.5">
                  <label className="block text-[10px] text-[#6B7280]">Зріст:</label>
                  <input
                    type="text"
                    value={wizardDraft.height}
                    onChange={(e) => handleInputChange('height', e.target.value)}
                    placeholder="185 см..."
                    className="w-full bg-[#111111] border border-[#222222] focus:border-[#7E0018] rounded px-2 py-1 text-[11px] text-[#E5E7EB] placeholder-[#4B5563] outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-0.5">
                  <label className="block text-[10px] text-[#6B7280]">Очі:</label>
                  <input
                    type="text"
                    value={wizardDraft.eyes}
                    onChange={(e) => handleInputChange('eyes', e.target.value)}
                    placeholder="Сіро-блакитні..."
                    className="w-full bg-[#111111] border border-[#222222] focus:border-[#7E0018] rounded px-2 py-1 text-[11px] text-[#E5E7EB] placeholder-[#4B5563] outline-none"
                  />
                </div>
                <div className="space-y-0.5">
                  <label className="block text-[10px] text-[#6B7280]">Волосся:</label>
                  <input
                    type="text"
                    value={wizardDraft.hair}
                    onChange={(e) => handleInputChange('hair', e.target.value)}
                    placeholder="Темне..."
                    className="w-full bg-[#111111] border border-[#222222] focus:border-[#7E0018] rounded px-2 py-1 text-[11px] text-[#E5E7EB] placeholder-[#4B5563] outline-none"
                  />
                </div>
              </div>

              <div className="space-y-0.5">
                <label className="block text-[10px] text-[#6B7280]">Расові ознаки / Шрами:</label>
                <input
                  type="text"
                  value={wizardDraft.raceTraits}
                  onChange={(e) => handleInputChange('raceTraits', e.target.value)}
                  placeholder="Гострі вуха, татуювання..."
                  className="w-full bg-[#111111] border border-[#222222] focus:border-[#7E0018] rounded px-2 py-1 text-[11px] text-[#E5E7EB] placeholder-[#4B5563] outline-none"
                />
              </div>
            </div>
          )}
        </div>

        {/* Біографія та хроніка */}
        <div className="space-y-1">
          <label className="block text-[11px] text-[#9CA3AF]">Біографія та хронологія:</label>
          <textarea
            value={wizardDraft.biography}
            onChange={(e) => handleInputChange('biography', e.target.value)}
            placeholder="Ключові події життя або передісторія..."
            rows={2}
            className="w-full bg-[#121212] border border-[#2B2B2B] focus:border-[#7E0018] rounded-md px-2.5 py-1.5 text-xs text-[#E5E7EB] placeholder-[#555555] outline-none transition-colors resize-y min-h-[50px] max-h-[120px]"
          />
        </div>

        {/* Початкова локація (якщо визначено) */}
        {wizardDraft.charLocation && (
          <div className="space-y-1">
            <label className="block text-[11px] text-[#9CA3AF]">Початкова локація:</label>
            <div className="bg-[#141414] border border-[#262626] rounded-md p-2.5">
              <p className="text-xs text-[#6EE7B7] leading-relaxed">{wizardDraft.charLocation}</p>
            </div>
          </div>
        )}

        {/* Фізичний стан (якщо визначено) */}
        {wizardDraft.overallHealth && (
          <div className="space-y-1">
            <label className="block text-[11px] text-[#9CA3AF]">Фізичний стан:</label>
            <div className="bg-[#141414] border border-[#262626] rounded-md p-2.5">
              <p className="text-xs text-[#93C5FD] leading-relaxed">{wizardDraft.overallHealth}</p>
            </div>
          </div>
        )}

        {/* Травми та ушкодження */}
        {injuries.length > 0 && (
          <div className="space-y-1.5">
            <div className="text-[11px] font-semibold text-[#EF4444]">🩸 Травми та ушкодження:</div>
            <div className="space-y-1">
              {injuries.map((inj: any, idx: number) => {
                const loc = typeof inj === 'string' ? inj : inj.location || inj.name || 'Тіло';
                const desc = typeof inj === 'object' ? inj.description || inj.desc || '' : '';
                return (
                  <div
                    key={idx}
                    className="bg-[#2A1414] border border-[#4A1818] rounded-md p-2 text-xs"
                  >
                    <div className="font-semibold text-[#FCA5A5]">{loc}</div>
                    {desc && <div className="text-[#F87171] text-[10px] mt-0.5">{desc}</div>}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Здібності та магія */}
        {abilities.length > 0 && (
          <div className="space-y-1.5">
            <div className="text-[11px] font-semibold text-[#C084FC]">⚡ Здібності та магія:</div>
            <div className="space-y-1">
              {abilities.map((ab: any, idx: number) => {
                const name = typeof ab === 'string' ? ab : ab.name || 'Навичка';
                const desc = typeof ab === 'object' ? ab.desc || ab.description || '' : '';
                return (
                  <div
                    key={idx}
                    className="bg-[#161220] border border-[#35244C] rounded-md p-2 text-xs"
                  >
                    <div className="font-semibold text-[#E9D5FF]">{name}</div>
                    {desc && <div className="text-[#A855F7] text-[10px] mt-0.5 opacity-85">{desc}</div>}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Початкове спорядження */}
        {equipment.length > 0 && (
          <div className="space-y-1.5">
            <div className="text-[11px] font-semibold text-[#34D399]">🎒 Початкове спорядження:</div>
            <div className="space-y-1">
              {equipment.map((eq: any, idx: number) => {
                const name = typeof eq === 'string' ? eq : eq.name || 'Предмет';
                const desc = typeof eq === 'object' ? eq.desc || eq.description || '' : '';
                return (
                  <div
                    key={idx}
                    className="bg-[#0E1E17] border border-[#1B4232] rounded-md p-2 text-xs"
                  >
                    <div className="font-semibold text-[#D1FAE5]">{name}</div>
                    {desc && <div className="text-[#6EE7B7] text-[10px] mt-0.5 opacity-85">{desc}</div>}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Динамічні довільні блоки (Custom Blocks) */}
        {filteredCustomBlocks.map(([key, data]) => {
          const style = KNOWN_BLOCK_STYLES[key] || {
            title: formatTitle(key),
            color: '#9CA3AF',
            icon: '📦',
          };

          return (
            <div
              key={key}
              className="bg-[#161616] border border-[#2A2A2A] rounded-md p-2.5 space-y-1.5"
            >
              <div className="flex items-center gap-1.5">
                <span className="text-xs">{style.icon}</span>
                <span
                  className="font-bold text-[11px] tracking-wide"
                  style={{ color: style.color }}
                >
                  {style.title}
                </span>
              </div>

              {/* Dict fields */}
              {typeof data === 'object' && !Array.isArray(data) && data !== null && (
                <div className="space-y-1 pt-1">
                  {Object.entries(data).map(([fieldKey, fieldVal]) => (
                    <div key={fieldKey} className="text-xs flex gap-1">
                      <span className="text-[#9CA3AF]">{formatTitle(fieldKey)}:</span>
                      <span className="text-[#E5E7EB]">{String(fieldVal)}</span>
                    </div>
                  ))}
                </div>
              )}

              {/* Array / tags */}
              {Array.isArray(data) && (
                <div className="flex flex-wrap gap-1 pt-1">
                  {data.map((item, idx) => (
                    <span
                      key={idx}
                      className="bg-[#222222] text-[#F3F4F6] text-[10px] px-1.5 py-0.5 rounded"
                    >
                      {typeof item === 'object' ? item.name || JSON.stringify(item) : String(item)}
                    </span>
                  ))}
                </div>
              )}
            </div>
          );
        })}

        {/* Підказка */}
        <div className="bg-[#1A0D0E] border border-[#4A1218] rounded-lg p-2.5">
          <p className="text-[11px] text-[#FCA5A5] leading-relaxed">
            💡 Можна вести діалог із Творцем Долі у вільному стилі, або за бажанням підкоригувати параметри вручну та натиснути кнопку «Синхронізувати» для узгодження з ШІ.
          </p>
        </div>
      </div>

      {/* 3. Нижня закріплена кнопка: Завершити створення ➔ */}
      <div className="pt-2 border-t border-[#222222]">
        <Button
          variant="primary"
          onClick={() => finalizeWizard()}
          disabled={isWizardTyping || wizardMessages.length <= 1}
          className="w-full justify-center text-xs py-2.5 font-bold shadow-md cursor-pointer"
        >
          Завершити створення ➔
        </Button>
      </div>
    </div>
  );
};