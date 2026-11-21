import React from 'react';
import { Button } from './Button';
import { Modal } from './Modal';

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
  const handleConfirm = async () => {
    await onConfirm();
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      closeDisabled={isLoading}
      className="w-[380px] border-[#7E0018] gap-3.5"
    >
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
    </Modal>
  );
};