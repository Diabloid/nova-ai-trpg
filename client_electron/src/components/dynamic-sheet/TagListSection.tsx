import React, { useState } from 'react';
import { Plus, X } from 'lucide-react';
import { isTechnicalFieldKey } from '../../utils/characterBlockStyles';
import { hexToRgba } from '../../utils/lucideIconMap';
import { Input } from '../ui/Input';
import { SectionShell } from './SectionShell';
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
    <SectionShell
      title={title}
      icon={icon}
      color={color}
      mode={mode}
      variant={variant}
      bodyClassName="flex flex-col gap-2"
    >
      {tags.length === 0 ? (
        <span className="text-xs text-text-dim italic py-1">{emptyText}</span>
      ) : (
        <div className="flex flex-wrap gap-1.5">
          {tags.map((tag, idx) => (
            <span
              key={`${tag}-${idx}`}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-medium border text-text-bright"
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
                  className="w-3.5 h-3.5 rounded-sm inline-flex items-center justify-center ml-0.5 text-text-secondary enabled:hover:text-danger enabled:hover:bg-accent-ruby-soft transition-colors enabled:cursor-pointer"
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
          <Input
            variant="compact"
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
            className="w-auto flex-1 min-w-0"
          />
          <button
            type="button"
            onClick={handleAddTag}
            disabled={!newTag.trim()}
            className="text-[11px] font-semibold px-2.5 py-1 rounded bg-bg-control border border-border-input text-text-primary flex items-center gap-1 transition-all duration-150 shrink-0 enabled:hover:bg-bg-active enabled:hover:border-border-focus enabled:active:scale-[0.98] enabled:cursor-pointer disabled:opacity-40 disabled:cursor-default"
          >
            <Plus size={11} />
            <span>Додати</span>
          </button>
        </div>
      )}
    </SectionShell>
  );
};
