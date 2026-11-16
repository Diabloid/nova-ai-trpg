import React, { useState } from 'react';
import { Plus, X } from 'lucide-react';
import { hexToRgba } from '../../utils/lucideIconMap';
import { DynamicLucideIcon } from './DynamicLucideIcon';
import type { DynamicSectionProps } from './types';

function isPlainRecord(val: unknown): val is Record<string, any> {
  return typeof val === 'object' && val !== null && !Array.isArray(val);
}

/** Витягує відсоток для прогрес-смужки зі значень виду `80/100` або `75%` */
function extractProgressPercent(rawVal: unknown): number | null {
  const str = String(rawVal ?? '').trim();
  if (!str) return null;

  const fractionMatch = str.match(/^(-?\d+(?:\.\d+)?)\s*\/\s*(\d+(?:\.\d+)?)$/);
  if (fractionMatch) {
    const current = Number.parseFloat(fractionMatch[1]);
    const max = Number.parseFloat(fractionMatch[2]);
    if (!Number.isFinite(current) || !Number.isFinite(max) || max <= 0) return null;
    return Math.max(0, Math.min(100, (current / max) * 100));
  }

  const percentMatch = str.match(/^(-?\d+(?:\.\d+)?)\s*%$/);
  if (percentMatch) {
    const pct = Number.parseFloat(percentMatch[1]);
    if (!Number.isFinite(pct)) return null;
    return Math.max(0, Math.min(100, pct));
  }

  return null;
}

function parseStatInputValue(raw: string, wasNumber: boolean): string | number {
  if (!wasNumber) return raw;
  const trimmed = raw.trim();
  if (trimmed !== '' && /^-?\d+(?:\.\d+)?$/.test(trimmed)) {
    const num = Number(trimmed);
    if (Number.isFinite(num)) return num;
  }
  return raw;
}

