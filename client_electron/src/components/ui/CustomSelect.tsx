import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, ChevronDown } from 'lucide-react';

export interface CustomSelectOption {
  value: string;
  label: string;
  sublabel?: string;
  icon?: React.ReactNode;
}

export interface CustomSelectActionItem {
  label: string;
  icon?: React.ReactNode;
  onClick: () => void;
}

interface CustomSelectProps {
  value: string;
  options: CustomSelectOption[];
  onChange: (value: string) => void;
  prefixLabel?: string;
  leftIcon?: React.ReactNode;
  placeholder?: string;
  disabled?: boolean;
  ariaLabel?: string;
  actionItem?: CustomSelectActionItem;
  className?: string;
}

/**
 * Стилізований темний випадаючий список у стилі ContextMenu / ActiveHeroCard без нативного <select>.
 */
export const CustomSelect: React.FC<CustomSelectProps> = ({
  value,
  options,
  onChange,
  prefixLabel,
  leftIcon,
  placeholder = 'Оберіть значення...',
  disabled = false,
  ariaLabel,
  actionItem,
  className = '',
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [menuPos, setMenuPos] = useState<{
    left: number;
    top: number;
    width: number;
    openUpwards: boolean;
  }>({ left: 0, top: 0, width: 220, openUpwards: false });

  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const selectedOption = options.find((opt) => opt.value === value);

  const updateMenuPosition = useCallback(() => {
    const trigger = triggerRef.current;
    if (!trigger) return;
    const rect = trigger.getBoundingClientRect();
    const menuMaxHeight = 280;
    const spaceBelow = window.innerHeight - rect.bottom;
    const openUpwards = spaceBelow < 180 && rect.top > spaceBelow;
    const width = Math.max(rect.width, 220);
    const clampedLeft = Math.max(8, Math.min(rect.left, window.innerWidth - width - 8));

    setMenuPos({
      left: clampedLeft,
      top: openUpwards
        ? Math.max(8, rect.top - Math.min(menuMaxHeight, options.length * 36 + 52) - 4)
        : rect.bottom + 4,
      width,
      openUpwards,
    });
  }, [options.length]);

  useLayoutEffect(() => {
    if (!isOpen) return;
    updateMenuPosition();
  }, [isOpen, updateMenuPosition]);

  useEffect(() => {
    if (!isOpen) return;

    const handlePointerDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        triggerRef.current?.contains(target) ||
        menuRef.current?.contains(target)
      ) {
        return;
      }
      setIsOpen(false);
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        setIsOpen(false);
      }
    };

    const handleScroll = (e: Event) => {
      if (menuRef.current && menuRef.current.contains(e.target as Node)) {
        return;
      }
      setIsOpen(false);
    };

    const handleResize = () => updateMenuPosition();
    const handleBlur = () => setIsOpen(false);

    window.addEventListener('mousedown', handlePointerDown, true);
    window.addEventListener('keydown', handleKeyDown, true);
    window.addEventListener('scroll', handleScroll, true);
    window.addEventListener('resize', handleResize);
    window.addEventListener('blur', handleBlur);

    return () => {
      window.removeEventListener('mousedown', handlePointerDown, true);
      window.removeEventListener('keydown', handleKeyDown, true);
      window.removeEventListener('scroll', handleScroll, true);
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('blur', handleBlur);
    };
  }, [isOpen, updateMenuPosition]);

  const isMenuOpen = isOpen && !disabled;

  return (
    <div className={`relative w-full ${className}`}>
      <button
        ref={triggerRef}
        type="button"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={isMenuOpen}
        aria-label={ariaLabel}
        onClick={() => {
          if (disabled) return;
          setIsOpen((prev) => !prev);
        }}
        className={`w-full h-[34px] px-2.5 rounded-[8px] border flex items-center justify-between gap-2 text-left transition-all duration-150 select-none outline-none ${
          isMenuOpen
            ? 'bg-bg-inset border-accent-ruby/70'
            : 'bg-bg-panel border-border-strong'
        } enabled:hover:bg-bg-control enabled:hover:border-border-hover enabled:active:bg-bg-card enabled:active:scale-[0.985] enabled:cursor-pointer disabled:opacity-50 disabled:cursor-default`}
      >
        <div className="flex items-center gap-2 min-w-0 flex-1">
          {leftIcon && <span className="shrink-0 flex items-center">{leftIcon}</span>}
          {prefixLabel && (
            <span className="text-xs font-medium text-text-muted shrink-0">
              {prefixLabel}
            </span>
          )}
          <span className="text-xs font-medium text-text-primary truncate">
            {selectedOption
              ? selectedOption.sublabel
                ? `${selectedOption.label} (${selectedOption.sublabel})`
                : selectedOption.label
              : placeholder}
          </span>
        </div>

        <ChevronDown
          size={14}
          className={`shrink-0 transition-transform duration-150 ${
            isMenuOpen ? 'rotate-180 text-text-primary' : 'rotate-0 text-text-muted'
          }`}
        />
      </button>

      {isMenuOpen &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            ref={menuRef}
            role="listbox"
            style={{
              left: menuPos.left,
              top: menuPos.top,
              width: menuPos.width,
            }}
            className="fixed z-[110] bg-bg-panel border border-border-default rounded-[8px] p-1 shadow-2xl animate-fade-in max-h-[280px] overflow-y-auto select-none"
          >
            {options.map((opt) => {
              const isSelected = opt.value === value;
              return (
                <button
                  key={opt.value}
                  type="button"
                  role="option"
                  aria-selected={isSelected}
                  onClick={() => {
                    setIsOpen(false);
                    if (opt.value !== value) {
                      onChange(opt.value);
                    }
                  }}
                  className={`w-full flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-[5px] text-left text-xs transition-colors cursor-pointer ${
                    isSelected
                      ? 'bg-accent-ruby/25 border border-accent-ruby/50 text-white font-semibold'
                      : 'border border-transparent text-text-primary hover:bg-bg-hover hover:text-white'
                  }`}
                >
                  <div className="flex items-center gap-2 min-w-0 flex-1">
                    {opt.icon && <span className="shrink-0 flex items-center">{opt.icon}</span>}
                    <span className="truncate">{opt.label}</span>
                    {opt.sublabel && (
                      <span
                        className={`text-[11px] truncate shrink-0 ${
                          isSelected ? 'text-text-secondary' : 'text-text-muted'
                        }`}
                      >
                        ({opt.sublabel})
                      </span>
                    )}
                  </div>
                  {isSelected && <Check size={12} className="text-danger-soft shrink-0" />}
                </button>
              );
            })}

            {actionItem && (
              <>
                <div className="h-[1px] bg-border-default my-1 mx-1" />
                <button
                  type="button"
                  onClick={() => {
                    setIsOpen(false);
                    actionItem.onClick();
                  }}
                  className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-[5px] text-left text-xs text-text-primary hover:bg-bg-hover hover:text-white transition-colors cursor-pointer"
                >
                  {actionItem.icon && (
                    <span className="shrink-0 flex items-center text-accent-violet">
                      {actionItem.icon}
                    </span>
                  )}
                  <span className="truncate">{actionItem.label}</span>
                </button>
              </>
            )}
          </div>,
          document.body
        )}
    </div>
  );
};
