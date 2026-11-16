import React from 'react';
import { Plus, X } from 'lucide-react';
import { hexToRgba } from '../../utils/lucideIconMap';
import { DynamicLucideIcon } from './DynamicLucideIcon';
import type { DynamicSectionProps } from './types';

const TITLE_KEY_PRIORITY = ['name', 'title', 'location', 'label'];
const DESC_KEY_PRIORITY = ['desc', 'description', 'type', 'effect', 'notes'];

interface ExtractedCardParts {
  title: string;
  desc: string;
  extraEntries: Array<[string, any]>;
  titleKey: string | null;
  descKey: string | null;
}

function isPlainRecord(val: unknown): val is Record<string, any> {
  return typeof val === 'object' && val !== null && !Array.isArray(val);
}

function extractCardParts(item: unknown): ExtractedCardParts {
  if (typeof item === 'string' || typeof item === 'number') {
    return {
      title: String(item),
      desc: '',
      extraEntries: [],
      titleKey: null,
      descKey: null,
    };
  }

  if (!isPlainRecord(item)) {
    return {
      title: String(item ?? ''),
      desc: '',
      extraEntries: [],
      titleKey: null,
      descKey: null,
    };
  }

  const keys = Object.keys(item);
  let titleKey: string | null = null;
  for (const candidate of TITLE_KEY_PRIORITY) {
    if (candidate in item && item[candidate] !== undefined && item[candidate] !== null) {
      titleKey = candidate;
      break;
    }
  }
  if (!titleKey) {
    titleKey = keys.find((k) => typeof item[k] === 'string') ?? keys[0] ?? null;
  }

  let descKey: string | null = null;
  for (const candidate of DESC_KEY_PRIORITY) {
    if (
      candidate !== titleKey &&
      candidate in item &&
      item[candidate] !== undefined &&
      item[candidate] !== null &&
      String(item[candidate]).trim() !== ''
    ) {
      descKey = candidate;
      break;
    }
  }

  const extraEntries = Object.entries(item).filter(
    ([k, v]) =>
      k !== titleKey &&
      k !== descKey &&
      v !== undefined &&
      v !== null &&
      String(v).trim() !== ''
  );

  return {
    title: titleKey ? String(item[titleKey] ?? '') : '',
    desc: descKey ? String(item[descKey] ?? '') : '',
    extraEntries,
    titleKey,
    descKey,
  };
}

function buildEmptyCardTemplate(items: any[]): Record<string, any> {
  const sample = items.find((entry) => isPlainRecord(entry));
  if (sample) {
    const next: Record<string, any> = {};
    for (const key of Object.keys(sample)) {
      next[key] = '';
    }
    return next;
  }
  return { name: '', desc: '' };
}

