import React, { useState } from 'react';
import { Plus, X } from 'lucide-react';
import {
  containsCyrillic,
  isFieldKeyResolvedLocally,
  isTechnicalFieldKey,
  localizeFieldKey,
  normalizeFieldKey,
} from '../../utils/characterBlockStyles';
import { Input } from '../ui/Input';
import { SectionShell } from './SectionShell';
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
  fieldLabels,
  onChange,
  onFieldLabelChange,
  onTranslateKeys,
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
    if (!isFieldKeyResolvedLocally(key, fieldLabels)) {
      onTranslateKeys?.([key]);
    }
    setNewKey('');
    setNewVal('');
  };

  return (
    <SectionShell
      title={title}
      icon={icon}
      color={color}
      mode={mode}
      variant={variant}
      scrollableBody
    >
      {readableEntries.length === 0 && mode === 'read' ? (
          <span className="text-xs text-text-dim italic py-1.5">{emptyText}</span>
        ) : mode === 'read' ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
            {readableEntries.map(([k, v]) => {
              const displayLabel = localizeFieldKey(k, fieldLabels);
              const displayVal = Array.isArray(v)
                ? v.join(', ')
                : isPlainRecord(v)
                  ? JSON.stringify(v)
                  : String(v ?? '');
              const progressPct = extractProgressPercent(v);
              const isLongPair =
                displayVal.length > 18 || displayLabel.length + displayVal.length > 26;
              const isVeryLongValue = displayVal.length > 40;

              return (
                <div
                  key={k}
                  className={`rounded-md px-2.5 py-2 bg-bg-app border border-border-default flex flex-col gap-1 min-w-0 ${
                    isVeryLongValue ? 'sm:col-span-2' : ''
                  }`}
                >
                  {isLongPair ? (
                    <div className="flex flex-col gap-0.5 min-w-0">
                      <span className="text-[11px] text-text-muted whitespace-normal break-words leading-snug">
                        {displayLabel}
                      </span>
                      <span className="text-xs font-semibold text-text-bright whitespace-normal break-words leading-snug">
                        {displayVal || '—'}
                      </span>
                    </div>
                  ) : (
                    <div className="flex items-baseline justify-between gap-2 min-w-0">
                      <span className="text-[11px] text-text-muted shrink-0">
                        {displayLabel}
                      </span>
                      <span className="text-xs font-semibold text-text-bright text-right whitespace-normal break-words leading-snug">
                        {displayVal || '—'}
                      </span>
                    </div>
                  )}

                  {progressPct !== null && (
                    <div className="w-full h-1.5 rounded-full bg-bg-deep overflow-hidden">
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
            {entries.map(([k, v], idx) => {
              const trimmedKey = k.trim();
              const needsCustomLabelRow =
                Boolean(onFieldLabelChange) &&
                Boolean(trimmedKey) &&
                !isTechnicalFieldKey(trimmedKey) &&
                !containsCyrillic(trimmedKey);
              const customLabelVal =
                fieldLabels?.[k] ?? fieldLabels?.[trimmedKey] ?? fieldLabels?.[normalizeFieldKey(trimmedKey)] ?? '';
              const fallbackLocalized = localizeFieldKey(k, null);

              return (
                <div key={idx} className="flex flex-col gap-1">
                  <div className="grid grid-cols-[1fr_1fr_auto] gap-1.5 items-center">
                    <Input
                      variant="compact"
                      type="text"
                      value={k}
                      onChange={(e) => handleRenameKey(idx, e.target.value)}
                      onBlur={(e) => {
                        const renamed = e.target.value.trim();
                        if (renamed && !isFieldKeyResolvedLocally(renamed, fieldLabels)) {
                          onTranslateKeys?.([renamed]);
                        }
                      }}
                      placeholder="Параметр"
                      className="min-w-0 text-text-secondary"
                    />
                    <Input
                      variant="compact"
                      type="text"
                      value={String(v ?? '')}
                      onChange={(e) => handleUpdateValue(idx, e.target.value, typeof v === 'number')}
                      placeholder="Значення"
                      className="min-w-0 text-white"
                    />
                    <button
                      type="button"
                      onClick={() => handleRemoveEntry(idx)}
                      aria-label="Видалити параметр"
                      className="w-6 h-6 rounded flex items-center justify-center text-text-dim enabled:hover:text-danger enabled:hover:bg-accent-ruby-soft transition-colors enabled:cursor-pointer"
                    >
                      <X size={12} />
                    </button>
                  </div>

                  {needsCustomLabelRow && (
                    <div className="flex items-center gap-1.5 pl-1 pr-7">
                      <span className="text-[10px] text-text-dim shrink-0">
                        Підпис:
                      </span>
                      <Input
                        variant="compact"
                        type="text"
                        value={customLabelVal}
                        onChange={(e) => onFieldLabelChange?.(k, e.target.value)}
                        placeholder={`Авто: ${fallbackLocalized}`}
                        className="w-auto flex-1 min-w-0 py-0.5 text-[11px] text-text-muted focus:text-text-primary"
                      />
                    </div>
                  )}
                </div>
              );
            })}

            <div className="grid grid-cols-[1fr_1fr_auto] gap-1.5 items-center pt-1">
              <Input
                variant="compact"
                type="text"
                value={newKey}
                onChange={(e) => setNewKey(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleAddEntry();
                  }
                }}
                placeholder="Назва параметра (укр., напр. Радіація)..."
                className="min-w-0"
              />
              <Input
                variant="compact"
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
                className="min-w-0"
              />
              <button
                type="button"
                onClick={handleAddEntry}
                disabled={!newKey.trim()}
                data-tooltip="Додати параметр"
                className="h-7 px-2 rounded bg-bg-control border border-border-input text-text-primary text-[11px] font-medium flex items-center gap-1 transition-all duration-150 enabled:hover:bg-bg-active enabled:hover:border-border-focus enabled:active:scale-[0.98] enabled:cursor-pointer disabled:opacity-40 disabled:cursor-default"
              >
                <Plus size={11} />
                <span>Додати</span>
              </button>
            </div>
            <p className="text-[10px] text-text-dim leading-snug">
              Вводьте назву українською (напр. Радіація, Кредити), щоб у шторці одразу відображався читабельний підпис.
            </p>
          </div>
        )}
    </SectionShell>
  );
};
