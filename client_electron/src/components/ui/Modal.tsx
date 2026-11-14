import React, { useEffect, useLayoutEffect, useRef } from 'react';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  closeDisabled?: boolean;
  className?: string;
  children: React.ReactNode;
}

/**
 * Спільна обгортка модальних вікон із бекдропом та закриттям по Escape.
 */
export const Modal: React.FC<ModalProps> = ({
  isOpen,
  onClose,
  closeDisabled = false,
  className = 'w-[380px] border-[#333333] gap-3.5',
  children,
}) => {
  const dialogRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    if (!isOpen) return;

    // Переводимо фокус у саме вікно до відмальовки, щоб виключити навіть однокадровий спалах рамки
    const dialogEl = dialogRef.current;
    if (dialogEl && !dialogEl.contains(document.activeElement)) {
      dialogEl.focus({ preventScroll: true });
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !closeDisabled) {
        e.preventDefault();
        e.stopPropagation();
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose, closeDisabled]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-150 select-none">
      <div
        className="fixed inset-0"
        onClick={() => {
          if (!closeDisabled) onClose();
        }}
        aria-hidden="true"
      />
      <div
        ref={dialogRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        className={`relative z-10 max-w-full bg-[#161616] border rounded-xl p-6 shadow-2xl flex flex-col text-[#E5E7EB] outline-none ${className}`}
      >
        {children}
      </div>
    </div>
  );
};
