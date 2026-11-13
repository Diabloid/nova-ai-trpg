import React from 'react';
import { Button } from '../ui/Button';

export interface ConfirmModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void | Promise<void>;
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  isLoading?: boolean;
}

export const ConfirmModal: React.FC<ConfirmModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
  confirmText = 'Так',
  cancelText = 'Ні, залишити',
  isLoading = false,
}) => {
  if (!isOpen) return null;

  const handleConfirm = async () => {
    await onConfirm();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-150 select-none">
      <div className="fixed inset-0" onClick={onClose} aria-hidden="true" />
      <div className="relative z-10 w-[380px] max-w-full bg-[#161616] border border-[#7E0018] rounded-xl p-6 shadow-2xl flex flex-col gap-3.5 text-[#E5E7EB]">
        <h3 className="text-[#EF4444] text-base font-bold">
          {title}
        </h3>
        <p className="text-[#E5E7EB] text-xs leading-relaxed">
          {message}
        </p>

        <div className="grid grid-cols-2 gap-3 pt-3">
          {/* Смарагдова безпечна кнопка «Ні, залишити» */}
          <Button
            type="button"
            variant="emerald"
            onClick={onClose}
            disabled={isLoading}
            className="w-full justify-center text-xs py-2 cursor-pointer font-medium"
          >
            {cancelText}
          </Button>

          {/* Рубінова кнопка підтвердження */}
          <Button
            type="button"
            variant="danger"
            onClick={handleConfirm}
            disabled={isLoading}
            className="w-full justify-center text-xs py-2 cursor-pointer font-semibold"
          >
            {isLoading ? 'Зачекайте...' : confirmText}
          </Button>
        </div>
      </div>
    </div>
  );
};