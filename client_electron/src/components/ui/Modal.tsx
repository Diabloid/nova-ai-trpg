import React, { useEffect, type ReactNode } from 'react';
import { X } from 'lucide-react';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
  className?: string;
  maxWidth?: 'sm' | 'md' | 'lg' | 'xl';
}

export const Modal: React.FC<ModalProps> = ({
  isOpen,
  onClose,
  title,
  description,
  children,
  footer,
  className,
  maxWidth = 'md',
}) => {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const maxWidthStyles = {
    sm: 'max-w-sm',
    md: 'max-w-md',
    lg: 'max-w-lg',
    xl: 'max-w-xl',
  }[maxWidth];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-150">
      <div
        className="fixed inset-0"
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        className={twMerge(
          clsx(
            'relative z-10 w-full bg-[#161616] border border-[#2A2A2A] rounded-xl shadow-2xl p-6 flex flex-col gap-4 text-[#E5E7EB]',
            maxWidthStyles,
            className
          )
        )}
      >
        <div className="flex items-center justify-between pb-2 border-b border-[#262626]">
          <div>
            {title && <h3 className="text-base font-semibold text-[#E5E7EB]">{title}</h3>}
            {description && <p className="text-xs text-[#9CA3AF] mt-0.5">{description}</p>}
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-md text-[#9CA3AF] hover:text-[#E5E7EB] hover:bg-white/10 transition-colors cursor-pointer"
            title="Закрити"
          >
            <X size={18} />
          </button>
        </div>

        <div className="text-sm">{children}</div>

        {footer && <div className="flex items-center justify-end gap-2 pt-2 border-t border-[#262626]">{footer}</div>}
      </div>
    </div>
  );
};
