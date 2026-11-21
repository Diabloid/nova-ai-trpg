import React from 'react';
import { twMerge } from 'tailwind-merge';
import { DynamicLucideIcon } from './DynamicLucideIcon';
import type { DynamicSectionMode, DynamicSectionVariant } from './types';

interface SectionShellProps {
  title: string;
  icon: string;
  color: string;
  mode: DynamicSectionMode;
  variant?: DynamicSectionVariant;
  headerRight?: React.ReactNode;
  headerClassName?: string;
  scrollableBody?: boolean;
  bodyClassName?: string;
  children: React.ReactNode;
}

/**
 * Спільна обгортка секції динамічної анкети: контейнер, кольорова шапка з іконкою та опціональний скрол тіла.
 */
export const SectionShell: React.FC<SectionShellProps> = ({
  title,
  icon,
  color,
  mode,
  variant = 'column',
  headerRight,
  headerClassName,
  scrollableBody = false,
  bodyClassName,
  children,
}) => {
  const isColumnRead = mode === 'read' && variant === 'column';

  const containerClasses = isColumnRead
    ? 'bg-bg-surface border border-border-strong rounded-lg p-3 flex flex-col h-full max-h-[340px]'
    : 'bg-bg-panel border border-border-default rounded-lg p-3 flex flex-col gap-2';

  const resolvedBodyClass = scrollableBody
    ? isColumnRead
      ? 'flex-1 min-h-0 overflow-y-auto pr-1 flex flex-col gap-2'
      : 'flex flex-col gap-2'
    : bodyClassName;

  return (
    <div className={containerClasses}>
      <div
        className={twMerge(
          'text-xs font-bold tracking-[0.5px] pb-2 border-b border-border-default mb-2 flex items-center justify-between gap-2 shrink-0',
          headerClassName
        )}
        style={{ color }}
      >
        <div className="flex items-center gap-1.5 min-w-0">
          <DynamicLucideIcon icon={icon} size={13} className="shrink-0" />
          <span className="truncate uppercase">{title}</span>
        </div>
        {headerRight}
      </div>

      {resolvedBodyClass ? <div className={resolvedBodyClass}>{children}</div> : children}
    </div>
  );
};
