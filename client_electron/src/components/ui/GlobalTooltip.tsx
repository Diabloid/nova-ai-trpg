import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

const SHOW_DELAY_MS = 350;
const VIEWPORT_PADDING = 8;
const ANCHOR_GAP = 8;

interface ActiveTooltipState {
  text: string;
  anchorRect: {
    left: number;
    top: number;
    right: number;
    bottom: number;
    width: number;
    height: number;
  };
}

function toAnchorRect(el: HTMLElement): ActiveTooltipState['anchorRect'] {
  const rect = el.getBoundingClientRect();
  return {
    left: rect.left,
    top: rect.top,
    right: rect.right,
    bottom: rect.bottom,
    width: rect.width,
    height: rect.height,
  };
}

/**
 * Конвертує нативний HTML-атрибут `title` в `data-tooltip` і видаляє `title`,
 * щоб Chromium/Electron ніколи не показував білий системний тултіп.
 */
function convertNativeTitlesInSubtree(root: Node): void {
  if (!(root instanceof Element)) return;

  if (root instanceof HTMLElement && root.hasAttribute('title')) {
    const val = root.getAttribute('title');
    if (val && val.trim() && !root.hasAttribute('data-tooltip')) {
      root.setAttribute('data-tooltip', val.trim());
    }
    root.removeAttribute('title');
  }

  const descendants = root.querySelectorAll('[title]');
  descendants.forEach((node) => {
    if (node instanceof HTMLElement) {
      const val = node.getAttribute('title');
      if (val && val.trim() && !node.hasAttribute('data-tooltip')) {
        node.setAttribute('data-tooltip', val.trim());
      }
      node.removeAttribute('title');
    }
  });
}

function findTooltipHostAt(target: EventTarget | null, clientX: number, clientY: number): HTMLElement | null {
  // Перевіряємо суворо найверхній видимий елемент під курсором (не провалюючись під оверлеї та модалки)
  if (typeof document.elementFromPoint === 'function') {
    const topElement = document.elementFromPoint(clientX, clientY);
    if (topElement) {
      const match = topElement.closest('[data-tooltip], [title]');
      return match instanceof HTMLElement ? match : null;
    }
  }

  if (target instanceof Element) {
    const direct = target.closest('[data-tooltip], [title]');
    if (direct instanceof HTMLElement) {
      return direct;
    }
  }

  return null;
}

/**
 * Глобальний темний портальний тултіп замість нативних білих системних title-підказок Chromium/Windows.
 * Превентивно конвертує всі `title` у `data-tooltip` та підтримує як `data-tooltip`, так і `disabled`-кнопки.
 */
