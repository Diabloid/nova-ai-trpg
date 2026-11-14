import React, { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';

export type ContextMenuItem =
  | {
      type: 'separator';
    }
  | {
      type?: 'item';
      label: string;
      shortcut?: string;
      icon?: React.ReactNode;
      disabled?: boolean;
      danger?: boolean;
      onClick: () => void;
    };

interface ContextMenuProps {
  isOpen: boolean;
  x: number;
  y: number;
  items: ContextMenuItem[];
  onClose: () => void;
}

/**
 * Стилізоване темне контекстне меню ПКМ (1-в-1 із Avalonia: фон #161616, рамка #262626).
 */
export const ContextMenu: React.FC<ContextMenuProps> = ({
  isOpen,
  x,
  y,
  items,
  onClose,
}) => {
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;

    const handlePointerDown = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    const handleDismiss = () => onClose();

    window.addEventListener('mousedown', handlePointerDown, true);
    window.addEventListener('keydown', handleKeyDown, true);
    window.addEventListener('blur', handleDismiss);
    window.addEventListener('scroll', handleDismiss, true);

    return () => {
      window.removeEventListener('mousedown', handlePointerDown, true);
      window.removeEventListener('keydown', handleKeyDown, true);
      window.removeEventListener('blur', handleDismiss);
      window.removeEventListener('scroll', handleDismiss, true);
    };
  }, [isOpen, onClose]);

  if (!isOpen || typeof document === 'undefined') return null;

  // Захист від виходу за межі екрана
  const estimatedWidth = 220;
  const estimatedHeight = items.length * 32 + 12;
  const clampedX = Math.max(8, Math.min(x, window.innerWidth - estimatedWidth - 8));
  const clampedY = Math.max(8, Math.min(y, window.innerHeight - estimatedHeight - 8));

  return createPortal(
    <div
      ref={menuRef}
      style={{ left: clampedX, top: clampedY }}
      onContextMenu={(e) => e.preventDefault()}
      className="fixed z-[100] min-w-[185px] bg-[#161616] border border-[#262626] rounded-[8px] p-1 shadow-2xl select-none animate-fade-in"
    >
      {items.map((item, idx) => {
        if (item.type === 'separator') {
          return <div key={`sep-${idx}`} className="h-[1px] bg-[#262626] my-1 mx-1" />;
        }

        return (
          <button
            key={item.label}
            type="button"
            disabled={item.disabled}
            onMouseDown={(e) => {
              // Зберігаємо фокус і виділення у текстовому полі до виконання дії
              e.preventDefault();
            }}
            onClick={() => {
              if (item.disabled) return;
              item.onClick();
              onClose();
            }}
            className={`w-full flex items-center justify-between gap-3 px-2.5 py-1.5 rounded-[5px] text-xs transition-colors text-left ${
              item.disabled
                ? 'opacity-40 cursor-not-allowed'
                : item.danger
                ? 'text-[#FCA5A5] hover:bg-[#2A1418] hover:text-white cursor-pointer'
                : 'text-[#E5E7EB] hover:bg-[#242424] hover:text-white cursor-pointer'
            }`}
          >
            <span className="flex items-center gap-2 min-w-0">
              {item.icon && <span className="text-[#9CA3AF] shrink-0">{item.icon}</span>}
              <span className="truncate">{item.label}</span>
            </span>
            {item.shortcut && (
              <span className="text-[11px] text-[#6B7280] font-mono shrink-0 ml-2">
                {item.shortcut}
              </span>
            )}
          </button>
        );
      })}
    </div>,
    document.body
  );
};
