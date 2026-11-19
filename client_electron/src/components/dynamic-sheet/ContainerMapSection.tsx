import React, { useState } from 'react';
import { ChevronDown, Plus, Trash2, X } from 'lucide-react';
import { isTechnicalFieldKey, localizeFieldKey } from '../../utils/characterBlockStyles';
import { hexToRgba } from '../../utils/lucideIconMap';
import { COMPACT_FIELD_CLASS } from '../ui/Input';
import { DynamicLucideIcon } from './DynamicLucideIcon';
import type { DynamicSectionProps } from './types';

function isPlainRecord(val: unknown): val is Record<string, any> {
  return typeof val === 'object' && val !== null && !Array.isArray(val);
}

function getItemParts(item: unknown) {
  if (typeof item === 'string' || typeof item === 'number') {
    return {
      isRecord: false,
      nameKey: null,
      descKey: null,
      name: String(item),
      desc: '',
      extraEntries: [] as Array<[string, any]>,
    };
  }
  if (!isPlainRecord(item)) {
    return {
      isRecord: false,
      nameKey: null,
      descKey: null,
      name: String(item ?? ''),
      desc: '',
      extraEntries: [] as Array<[string, any]>,
    };
  }

  const nameKey =
    (['name', 'title', 'label'] as const).find((k) => k in item) ??
    Object.keys(item).find((k) => !isTechnicalFieldKey(k)) ??
    'name';
  const descKey =
    (['desc', 'description', 'notes'] as const).find((k) => k !== nameKey && k in item) ?? null;

  const extraEntries = Object.entries(item).filter(
    ([k, v]) =>
      k !== nameKey &&
      k !== descKey &&
      !isTechnicalFieldKey(k) &&
      v !== undefined &&
      v !== null &&
      String(v).trim() !== ''
  );

  return {
    isRecord: true,
    nameKey,
    descKey,
    name: String(item[nameKey] ?? ''),
    desc: descKey ? String(item[descKey] ?? '') : '',
    extraEntries,
  };
}

export const ContainerMapSection: React.FC<
  DynamicSectionProps<Record<string, any[]>>
