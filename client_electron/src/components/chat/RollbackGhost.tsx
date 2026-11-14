import React, { useEffect, useRef } from 'react';
import { useGameStore } from '../../store/useGameStore';

const FLIGHT_DURATION_MS = 460;

/**
 * Ефемерний привид-блок: при відкаті стискає повідомлення гравця (якщо воно довге)
 * і переносить його плавною параболічною дугою з чату прямо в поле вводу.
 */
export const RollbackGhost: React.FC = () => {
  const rollbackGhost = useGameStore((s) => s.rollbackGhost);
  const ghostRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ghostRef.current;
    if (!el || !rollbackGhost) return;

    const { fromRect, toRect } = rollbackGhost;
    const cardWidth = Math.min(fromRect.width, toRect.width);
    const startHeight = Math.min(Math.max(fromRect.height, 44), 340);
    const targetHeight = Math.min(startHeight, 52);

    const x0 = fromRect.left;
    const y0 = fromRect.top;
    const x2 = toRect.left + 8;
    const y2 = toRect.top + 8;

    // Контрольна точка Безьє: легкий підйом вгору та дуга праворуч, не виходячи за межі вікна
    const distanceY = Math.abs(y2 - y0);
    const arcLift = Math.min(52, Math.max(22, distanceY * 0.16));
    const arcSideOffset = Math.min(130, Math.max(56, distanceY * 0.25));
    const maxSafeX1 = Math.max(x0, window.innerWidth - cardWidth * 0.9 - 20);
    const x1 = Math.min(maxSafeX1, Math.max(x0, x2) + arcSideOffset);
    const y1 = Math.max(44, Math.min(y0, y2) - arcLift);

    let startTime: number | null = null;
    let rafId = 0;

    const step = (now: number) => {
      if (startTime === null) {
        startTime = now;
      }

      const rawProgress = Math.min(1, (now - startTime) / FLIGHT_DURATION_MS);
      // easeInOutQuad для руху по траєкторії
      const t =
        rawProgress < 0.5
          ? 2 * rawProgress * rawProgress
          : 1 - Math.pow(-2 * rawProgress + 2, 2) / 2;

      const inv = 1 - t;
      const x = inv * inv * x0 + 2 * inv * t * x1 + t * t * x2;
      const y = inv * inv * y0 + 2 * inv * t * y1 + t * t * y2;

      // Швидке стискання висоти на старті/середині польоту (0% -> 50%)
      const compressRaw = Math.min(1, rawProgress / 0.5);
      const compressEase = 1 - Math.pow(1 - compressRaw, 3);
      const currentMaxHeight = startHeight + (targetHeight - startHeight) * compressEase;

      const scale = 1 - 0.12 * Math.sin(t * Math.PI * 0.5);
      const rotateDeg = Math.sin(t * Math.PI) * 1.6;
      const opacity = rawProgress > 0.72 ? Math.max(0.15, 1 - ((rawProgress - 0.72) / 0.28) * 0.85) : 1;

      el.style.transform = `translate3d(${x}px, ${y}px, 0) scale(${scale}) rotate(${rotateDeg}deg)`;
      el.style.maxHeight = `${currentMaxHeight}px`;
      el.style.opacity = `${opacity}`;

      if (rawProgress < 1) {
        rafId = requestAnimationFrame(step);
      }
    };

    rafId = requestAnimationFrame(step);
    return () => cancelAnimationFrame(rafId);
  }, [rollbackGhost]);

  if (!rollbackGhost) return null;

  const { text, fromRect, toRect } = rollbackGhost;
  const initialWidth = Math.min(fromRect.width, toRect.width);
  const initialHeight = Math.min(Math.max(fromRect.height, 44), 340);

  return (
    <div
      ref={ghostRef}
      aria-hidden="true"
      style={{
        left: 0,
        top: 0,
        width: `${initialWidth}px`,
        maxHeight: `${initialHeight}px`,
        transform: `translate3d(${fromRect.left}px, ${fromRect.top}px, 0)`,
        transformOrigin: 'top left',
      }}
      className="fixed z-50 pointer-events-none overflow-hidden rounded-lg border border-[#EAB308]/55 bg-[#181B22]/95 px-[14px] py-[10px] text-[14px] leading-[22px] tracking-[0.2px] text-[#E5E7EB] shadow-2xl whitespace-pre-wrap break-words will-change-transform"
    >
      {text}
    </div>
  );
};