export const GlobalTooltip: React.FC = () => {
  const [tooltip, setTooltip] = useState<ActiveTooltipState | null>(null);
  const [coords, setCoords] = useState<{ left: number; top: number; ready: boolean }>({
    left: 0,
    top: 0,
    ready: false,
  });

  const tooltipRef = useRef<HTMLDivElement>(null);
  const currentHostRef = useRef<HTMLElement | null>(null);
  const delayTimerRef = useRef<number | null>(null);
  const hostAttrObserverRef = useRef<MutationObserver | null>(null);

  useEffect(() => {
    // 1. Превентивно очищуємо всі існуючі й майбутні HTML `title` до будь-якого hover
    convertNativeTitlesInSubtree(document.body);

    const domObserver = new MutationObserver((mutations) => {
      for (const m of mutations) {
        if (m.type === 'attributes' && m.attributeName === 'title') {
          if (m.target instanceof HTMLElement && m.target.hasAttribute('title')) {
            const nextTitle = m.target.getAttribute('title');
            if (nextTitle && nextTitle.trim()) {
              m.target.setAttribute('data-tooltip', nextTitle.trim());
            } else {
              m.target.removeAttribute('data-tooltip');
            }
            m.target.removeAttribute('title');
          }
        } else if (m.type === 'childList') {
          m.addedNodes.forEach((node) => convertNativeTitlesInSubtree(node));
        }
      }
    });

    domObserver.observe(document.body, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ['title'],
    });

    const clearDelayTimer = () => {
      if (delayTimerRef.current !== null) {
        window.clearTimeout(delayTimerRef.current);
        delayTimerRef.current = null;
      }
    };

    const disconnectHostObserver = () => {
      if (hostAttrObserverRef.current) {
        hostAttrObserverRef.current.disconnect();
        hostAttrObserverRef.current = null;
      }
    };

    const hideTooltip = () => {
      clearDelayTimer();
      disconnectHostObserver();
      currentHostRef.current = null;
      setTooltip(null);
      setCoords((prev) => (prev.ready ? { left: 0, top: 0, ready: false } : prev));
    };

    const readTooltipText = (host: HTMLElement): string => {
      if (host.hasAttribute('title')) {
        const raw = host.getAttribute('title');
        if (raw && raw.trim()) {
          host.setAttribute('data-tooltip', raw.trim());
        }
        host.removeAttribute('title');
      }
      return (host.getAttribute('data-tooltip') || '').trim();
    };

    const activateHost = (host: HTMLElement) => {
      if (currentHostRef.current === host) return;

      hideTooltip();

      const text = readTooltipText(host);
      if (!text) return;

      currentHostRef.current = host;

      const hostObserver = new MutationObserver(() => {
        if (currentHostRef.current !== host) return;
        const nextText = readTooltipText(host);
        if (!nextText) {
          hideTooltip();
          return;
        }
        setTooltip((prev) =>
          prev
            ? {
                text: nextText,
                anchorRect: toAnchorRect(host),
              }
            : null
        );
      });
      hostObserver.observe(host, {
        attributes: true,
        attributeFilter: ['data-tooltip', 'title'],
      });
      hostAttrObserverRef.current = hostObserver;

      delayTimerRef.current = window.setTimeout(() => {
        if (currentHostRef.current !== host || !host.isConnected) return;
        const freshText = readTooltipText(host);
        if (!freshText) return;
        setCoords({ left: 0, top: 0, ready: false });
        setTooltip({
          text: freshText,
          anchorRect: toAnchorRect(host),
        });
      }, SHOW_DELAY_MS);
    };

    const handlePointerTrace = (e: MouseEvent) => {
      const host = findTooltipHostAt(e.target, e.clientX, e.clientY);
      if (!host) {
        if (currentHostRef.current) hideTooltip();
        return;
      }
      activateHost(host);
    };

    const handleMouseLeaveViewport = () => {
      if (currentHostRef.current) hideTooltip();
    };

    const handleDismiss = () => {
      if (currentHostRef.current) hideTooltip();
    };

    document.addEventListener('mouseover', handlePointerTrace, true);
    document.addEventListener('mousemove', handlePointerTrace, true);
    document.documentElement.addEventListener('mouseleave', handleMouseLeaveViewport);
    window.addEventListener('mousedown', handleDismiss, true);
    window.addEventListener('scroll', handleDismiss, true);
    window.addEventListener('keydown', handleDismiss, true);
    window.addEventListener('blur', handleDismiss);

    return () => {
      clearDelayTimer();
      disconnectHostObserver();
      domObserver.disconnect();
      currentHostRef.current = null;
      document.removeEventListener('mouseover', handlePointerTrace, true);
      document.removeEventListener('mousemove', handlePointerTrace, true);
      document.documentElement.removeEventListener('mouseleave', handleMouseLeaveViewport);
      window.removeEventListener('mousedown', handleDismiss, true);
      window.removeEventListener('scroll', handleDismiss, true);
      window.removeEventListener('keydown', handleDismiss, true);
      window.removeEventListener('blur', handleDismiss);
    };
  }, []);

  useLayoutEffect(() => {
    if (!tooltip || !tooltipRef.current) return;

    const tipRect = tooltipRef.current.getBoundingClientRect();
    const { anchorRect } = tooltip;

    const centerLeft = anchorRect.left + anchorRect.width / 2 - tipRect.width / 2;
    const clampedLeft = Math.max(
      VIEWPORT_PADDING,
      Math.min(centerLeft, window.innerWidth - tipRect.width - VIEWPORT_PADDING)
    );

    const spaceBelow = window.innerHeight - anchorRect.bottom;
    const fitsBelow = spaceBelow >= tipRect.height + ANCHOR_GAP + VIEWPORT_PADDING;
    const preferTop = !fitsBelow && anchorRect.top >= tipRect.height + ANCHOR_GAP + VIEWPORT_PADDING;

    const rawTop = preferTop
      ? anchorRect.top - tipRect.height - ANCHOR_GAP
      : anchorRect.bottom + ANCHOR_GAP;

    const clampedTop = Math.max(
      VIEWPORT_PADDING,
      Math.min(rawTop, window.innerHeight - tipRect.height - VIEWPORT_PADDING)
    );

    setCoords({ left: clampedLeft, top: clampedTop, ready: true });
  }, [tooltip]);

  if (!tooltip || typeof document === 'undefined') return null;

  return createPortal(
    <div
      ref={tooltipRef}
      role="tooltip"
      style={{
        left: coords.left,
        top: coords.top,
      }}
      className={`fixed z-[150] pointer-events-none select-none max-w-[260px] bg-bg-tooltip/95 backdrop-blur-md border border-border-frame text-text-primary text-[11px] font-medium leading-snug px-2.5 py-1.5 rounded-md shadow-xl break-words ${
        coords.ready ? 'animate-fade-in' : 'opacity-0'
      }`}
    >
      {tooltip.text}
    </div>,
    document.body
  );
};
