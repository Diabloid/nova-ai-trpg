import React, { useLayoutEffect, useRef } from 'react';
import { COMPACT_FIELD_CLASS } from '../ui/Input';
import { DynamicLucideIcon } from './DynamicLucideIcon';
import type { DynamicSectionProps } from './types';

function toDisplayString(val: unknown): string {
  if (val === null || val === undefined) return '';
  if (Array.isArray(val)) return val.join(', ');
  if (typeof val === 'object') return JSON.stringify(val, null, 2);
  return String(val);
}

export const LongTextSection: React.FC<DynamicSectionProps<string | number | string[]>> = ({
  title,
  icon = 'scroll-text',
  color = '#9CA3AF',
  value,
  mode,
  variant = 'compact',
  emptyText = 'Опис відсутній',
  onChange,
}) => {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const textValue = toDisplayString(value);
  const isColumnRead = mode === 'read' && variant === 'column';

  useLayoutEffect(() => {
    const el = textareaRef.current;
    if (!el || mode !== 'edit') return;
    el.style.height = 'auto';
    el.style.height = `${Math.max(el.scrollHeight, 68)}px`;
  }, [textValue, mode]);

  const containerClasses = isColumnRead
    ? 'bg-[#1C1C1C] border border-[#2A2A2A] rounded-lg p-3 flex flex-col h-full max-h-[340px]'
    : 'bg-[#161616] border border-[#262626] rounded-lg p-3 flex flex-col gap-2';

  return (
    <div className={containerClasses}>
      <div
        className="text-xs font-bold tracking-[0.5px] pb-2 border-b border-[#262626] mb-1.5 flex items-center gap-1.5 shrink-0"
        style={{ color }}
      >
        <DynamicLucideIcon icon={icon} size={13} className="shrink-0" />
        <span className="truncate uppercase">{title}</span>
      </div>

      {mode === 'read' ? (
        <div className="bg-[#111111] border border-[#222222] rounded-md p-2.5 text-[#D1D5DB] text-xs leading-relaxed whitespace-pre-wrap break-words">
          {textValue.trim() ? (
            textValue
          ) : (
            <span className="text-[#6B7280] italic">{emptyText}</span>
          )}
        </div>
      ) : (
        <textarea
          ref={textareaRef}
          rows={3}
          value={textValue}
          onChange={(e) => onChange?.(e.target.value)}
          placeholder="Введіть текст..."
          className={`w-full p-2.5 text-xs leading-relaxed resize-none overflow-hidden ${COMPACT_FIELD_CLASS}`}
        />
      )}
    </div>
  );
};
