import React, { useLayoutEffect, useRef } from 'react';
import { Textarea } from '../ui/Input';
import { SectionShell } from './SectionShell';
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

  useLayoutEffect(() => {
    const el = textareaRef.current;
    if (!el || mode !== 'edit') return;
    el.style.height = 'auto';
    el.style.height = `${Math.max(el.scrollHeight, 68)}px`;
  }, [textValue, mode]);

  return (
    <SectionShell
      title={title}
      icon={icon}
      color={color}
      mode={mode}
      variant={variant}
      headerClassName="mb-1.5"
    >
      {mode === 'read' ? (
        <div className="bg-bg-deep border border-border-subtle rounded-md p-2.5 text-text-secondary text-xs leading-relaxed whitespace-pre-wrap break-words">
          {textValue.trim() ? (
            textValue
          ) : (
            <span className="text-text-dim italic">{emptyText}</span>
          )}
        </div>
      ) : (
        <Textarea
          ref={textareaRef}
          variant="compact"
          rows={3}
          value={textValue}
          onChange={(e) => onChange?.(e.target.value)}
          placeholder="Введіть текст..."
          className="resize-none overflow-hidden"
        />
      )}
    </SectionShell>
  );
};