export const StatGridSection: React.FC<DynamicSectionProps<Record<string, any>>> = ({
  title,
  icon = 'zap',
  color = '#38BDF8',
  value,
  mode,
  variant = 'column',
  emptyText = 'Параметри відсутні',
  onChange,
}) => {
  const statsObj = isPlainRecord(value) ? value : {};
  const entries = Object.entries(statsObj);
  const readableEntries =
    mode === 'read'
      ? entries.filter(([, v]) => {
          if (v === null || v === undefined) return false;
          if (Array.isArray(v)) return v.length > 0;
          return String(v).trim().length > 0;
        })
      : entries;
  const [newKey, setNewKey] = useState('');
  const [newVal, setNewVal] = useState('');

  const isColumnRead = mode === 'read' && variant === 'column';

  const containerClasses = isColumnRead
    ? 'bg-[#1C1C1C] border border-[#2A2A2A] rounded-lg p-3 flex flex-col h-full max-h-[340px]'
    : 'bg-[#161616] border border-[#262626] rounded-lg p-3 flex flex-col gap-2';

  const tileBg = hexToRgba(color, 0.08);
  const tileBorder = hexToRgba(color, 0.25);

  const handleRenameKey = (entryIdx: number, nextKeyRaw: string) => {
    if (!onChange) return;
    const nextObj: Record<string, any> = {};
    entries.forEach(([k, v], idx) => {
      if (idx === entryIdx) {
        const candidate = nextKeyRaw;
        nextObj[candidate] = v;
      } else {
        nextObj[k] = v;
      }
    });
    onChange(nextObj);
  };

  const handleUpdateValue = (entryIdx: number, nextRaw: string, wasNumber: boolean) => {
    if (!onChange) return;
    const nextObj: Record<string, any> = {};
    entries.forEach(([k, v], idx) => {
      nextObj[k] = idx === entryIdx ? parseStatInputValue(nextRaw, wasNumber) : v;
    });
    onChange(nextObj);
  };

  const handleRemoveEntry = (entryIdx: number) => {
    if (!onChange) return;
    const nextObj: Record<string, any> = {};
    entries.forEach(([k, v], idx) => {
      if (idx !== entryIdx) nextObj[k] = v;
    });
    onChange(nextObj);
  };

  const handleAddEntry = () => {
    if (!onChange) return;
    const key = newKey.trim();
    if (!key) return;
    const isNumeric = /^-?\d+(?:\.\d+)?$/.test(newVal.trim());
    onChange({
      ...statsObj,
      [key]: isNumeric ? Number(newVal.trim()) : newVal.trim(),
    });
    setNewKey('');
    setNewVal('');
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

      <div
        className={
          isColumnRead
            ? 'flex-1 min-h-0 overflow-y-auto pr-1 flex flex-col gap-2'
            : 'flex flex-col gap-2'
        }
      >
        {readableEntries.length === 0 && mode === 'read' ? (
          <span className="text-xs text-[#6B7280] italic py-1.5">{emptyText}</span>
        ) : mode === 'read' ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
            {readableEntries.map(([k, v]) => {
              const displayVal = Array.isArray(v)
                ? v.join(', ')
                : isPlainRecord(v)
                  ? JSON.stringify(v)
                  : String(v ?? '');
              const progressPct = extractProgressPercent(v);

              return (
                <div
                  key={k}
                  className="rounded-md px-2.5 py-2 border flex flex-col gap-1 min-w-0"
                  style={{
                    backgroundColor: tileBg,
                    borderColor: tileBorder,
                  }}
                >
                  <div className="flex items-baseline justify-between gap-2 min-w-0">
                    <span className="text-[11px] text-[#9CA3AF] truncate">{k}</span>
                    <span className="text-xs font-semibold text-[#F3F4F6] shrink-0">
                      {displayVal || '—'}
                    </span>
                  </div>

                  {progressPct !== null && (
                    <div className="w-full h-1.5 rounded-full bg-[#111111] overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all duration-300"
                        style={{
                          width: `${progressPct}%`,
                          backgroundColor: color,
                        }}
                      />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <div className="flex flex-col gap-1.5">
            {entries.map(([k, v], idx) => (
              <div key={idx} className="grid grid-cols-[1fr_1fr_auto] gap-1.5 items-center">
                <input
                  type="text"
                  value={k}
                  onChange={(e) => handleRenameKey(idx, e.target.value)}
                  placeholder="Параметр"
                  className="min-w-0 bg-[#121212] border border-[#2D2D2D] focus:border-[#7E0018] rounded px-2 py-1 text-xs text-[#D1D5DB] outline-none transition-colors"
                />
                <input
                  type="text"
                  value={String(v ?? '')}
                  onChange={(e) => handleUpdateValue(idx, e.target.value, typeof v === 'number')}
                  placeholder="Значення"
                  className="min-w-0 bg-[#121212] border border-[#2D2D2D] focus:border-[#7E0018] rounded px-2 py-1 text-xs text-white outline-none transition-colors"
                />
                <button
                  type="button"
                  onClick={() => handleRemoveEntry(idx)}
                  title="Видалити параметр"
                  className="w-6 h-6 rounded flex items-center justify-center text-[#6B7280] hover:text-[#EF4444] hover:bg-[#2A1418] transition-colors cursor-pointer"
                >
                  <X size={12} />
                </button>
              </div>
            ))}

            <div className="grid grid-cols-[1fr_1fr_auto] gap-1.5 items-center pt-1">
              <input
                type="text"
                value={newKey}
                onChange={(e) => setNewKey(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleAddEntry();
                  }
                }}
                placeholder="Новий ключ..."
                className="min-w-0 bg-[#121212] border border-[#2A2A2A] focus:border-[#7E0018] rounded px-2 py-1 text-xs text-[#E5E7EB] outline-none transition-colors"
              />
              <input
                type="text"
                value={newVal}
                onChange={(e) => setNewVal(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleAddEntry();
                  }
                }}
                placeholder="Значення..."
                className="min-w-0 bg-[#121212] border border-[#2A2A2A] focus:border-[#7E0018] rounded px-2 py-1 text-xs text-[#E5E7EB] outline-none transition-colors"
              />
              <button
                type="button"
                onClick={handleAddEntry}
                disabled={!newKey.trim()}
                title="Додати параметр"
                className="h-7 px-2 rounded bg-[#1E1E1E] border border-[#333333] text-[#E5E7EB] text-[11px] font-medium flex items-center gap-1 transition-all duration-150 enabled:hover:bg-[#2A2A2A] enabled:hover:border-[#444444] enabled:active:scale-[0.98] enabled:cursor-pointer disabled:opacity-40 disabled:cursor-default"
              >
                <Plus size={11} />
                <span>Додати</span>
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
