import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, Search } from 'lucide-react';
import { CANONICAL_LUCIDE_ICON_KEYS, normalizeLucideIconKey } from '../../utils/lucideIconMap';
import { DynamicLucideIcon } from '../dynamic-sheet';
import { COMPACT_FIELD_CLASS } from '../ui/Input';

interface IconPickerProps {
  value?: string;
  onChange: (iconKey: string) => void;
  accentColor?: string;
  label?: string;
  compact?: boolean;
  disabled?: boolean;
  className?: string;
}

/**
 * Компактний пошуковий поповер вибору векторної іконки `lucide-react` із `LUCIDE_ICON_MAP`.
 */
export const IconPicker: React.FC<IconPickerProps> = ({
  value = 'box',
  onChange,
  accentColor,
  label,
  compact = false,
  disabled = false,
  className = '',
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [menuPos, setMenuPos] = useState<{ left: number; top: number }>({ left: 0, top: 0 });

  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const normalizedValue = normalizeLucideIconKey(value, 'box');

  const filteredKeys = useMemo(() => {
    const q = search.trim().toLowerCase().replace(/[_\s]+/g, '-');
    if (!q) return CANONICAL_LUCIDE_ICON_KEYS;
    return CANONICAL_LUCIDE_ICON_KEYS.filter((key) => key.includes(q));
  }, [search]);

  const updatePosition = useCallback(() => {
    const trigger = triggerRef.current;
    if (!trigger) return;
    const rect = trigger.getBoundingClientRect();
    const popoverWidth = 264;
    const popoverHeight = 260;
    const spaceBelow = window.innerHeight - rect.bottom;
    const openUpwards = spaceBelow < popoverHeight && rect.top > spaceBelow;
    const clampedLeft = Math.max(8, Math.min(rect.left, window.innerWidth - popoverWidth - 8));
    const clampedTop = openUpwards
      ? Math.max(8, rect.top - popoverHeight - 4)
      : Math.min(rect.bottom + 4, window.innerHeight - popoverHeight - 8);

    setMenuPos({ left: clampedLeft, top: clampedTop });
  }, []);

  useLayoutEffect(() => {
    if (!isOpen) return;
    updatePosition();
    const rafId = requestAnimationFrame(() => searchInputRef.current?.focus());
    return () => cancelAnimationFrame(rafId);
  }, [isOpen, updatePosition]);

  useEffect(() => {
    if (!isOpen) return;

    const handlePointerDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        triggerRef.current?.contains(target) ||
        popoverRef.current?.contains(target)
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
      if (popoverRef.current?.contains(e.target as Node)) return;
      setIsOpen(false);
    };

    const handleResize = () => updatePosition();
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
  }, [isOpen, updatePosition]);

  const isMenuOpen = isOpen && !disabled;

  return (
    <div className={`relative ${compact ? 'inline-block' : 'w-full'} ${className}`}>
      <button
        ref={triggerRef}
        type="button"
        disabled={disabled}
        aria-haspopup="dialog"
        aria-expanded={isMenuOpen}
        onClick={() => {
          if (disabled) return;
          setSearch('');
          setIsOpen((prev) => !prev);
        }}
        className={`h-[34px] px-2.5 rounded-[8px] border flex items-center justify-between gap-2 transition-all duration-150 select-none outline-none ${
          compact ? '' : 'w-full'
        } ${
          isMenuOpen
            ? 'bg-[#1A1A1A] border-[#7E0018]/70'
            : 'bg-[#161616] border-[#2A2A2A]'
        } enabled:hover:bg-[#1E1E1E] enabled:hover:border-[#3E3E3E] enabled:active:bg-[#141414] enabled:active:scale-[0.985] enabled:cursor-pointer disabled:opacity-50 disabled:cursor-default`}
      >
        <div className="flex items-center gap-2 min-w-0">
          <DynamicLucideIcon
            icon={normalizedValue}
            size={14}
            className="shrink-0"
            style={accentColor ? { color: accentColor } : { color: '#E5E7EB' }}
          />
          <span className="text-xs font-medium text-[#E5E7EB] truncate">
            {label ?? normalizedValue}
          </span>
        </div>
        <ChevronDown
          size={14}
          className={`shrink-0 transition-transform duration-150 ${
            isMenuOpen ? 'rotate-180 text-[#E5E7EB]' : 'rotate-0 text-[#9CA3AF]'
          }`}
        />
      </button>

      {isMenuOpen &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            ref={popoverRef}
            style={{ left: menuPos.left, top: menuPos.top, width: 264 }}
            className="fixed z-[120] bg-[#161616] border border-[#262626] rounded-[8px] p-2 shadow-2xl animate-fade-in select-none flex flex-col gap-2"
          >
            <div className="relative flex items-center">
              <Search size={12} className="absolute left-2.5 text-[#6B7280] pointer-events-none" />
              <input
                ref={searchInputRef}
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Пошук іконки..."
                className={`w-full pl-7 pr-2.5 py-1 text-xs ${COMPACT_FIELD_CLASS}`}
              />
            </div>

            <div className="grid grid-cols-6 gap-1 max-h-[196px] overflow-y-auto pr-0.5">
              {filteredKeys.length === 0 ? (
                <div className="col-span-6 text-[11px] text-[#6B7280] italic py-3 text-center">
                  Іконок не знайдено
                </div>
              ) : (
                filteredKeys.map((iconKey) => {
                  const isSelected = iconKey === normalizedValue;
                  return (
                    <button
                      key={iconKey}
                      type="button"
                      data-tooltip={iconKey}
                      onClick={() => {
                        onChange(iconKey);
                        setIsOpen(false);
                      }}
                      className={`h-9 rounded-[6px] flex items-center justify-center border transition-all duration-150 enabled:cursor-pointer ${
                        isSelected
                          ? 'bg-[#7E0018]/25 border-[#7E0018]/60 text-white'
                          : 'bg-[#121212] border-transparent text-[#9CA3AF] enabled:hover:bg-[#242424] enabled:hover:text-white'
                      }`}
                    >
                      <DynamicLucideIcon
                        icon={iconKey}
                        size={15}
                        style={isSelected && accentColor ? { color: accentColor } : undefined}
                      />
                    </button>
                  );
                })
              )}
            </div>
          </div>,
          document.body
        )}
    </div>
  );
};
