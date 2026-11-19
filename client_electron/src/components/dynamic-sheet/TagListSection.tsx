import React, { useState } from 'react';
import { Plus, X } from 'lucide-react';
import { isTechnicalFieldKey } from '../../utils/characterBlockStyles';
import { hexToRgba } from '../../utils/lucideIconMap';
import { COMPACT_FIELD_CLASS } from '../ui/Input';
import { DynamicLucideIcon } from './DynamicLucideIcon';
import type { DynamicSectionProps } from './types';

function formatTagEntry(raw: unknown): string {
  if (raw === null || raw === undefined) return '';
  if (typeof raw === 'string' || typeof raw === 'number' || typeof raw === 'boolean') {
    return String(raw).trim();
  }
  if (Array.isArray(raw)) {
    return raw.map(formatTagEntry).filter(Boolean).join(', ');
  }
  if (typeof raw === 'object') {
    const obj = raw as Record<string, unknown>;
    const primary = String(obj.name ?? obj.title ?? obj.label ?? obj.text ?? '').trim();
    const extra = String(obj.desc ?? obj.description ?? obj.value ?? obj.note ?? '').trim();

    if (primary && extra && primary !== extra) {
      return `${primary} — ${extra}`;
    }
    if (primary || extra) {
      return primary || extra;
    }

    const fallbackValues = Object.entries(obj)
      .filter(([k, v]) => !isTechnicalFieldKey(k) && v !== null && v !== undefined && typeof v !== 'object')
      .map(([, v]) => String(v).trim())
      .filter(Boolean);
    return fallbackValues.join(' — ');
  }
  return '';
}

export const TagListSection: React.FC<DynamicSectionProps<any[]>> = ({
  title,
  icon = 'sparkles',
  color = '#A78BFA',
  value,
  mode,
  variant = 'column',
  emptyText = 'Теги відсутні',
  onChange,
}) => {
  const rawItems = Array.isArray(value) ? value : [];
  const tags = rawItems.map(formatTagEntry).filter(Boolean);
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
      onChange([...rawItems, trimmed]);
    }
    setNewTag('');
  };

  const handleRemoveTag = (index: number) => {
    if (!onChange) return;
    onChange(rawItems.filter((_, i) => i !== index));
  };

  return (
    <div className={containerClasses}>
      <div
        className="text-xs font-bold tracking-[0.5px] pb-2 border-b border-[#262626] mb-2 flex items-center gap-1.5 shrink-0"
        style={{ color }}
      >
        <DynamicLucideIcon icon={icon} size={13} className="shrink-0" />
        <span className="truncate uppercase">{title}</span>
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
                    aria-label={`Видалити «${tag}»`}
                    className="w-3.5 h-3.5 rounded-sm inline-flex items-center justify-center ml-0.5 text-[#D1D5DB] enabled:hover:text-[#EF4444] enabled:hover:bg-[#2A1418] transition-colors enabled:cursor-pointer"
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
              className={`flex-1 min-w-0 px-2 py-1 text-xs ${COMPACT_FIELD_CLASS}`}
            />
            <button
              type="button"
              onClick={handleAddTag}
              disabled={!newTag.trim()}
              className="text-[11px] font-semibold px-2.5 py-1 rounded bg-[#1E1E1E] border border-[#333333] text-[#E5E7EB] flex items-center gap-1 transition-all duration-150 shrink-0 enabled:hover:bg-[#2A2A2A] enabled:hover:border-[#444444] enabled:active:scale-[0.98] enabled:cursor-pointer disabled:opacity-40 disabled:cursor-default"
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
