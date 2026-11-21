import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Pipette } from 'lucide-react';
import { COMPACT_FIELD_CLASS } from './Input';

interface EyeDropperResult {
  sRGBHex: string;
}

interface EyeDropperInstance {
  open: (options?: { signal?: AbortSignal }) => Promise<EyeDropperResult>;
}

type WindowWithEyeDropper = Window & {
  EyeDropper?: new () => EyeDropperInstance;
};

interface RgbColor {
  r: number;
  g: number;
  b: number;
}

interface HsvColor {
  h: number; // 0..360
  s: number; // 0..100
  v: number; // 0..100
}

export interface ColorPickerPopoverProps {
  value: string;
  onChange: (hex: string) => void;
  disabled?: boolean;
  variant?: 'pill' | 'swatch';
  ariaLabel?: string;
  className?: string;
}

const FALLBACK_HEX = '#7E0018';

function clamp(num: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, num));
}

function normalizeHex(raw: string): string | null {
  const cleaned = raw.trim().replace(/^#/, '');
  if (/^[0-9a-fA-F]{3}$/.test(cleaned)) {
    const expanded = cleaned
      .split('')
      .map((ch) => ch + ch)
      .join('');
    return `#${expanded.toUpperCase()}`;
  }
  if (/^[0-9a-fA-F]{6}$/.test(cleaned)) {
    return `#${cleaned.toUpperCase()}`;
  }
  return null;
}

function hexToRgb(hex: string): RgbColor {
  const normalized = normalizeHex(hex) ?? FALLBACK_HEX;
  const int = parseInt(normalized.slice(1), 16);
  return {
    r: (int >> 16) & 255,
    g: (int >> 8) & 255,
    b: int & 255,
  };
}

function rgbToHex({ r, g, b }: RgbColor): string {
  const toHex = (n: number) => clamp(Math.round(n), 0, 255).toString(16).padStart(2, '0');
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`.toUpperCase();
}

function rgbToHsv({ r, g, b }: RgbColor): HsvColor {
  const rn = clamp(r, 0, 255) / 255;
  const gn = clamp(g, 0, 255) / 255;
  const bn = clamp(b, 0, 255) / 255;

  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const delta = max - min;

  let h = 0;
  if (delta > 0) {
    if (max === rn) {
      h = 60 * (((gn - bn) / delta) % 6);
    } else if (max === gn) {
      h = 60 * ((bn - rn) / delta + 2);
    } else {
      h = 60 * ((rn - gn) / delta + 4);
    }
  }
  if (h < 0) h += 360;

  const s = max === 0 ? 0 : (delta / max) * 100;
  const v = max * 100;

  return { h, s, v };
}

function hsvToRgb({ h, s, v }: HsvColor): RgbColor {
  const sn = clamp(s, 0, 100) / 100;
  const vn = clamp(v, 0, 100) / 100;
  const hue = ((h % 360) + 360) % 360;

  const c = vn * sn;
  const x = c * (1 - Math.abs(((hue / 60) % 2) - 1));
  const m = vn - c;

  let rp = 0;
  let gp = 0;
  let bp = 0;

  if (hue < 60) {
    rp = c;
    gp = x;
  } else if (hue < 120) {
    rp = x;
    gp = c;
  } else if (hue < 180) {
    gp = c;
    bp = x;
  } else if (hue < 240) {
    gp = x;
    bp = c;
  } else if (hue < 300) {
    rp = x;
    bp = c;
  } else {
    rp = c;
    bp = x;
  }

  return {
    r: Math.round((rp + m) * 255),
    g: Math.round((gp + m) * 255),
    b: Math.round((bp + m) * 255),
  };
}

function hsvToHex(hsv: HsvColor): string {
  return rgbToHex(hsvToRgb(hsv));
}

/**
 * Фірмовий темний портальний вибір кольору:
 * 2D поле Saturation/Brightness, слайдер Hue, піпетка EyeDropper, поля HEX та R/G/B.
 */
export const ColorPickerPopover: React.FC<ColorPickerPopoverProps> = ({
  value,
  onChange,
  disabled = false,
  variant = 'pill',
  ariaLabel = 'Вибрати довільний колір',
  className = '',
}) => {
  const safeHex = normalizeHex(value) ?? FALLBACK_HEX;

  const [isOpen, setIsOpen] = useState(false);
  const [hsvState, setHsvState] = useState<{ hsv: HsvColor; hex: string }>(() => ({
    hsv: rgbToHsv(hexToRgb(safeHex)),
    hex: safeHex,
  }));
  const [hexEditState, setHexEditState] = useState<{ raw: string; syncedHex: string } | null>(null);
  const [popoverPos, setPopoverPos] = useState<{ left: number; top: number }>({
    left: 0,
    top: 0,
  });

  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const svBoardRef = useRef<HTMLDivElement>(null);
  const hueTrackRef = useRef<HTMLDivElement>(null);
  const isPickingEyeDropperRef = useRef(false);

  const supportsEyeDropper =
    typeof window !== 'undefined' && typeof (window as WindowWithEyeDropper).EyeDropper === 'function';

  // Якщо value змінився ззовні (напр. клік по пресету) — синхронно перебудовуємо HSV без useEffect
  const hsv = hsvState.hex === safeHex ? hsvState.hsv : rgbToHsv(hexToRgb(safeHex));
  const hexInputValue =
    hexEditState && hexEditState.syncedHex === safeHex ? hexEditState.raw : safeHex;

  const updatePosition = useCallback(() => {
    const trigger = triggerRef.current;
    if (!trigger) return;
    const rect = trigger.getBoundingClientRect();
    const popoverWidth = 256;
    const popoverHeight = 294;
    const spaceBelow = window.innerHeight - rect.bottom;
    const openUpwards = spaceBelow < popoverHeight + 12 && rect.top > spaceBelow;
    const clampedLeft = Math.max(
      8,
      Math.min(rect.right - popoverWidth, window.innerWidth - popoverWidth - 8)
    );
    const clampedTop = openUpwards
      ? Math.max(8, rect.top - popoverHeight - 6)
      : Math.min(rect.bottom + 6, window.innerHeight - popoverHeight - 8);

    setPopoverPos({ left: clampedLeft, top: clampedTop });
  }, []);

  useLayoutEffect(() => {
    if (!isOpen) return;
    updatePosition();
  }, [isOpen, updatePosition]);

  useEffect(() => {
    if (!isOpen) return;

    const handlePointerDown = (e: MouseEvent) => {
      if (isPickingEyeDropperRef.current) return;
      const target = e.target as Node;
      if (triggerRef.current?.contains(target) || popoverRef.current?.contains(target)) {
        return;
      }
      setIsOpen(false);
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isPickingEyeDropperRef.current) {
        e.preventDefault();
        e.stopPropagation();
        setIsOpen(false);
      }
    };

    const handleScroll = (e: Event) => {
      if (isPickingEyeDropperRef.current) return;
      if (popoverRef.current?.contains(e.target as Node)) return;
      setIsOpen(false);
    };

    const handleResize = () => updatePosition();
    const handleBlur = () => {
      if (!isPickingEyeDropperRef.current) {
        setIsOpen(false);
      }
    };

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

  const applyHsv = useCallback(
    (nextHsv: HsvColor) => {
      const nextHex = hsvToHex(nextHsv);
      setHsvState({ hsv: nextHsv, hex: nextHex });
      setHexEditState(null);
      if (nextHex !== safeHex) {
        onChange(nextHex);
      }
    },
    [onChange, safeHex]
  );

  const applyRgb = useCallback(
    (nextRgb: RgbColor) => {
      const clamped: RgbColor = {
        r: clamp(Math.round(nextRgb.r), 0, 255),
        g: clamp(Math.round(nextRgb.g), 0, 255),
        b: clamp(Math.round(nextRgb.b), 0, 255),
      };
      const nextHex = rgbToHex(clamped);
      const parsedHsv = rgbToHsv(clamped);
      // Зберігаємо попередній відтінок для ахроматичних (сірих) відтінків
      const preservedHue = parsedHsv.s === 0 ? hsv.h : parsedHsv.h;
      setHsvState({
        hsv: { h: preservedHue, s: parsedHsv.s, v: parsedHsv.v },
        hex: nextHex,
      });
      setHexEditState(null);
      if (nextHex !== safeHex) {
        onChange(nextHex);
      }
    },
    [hsv.h, onChange, safeHex]
  );

  const handleSvPointer = (clientX: number, clientY: number) => {
    const board = svBoardRef.current;
    if (!board) return;
    const rect = board.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;

    const s = clamp(((clientX - rect.left) / rect.width) * 100, 0, 100);
    const v = clamp(100 - ((clientY - rect.top) / rect.height) * 100, 0, 100);
    applyHsv({ h: hsv.h, s, v });
  };

  const startSvDrag = (e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    const target = e.currentTarget;
    target.setPointerCapture(e.pointerId);
    handleSvPointer(e.clientX, e.clientY);
  };

  const moveSvDrag = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!e.currentTarget.hasPointerCapture(e.pointerId)) return;
    handleSvPointer(e.clientX, e.clientY);
  };

  const endPointerCapture = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
  };

  const handleHuePointer = (clientX: number) => {
    const track = hueTrackRef.current;
    if (!track) return;
    const rect = track.getBoundingClientRect();
    if (rect.width <= 0) return;

    const ratio = clamp((clientX - rect.left) / rect.width, 0, 1);
    const nextHue = ratio * 360;
    applyHsv({ h: nextHue, s: hsv.s, v: hsv.v });
  };

  const startHueDrag = (e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    const target = e.currentTarget;
    target.setPointerCapture(e.pointerId);
    handleHuePointer(e.clientX);
  };

  const moveHueDrag = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!e.currentTarget.hasPointerCapture(e.pointerId)) return;
    handleHuePointer(e.clientX);
  };

  const handleEyeDropper = async () => {
    const EyeDropperCtor = (window as WindowWithEyeDropper).EyeDropper;
    if (!EyeDropperCtor) return;

    isPickingEyeDropperRef.current = true;
    try {
      const result = await new EyeDropperCtor().open();
      const pickedHex = normalizeHex(result.sRGBHex);
      if (pickedHex) {
        const pickedHsv = rgbToHsv(hexToRgb(pickedHex));
        setHsvState({ hsv: pickedHsv, hex: pickedHex });
        setHexEditState(null);
        onChange(pickedHex);
      }
    } catch {
      // Користувач скасував піпетку (AbortError) — ігноруємо штатно
    } finally {
      isPickingEyeDropperRef.current = false;
    }
  };

  const handleHexChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value;
    const cleaned = raw.trim().replace(/^#/, '');
    const isFullHex = /^[0-9a-fA-F]{6}$/.test(cleaned);
    const valid = isFullHex ? normalizeHex(raw) : null;

    if (valid) {
      const nextHsv = rgbToHsv(hexToRgb(valid));
      const preservedHue = nextHsv.s === 0 ? hsv.h : nextHsv.h;
      setHsvState({
        hsv: { h: preservedHue, s: nextHsv.s, v: nextHsv.v },
        hex: valid,
      });
      setHexEditState({ raw, syncedHex: valid });
      if (valid !== safeHex) {
        onChange(valid);
      }
    } else {
      setHexEditState({ raw, syncedHex: safeHex });
    }
  };

  const handleHexBlur = () => {
    const raw = hexEditState?.raw ?? safeHex;
    const valid = normalizeHex(raw);
    setHexEditState(null);
    if (valid && valid !== safeHex) {
      const nextHsv = rgbToHsv(hexToRgb(valid));
      setHsvState({ hsv: nextHsv, hex: valid });
      onChange(valid);
    }
  };

  const rgb = hsvToRgb(hsv);
  const hueHex = hsvToHex({ h: hsv.h, s: 100, v: 100 });
  const isMenuOpen = isOpen && !disabled;

  return (
    <>
      {variant === 'pill' ? (
        <button
          ref={triggerRef}
          type="button"
          disabled={disabled}
          aria-label={ariaLabel}
          aria-expanded={isMenuOpen}
          onClick={() => {
            if (!disabled) setIsOpen((prev) => !prev);
          }}
          className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-md bg-[#202020] border text-[10px] font-mono text-text-primary transition-colors outline-none ${
            isMenuOpen ? 'border-accent-ruby' : 'border-[#353535]'
          } enabled:hover:bg-[#272727] enabled:hover:border-[#505050] enabled:cursor-pointer disabled:opacity-50 disabled:cursor-default ${className}`}
        >
          <span
            className="w-3 h-3 rounded-full border border-white/30 shrink-0"
            style={{ backgroundColor: safeHex }}
          />
          <span>{safeHex}</span>
        </button>
      ) : (
        <button
          ref={triggerRef}
          type="button"
          disabled={disabled}
          aria-label={ariaLabel}
          aria-expanded={isMenuOpen}
          onClick={() => {
            if (!disabled) setIsOpen((prev) => !prev);
          }}
          className={`w-5 h-5 rounded-md border flex items-center justify-center transition-all outline-none shrink-0 ${
            isMenuOpen
              ? 'border-white ring-1 ring-white/50 scale-105'
              : 'border-border-compact-hover enabled:hover:border-text-dim enabled:hover:scale-105'
          } enabled:cursor-pointer disabled:opacity-50 disabled:cursor-default ${className}`}
          style={{ backgroundColor: safeHex }}
        >
          <span className="sr-only">{safeHex}</span>
        </button>
      )}

      {isMenuOpen &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            ref={popoverRef}
            role="dialog"
            aria-label="Палітра вибору кольору"
            style={{
              left: popoverPos.left,
              top: popoverPos.top,
            }}
            className="fixed z-[120] w-[256px] bg-bg-panel border border-[#2D2D2D] rounded-xl p-3 shadow-2xl animate-fade-in select-none flex flex-col gap-3"
          >
            {/* 2D градієнтна область Saturation / Brightness */}
            <div
              ref={svBoardRef}
              onPointerDown={startSvDrag}
              onPointerMove={moveSvDrag}
              onPointerUp={endPointerCapture}
              onPointerCancel={endPointerCapture}
              style={{ backgroundColor: hueHex }}
              className="relative w-full h-[142px] rounded-lg overflow-hidden border border-border-strong cursor-crosshair touch-none"
            >
              <div
                className="absolute inset-0 pointer-events-none"
                style={{
                  background: 'linear-gradient(to right, #FFFFFF, rgba(255,255,255,0))',
                }}
              />
              <div
                className="absolute inset-0 pointer-events-none"
                style={{
                  background: 'linear-gradient(to top, #000000, rgba(0,0,0,0))',
                }}
              />
              <div
                className="absolute w-3.5 h-3.5 rounded-full border-2 border-white shadow-[0_0_0_1px_rgba(0,0,0,0.85),0_2px_6px_rgba(0,0,0,0.7)] -translate-x-1/2 -translate-y-1/2 pointer-events-none"
                style={{
                  left: `${hsv.s}%`,
                  top: `${100 - hsv.v}%`,
                  backgroundColor: safeHex,
                }}
              />
            </div>

            {/* Рядок слайдера Hue + прев'ю + піпетка */}
            <div className="flex items-center gap-2">
              {supportsEyeDropper && (
                <button
                  type="button"
                  aria-label="Піпетка з екрана"
                  onClick={() => {
                    void handleEyeDropper();
                  }}
                  className="w-7 h-7 rounded-lg bg-[#1F1F1F] border border-border-frame flex items-center justify-center text-text-muted enabled:hover:text-white enabled:hover:bg-bg-active enabled:hover:border-[#404040] transition-colors shrink-0 enabled:cursor-pointer"
                >
                  <Pipette size={13} />
                </button>
              )}

              <div
                className="w-7 h-7 rounded-lg border border-white/20 shrink-0 shadow-inner"
                style={{ backgroundColor: safeHex }}
              />

              <div
                ref={hueTrackRef}
                onPointerDown={startHueDrag}
                onPointerMove={moveHueDrag}
                onPointerUp={endPointerCapture}
                onPointerCancel={endPointerCapture}
                style={{
                  background:
                    'linear-gradient(to right, #FF0000 0%, #FFFF00 17%, #00FF00 33%, #00FFFF 50%, #0000FF 67%, #FF00FF 83%, #FF0000 100%)',
                }}
                className="relative flex-1 h-3 rounded-full border border-white/10 cursor-ew-resize touch-none"
              >
                <div
                  className="absolute top-1/2 w-3.5 h-3.5 rounded-full bg-white border border-bg-panel shadow-[0_1px_4px_rgba(0,0,0,0.85)] -translate-x-1/2 -translate-y-1/2 pointer-events-none"
                  style={{
                    left: `${clamp((hsv.h / 360) * 100, 0, 100)}%`,
                  }}
                />
              </div>
            </div>

            {/* Поля HEX та R / G / B */}
            <div className="flex items-end gap-1.5">
              <div className="w-[82px] shrink-0 space-y-1">
                <label className="block text-[10px] font-semibold uppercase tracking-wider text-text-muted">
                  HEX
                </label>
                <input
                  type="text"
                  value={hexInputValue}
                  maxLength={7}
                  onChange={handleHexChange}
                  onBlur={handleHexBlur}
                  spellCheck={false}
                  className={`w-full text-[11px] font-mono px-2 py-1 ${COMPACT_FIELD_CLASS}`}
                />
              </div>

              {(
                [
                  { key: 'r', label: 'R', val: rgb.r },
                  { key: 'g', label: 'G', val: rgb.g },
                  { key: 'b', label: 'B', val: rgb.b },
                ] as const
              ).map((channel) => (
                <div key={channel.key} className="flex-1 min-w-0 space-y-1">
                  <label className="block text-[10px] font-semibold uppercase tracking-wider text-text-muted text-center">
                    {channel.label}
                  </label>
                  <input
                    type="number"
                    min={0}
                    max={255}
                    value={channel.val}
                    onChange={(e) => {
                      const raw = Number(e.target.value);
                      const parsed = Number.isFinite(raw) ? raw : 0;
                      applyRgb({
                        ...rgb,
                        [channel.key]: parsed,
                      });
                    }}
                    className={`w-full text-[11px] font-mono text-center px-1 py-1 ${COMPACT_FIELD_CLASS} [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none`}
                  />
                </div>
              ))}
            </div>
          </div>,
          document.body
        )}
    </>
  );
};