> = ({
  title,
  icon = 'backpack',
  color = '#34D399',
  value,
  mode,
  variant = 'column',
  emptyText = 'Контейнери порожні',
  fieldLabels,
  onChange,
}) => {
  const containers = isPlainRecord(value) ? value : {};
  const containerNames = Object.keys(containers);
  const [expandedMap, setExpandedMap] = useState<Record<string, boolean>>({});
  const [newContainerName, setNewContainerName] = useState('');

  const isColumnRead = mode === 'read' && variant === 'column';

  const containerClasses = isColumnRead
    ? 'bg-[#1C1C1C] border border-[#2A2A2A] rounded-lg p-3 flex flex-col h-full max-h-[340px]'
    : 'bg-[#161616] border border-[#262626] rounded-lg p-3 flex flex-col gap-2';

  const badgeBg = hexToRgba(color, 0.14);
  const badgeBorder = hexToRgba(color, 0.34);
  const itemBg = hexToRgba(color, 0.07);
  const itemBorder = hexToRgba(color, 0.24);

  const toggleContainer = (name: string) => {
    setExpandedMap((prev) => ({ ...prev, [name]: !(prev[name] ?? true) }));
  };

  const handleAddContainer = () => {
    if (!onChange) return;
    const trimmed = newContainerName.trim();
    if (!trimmed || trimmed in containers) return;
    onChange({ ...containers, [trimmed]: [] });
    setExpandedMap((prev) => ({ ...prev, [trimmed]: true }));
    setNewContainerName('');
  };

  const handleRemoveContainer = (cName: string) => {
    if (!onChange) return;
    const next = { ...containers };
    delete next[cName];
    onChange(next);
  };

  const handleAddItem = (cName: string) => {
    if (!onChange) return;
    const currentItems = Array.isArray(containers[cName]) ? containers[cName] : [];
    onChange({
      ...containers,
      [cName]: [...currentItems, { name: '', desc: '' }],
    });
    setExpandedMap((prev) => ({ ...prev, [cName]: true }));
  };

  const handleRemoveItem = (cName: string, idx: number) => {
    if (!onChange) return;
    const currentItems = Array.isArray(containers[cName]) ? containers[cName] : [];
    onChange({
      ...containers,
      [cName]: currentItems.filter((_, i) => i !== idx),
    });
  };

  const handleUpdateItem = (
    cName: string,
    idx: number,
    fieldKey: string | null,
    nextVal: string
  ) => {
    if (!onChange) return;
    const currentItems = Array.isArray(containers[cName]) ? containers[cName] : [];
    onChange({
      ...containers,
      [cName]: currentItems.map((item, i) => {
        if (i !== idx) return item;
        if (fieldKey === null || !isPlainRecord(item)) {
          return nextVal;
        }
        return { ...item, [fieldKey]: nextVal };
      }),
    });
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

      <div
        className={
          isColumnRead
            ? 'flex-1 min-h-0 overflow-y-auto pr-1 flex flex-col gap-2'
            : 'flex flex-col gap-2'
        }
      >
        {containerNames.length === 0 ? (
          <span className="text-xs text-[#6B7280] italic py-1.5">{emptyText}</span>
        ) : (
          containerNames.map((cName) => {
            const items = Array.isArray(containers[cName]) ? containers[cName] : [];
            const isExpanded = expandedMap[cName] ?? true;

            return (
              <div
                key={cName}
                className="shrink-0 bg-[#141414] border border-[#252525] rounded-md overflow-hidden transition-all duration-150"
              >
                {/* Заголовок контейнера */}
                <div className="flex items-center justify-between gap-1 pr-1.5">
                  <button
                    type="button"
                    onClick={() => toggleContainer(cName)}
                    className="flex-1 flex items-center justify-between p-2 text-left bg-transparent hover:bg-[#1A1A1A] transition-colors cursor-pointer min-w-0"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <span
                        className="text-xs font-semibold truncate"
                        style={{ color: color === '#34D399' ? '#6EE7B7' : '#F3F4F6' }}
                      >
                        {cName}
                      </span>
                      <span
                        className="text-[10px] font-semibold px-1.5 py-0.2 rounded border shrink-0"
                        style={{
                          backgroundColor: badgeBg,
                          borderColor: badgeBorder,
                          color: color === '#34D399' ? '#A7F3D0' : '#E5E7EB',
                        }}
                      >
                        {items.length}
                      </span>
                    </div>
                    <ChevronDown
                      size={13}
                      style={{ color }}
                      className={`transition-transform duration-200 shrink-0 ml-1 ${
                        isExpanded ? 'rotate-180' : 'rotate-0'
                      }`}
                    />
                  </button>

                  {mode === 'edit' && (
                    <button
                      type="button"
                      onClick={() => handleRemoveContainer(cName)}
                      data-tooltip={`Видалити контейнер «${cName}»`}
                      className="w-6 h-6 rounded flex items-center justify-center text-[#6B7280] hover:text-[#EF4444] hover:bg-[#2A1418] transition-colors cursor-pointer shrink-0"
                    >
                      <Trash2 size={12} />
                    </button>
                  )}
                </div>

                {/* Вміст контейнера */}
                {isExpanded && (
                  <div
                    className="p-2 border-t flex flex-col gap-1.5 animate-fade-in"
                    style={{
                      borderColor: badgeBorder,
                      backgroundColor: '#0E1211',
                    }}
                  >
                    {items.length === 0 ? (
                      <span className="text-[11px] text-[#6B7280] italic">Порожньо</span>
                    ) : mode === 'read' ? (
                      items.map((item, idx) => {
                        const parts = getItemParts(item);
                        return (
                          <div
                            key={idx}
                            data-tooltip={parts.desc || parts.name}
                            className="rounded p-1.5 flex flex-col gap-0.5 border"
                            style={{
                              backgroundColor: itemBg,
                              borderColor: itemBorder,
                            }}
                          >
                            <span className="text-[11px] font-semibold text-[#E5E7EB]">
                              • {parts.name || 'Предмет'}
                            </span>
                            {parts.desc && (
                              <span className="text-[10px] text-[#9CA3AF] leading-tight pl-2">
                                {parts.desc}
                              </span>
                            )}
                            {parts.extraEntries.length > 0 && (
                              <div className="flex flex-wrap gap-1 pl-2 pt-0.5">
                                {parts.extraEntries.map(([eKey, eVal]) => (
                                  <span key={eKey} className="text-[10px] text-[#9CA3AF]">
                                    {localizeFieldKey(eKey, fieldLabels)}:{' '}
                                    <strong className="text-[#E5E7EB]">{String(eVal)}</strong>
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
                        const entries = isRecord
                          ? Object.entries(item)
                          : [['name', String(item ?? '')]];

                        return (
                          <div
                            key={idx}
                            className="bg-[#131716] border border-[#252B29] rounded p-2 flex flex-col gap-1.5"
                          >
                            <div className="flex items-center justify-between gap-2">
                              <span className="text-[10px] text-[#6B7280]">Предмет #{idx + 1}</span>
                              <button
                                type="button"
                                onClick={() => handleRemoveItem(cName, idx)}
                                aria-label="Видалити предмет"
                                className="w-5 h-5 rounded flex items-center justify-center text-[#6B7280] enabled:hover:text-[#EF4444] enabled:hover:bg-[#2A1418] transition-colors enabled:cursor-pointer"
                              >
                                <X size={11} />
                              </button>
                            </div>
                            {entries.map(([fKey, fVal]) => (
                              <input
                                key={fKey}
                                type="text"
                                value={String(fVal ?? '')}
                                onChange={(e) =>
                                  handleUpdateItem(cName, idx, isRecord ? fKey : null, e.target.value)
                                }
                                placeholder={fKey === 'desc' ? 'Опис предмета...' : 'Назва предмета...'}
                                className={`w-full px-2 py-1 text-[11px] ${COMPACT_FIELD_CLASS}`}
                              />
                            ))}
                          </div>
                        );
                      })
                    )}

                    {mode === 'edit' && (
                      <button
                        type="button"
                        onClick={() => handleAddItem(cName)}
                        className="mt-0.5 self-start text-[11px] font-medium text-[#D1D5DB] hover:text-white bg-[#1A1A1A] hover:bg-[#242424] border border-[#2F2F2F] rounded px-2 py-1 flex items-center gap-1 transition-colors cursor-pointer"
                      >
                        <Plus size={11} />
                        <span>Додати предмет</span>
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })
        )}

        {mode === 'edit' && (
          <div className="flex items-center gap-1.5 pt-1">
            <input
              type="text"
              value={newContainerName}
              onChange={(e) => setNewContainerName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  handleAddContainer();
                }
              }}
              placeholder="Назва нового контейнера..."
              className={`flex-1 min-w-0 px-2 py-1 text-xs ${COMPACT_FIELD_CLASS}`}
            />
            <button
              type="button"
              onClick={handleAddContainer}
              disabled={!newContainerName.trim()}
              className="text-[11px] font-semibold px-2.5 py-1 rounded bg-[#1E1E1E] border border-[#333333] text-[#E5E7EB] flex items-center gap-1 transition-all duration-150 shrink-0 enabled:hover:bg-[#2A2A2A] enabled:hover:border-[#444444] enabled:active:scale-[0.98] enabled:cursor-pointer disabled:opacity-40 disabled:cursor-default"
            >
              <Plus size={11} />
              <span>Додати контейнер</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
