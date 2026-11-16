import React, { useState } from 'react';
import { Plus, X } from 'lucide-react';
import { hexToRgba } from '../../utils/lucideIconMap';
import { DynamicLucideIcon } from './DynamicLucideIcon';
import type { DynamicSectionProps } from './types';

export const TagListSection: React.FC<DynamicSectionProps<string[]>> = ({
  title,
  icon = 'sparkles',
  color = '#A78BFA',
  value,
  mode,
  variant = 'column',
  emptyText = 'Теги відсутні',
  onChange,
}) => {
  const tags = Array.isArray(value) ? value.map((v) => String(v)) : [];
  const [newTag, setNewTag] = useState('');

  const isColumnRead = mode === 'read' && variant === 'column';

  const containerClasses = isColumnRead
    ? 'bg-[#1C1C1C] border border-[#2A2A2A] rounded-lg p-3 flex flex-col h-full max-h-[340px]'
    : 'bg-[#161616] border border-[#262626] rounded-lg p-3 flex flex-col gap-2';

  const chipBg = hexToRgba(color, 0.14);
  const chipBorder = hexToRgba(color, 0.36);

  const handleAddTag = () => {
    if (!onChange) return;
    const trimmed = newTag.trim();
    if (!trimmed) return;
    if (!tags.includes(trimmed)) {
      onChange([...tags, trimmed]);
    }
    setNewTag('');
  };

  const handleRemoveTag = (index: number) => {
    if (!onChange) return;
    onChange(tags.filter((_, i) => i !== index));
  };

  return (
    <div className={containerClasses}>
      <div
        className="text-xs font-bold tracking-[0.5px] pb-2 border-b border-[#262626] mb-2 flex items-center gap-1.5 shrink-0"
        style={{ color }}
      >
        <DynamicLucideIcon icon={icon} size={13} className="shrink-0" />
        <span className="truncate">{title}</span>
      </div>

      <div className="flex flex-col gap-2">
        {tags.length === 0 ? (
          <span className="text-xs text-[#6B7280] italic py-1">{emptyText}</span>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {tags.map((tag, idx) => (
              <span
                key={`${tag}-${idx}`}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-medium border text-[#F3F4F6]"
                style={{
                  backgroundColor: chipBg,
                  borderColor: chipBorder,
                }}
              >
                <span>{tag}</span>
                {mode === 'edit' && (
                  <button
                    type="button"
                    onClick={() => handleRemoveTag(idx)}
                    title={`Видалити «${tag}»`}
                    className="ml-0.5 text-[#D1D5DB] hover:text-[#EF4444] transition-colors cursor-pointer"
                  >
                    <X size={11} />
                  </button>
                )}
              </span>
            ))}
          </div>
        )}

        {mode === 'edit' && (
          <div className="flex items-center gap-1.5 pt-1">
            <input
              type="text"
              value={newTag}
              onChange={(e) => setNewTag(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  handleAddTag();
                }
              }}
              placeholder="Новий тег..."
              className="flex-1 min-w-0 bg-[#121212] border border-[#2D2D2D] focus:border-[#7E0018] rounded px-2 py-1 text-xs text-[#E5E7EB] outline-none transition-colors"
            />
            <button
              type="button"
              onClick={handleAddTag}
              disabled={!newTag.trim()}
              className="text-[11px] font-semibold px-2.5 py-1 rounded bg-[#1E1E1E] hover:bg-[#2A2A2A] disabled:opacity-40 border border-[#333333] text-[#E5E7EB] flex items-center gap-1 transition-colors cursor-pointer shrink-0"
            >
              <Plus size={11} />
              <span>Додати</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