export const CardListSection: React.FC<DynamicSectionProps<any[]>> = ({
  title,
  icon = 'box',
  color = '#9CA3AF',
  value,
  mode,
  variant = 'column',
  emptyText = 'Записи відсутні',
  onChange,
}) => {
  const items = Array.isArray(value) ? value : [];
  const isColumnRead = mode === 'read' && variant === 'column';

  const containerClasses = isColumnRead
    ? 'bg-[#1C1C1C] border border-[#2A2A2A] rounded-lg p-3 flex flex-col h-full max-h-[340px]'
    : 'bg-[#161616] border border-[#262626] rounded-lg p-3 flex flex-col gap-2';

  const cardBg = hexToRgba(color, 0.11);
  const cardBorder = hexToRgba(color, 0.34);
  const pillBg = hexToRgba(color, 0.16);

  const handleAddCard = () => {
    if (!onChange) return;
    onChange([...items, buildEmptyCardTemplate(items)]);
  };

  const handleRemoveCard = (index: number) => {
    if (!onChange) return;
    onChange(items.filter((_, idx) => idx !== index));
  };

  const handleUpdateField = (index: number, fieldKey: string | null, nextVal: string) => {
    if (!onChange) return;
    const updated = items.map((item, idx) => {
      if (idx !== index) return item;
      if (fieldKey === null || !isPlainRecord(item)) {
        return nextVal;
      }
      return { ...item, [fieldKey]: nextVal };
    });
    onChange(updated);
  };

  return (
    <div className={containerClasses}>
      <div
        className="text-xs font-bold tracking-[0.5px] pb-2 border-b border-[#262626] mb-2 flex items-center justify-between gap-2 shrink-0"
        style={{ color }}
      >
        <div className="flex items-center gap-1.5 min-w-0">
          <DynamicLucideIcon icon={icon} size={13} className="shrink-0" />
          <span className="truncate">{title}</span>
        </div>
        {mode === 'edit' && (
          <button
            type="button"
            onClick={handleAddCard}
            className="text-[11px] font-semibold px-2 py-0.5 rounded bg-[#1E1E1E] hover:bg-[#2A2A2A] border border-[#333333] text-[#E5E7EB] flex items-center gap-1 transition-colors cursor-pointer shrink-0"
          >
            <Plus size={11} />
            <span>Додати</span>
          </button>
        )}
      </div>

      <div
        className={
          isColumnRead
            ? 'flex-1 min-h-0 overflow-y-auto pr-1 flex flex-col gap-2'
            : 'flex flex-col gap-2'
        }
      >
        {items.length === 0 ? (
          <span className="text-xs text-[#6B7280] italic py-1.5">{emptyText}</span>
        ) : mode === 'read' ? (
          items.map((item, idx) => {
            const parts = extractCardParts(item);
            return (
              <div
                key={idx}
                title={parts.desc || parts.title}
                className="shrink-0 rounded-md p-2 flex flex-col gap-1 border"
                style={{
                  backgroundColor: cardBg,
                  borderColor: cardBorder,
                }}
              >
                <div className="flex items-start justify-between gap-2">
                  <span className="text-xs font-semibold text-[#F3F4F6] leading-snug">
                    {parts.title || 'Без назви'}
                  </span>
                </div>

                {parts.desc && (
                  <span className="text-[11px] text-[#D1D5DB] opacity-85 leading-relaxed">
                    {parts.desc}
                  </span>
                )}

                {parts.extraEntries.length > 0 && (
                  <div className="flex flex-wrap gap-1 pt-0.5">
                    {parts.extraEntries.map(([eKey, eVal]) => (
                      <span
                        key={eKey}
                        className="text-[10px] px-1.5 py-0.5 rounded border text-[#E5E7EB]"
                        style={{
                          backgroundColor: pillBg,
                          borderColor: cardBorder,
                        }}
                      >
                        <span className="opacity-70">{eKey}:</span>{' '}
                        <span className="font-medium">{String(eVal)}</span>
                      </span>
                    ))}
                  </div>
                )}
              </div>
            );
          })
        ) : (
          items.map((item, idx) => {
            const isRecord = isPlainRecord(item);
            const recordEntries = isRecord ? Object.entries(item) : [];

            return (
              <div
                key={idx}
                className="bg-[#121212] border border-[#2B2B2B] rounded-md p-2.5 flex flex-col gap-2"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-[#6B7280]">
                    Запис #{idx + 1}
                  </span>
                  <button
                    type="button"
                    onClick={() => handleRemoveCard(idx)}
                    title="Видалити запис"
                    className="w-5 h-5 rounded flex items-center justify-center text-[#6B7280] hover:text-[#EF4444] hover:bg-[#2A1418] transition-colors cursor-pointer"
                  >
                    <X size={12} />
                  </button>
                </div>

                {isRecord ? (
                  <div className="flex flex-col gap-1.5">
                    {recordEntries.map(([fieldKey, fieldVal]) => (
                      <div key={fieldKey} className="flex flex-col gap-0.5">
                        <label className="text-[10px] text-[#9CA3AF]">{fieldKey}</label>
                        <input
                          type="text"
                          value={String(fieldVal ?? '')}
                          onChange={(e) => handleUpdateField(idx, fieldKey, e.target.value)}
                          placeholder={`Введіть ${fieldKey}...`}
                          className="w-full bg-[#181818] border border-[#2E2E2E] focus:border-[#7E0018] rounded px-2 py-1 text-xs text-[#E5E7EB] outline-none transition-colors"
                        />
                      </div>
                    ))}
                  </div>
                ) : (
                  <input
                    type="text"
                    value={String(item ?? '')}
                    onChange={(e) => handleUpdateField(idx, null, e.target.value)}
                    placeholder="Введіть значення..."
                    className="w-full bg-[#181818] border border-[#2E2E2E] focus:border-[#7E0018] rounded px-2 py-1 text-xs text-[#E5E7EB] outline-none transition-colors"
                  />
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
