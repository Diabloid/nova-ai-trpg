import React from 'react';
import { Mic } from 'lucide-react';

interface SendOrMicButtonProps {
  hasText: boolean;
  isRecording: boolean;
  disabled?: boolean;
  onClick: () => void;
}

export const SendOrMicButton: React.FC<SendOrMicButtonProps> = ({
  hasText,
  isRecording,
  disabled = false,
  onClick,
}) => {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={
        isRecording
          ? 'Зупинити запис голосу'
          : hasText
          ? 'Надіслати дію (Enter)'
          : 'Записати голос'
      }
      className={`relative w-12 h-12 rounded-[10px] overflow-hidden flex items-center justify-center transition-all duration-200 cursor-pointer shadow-md disabled:opacity-50 disabled:cursor-not-allowed select-none ${
        isRecording
          ? 'bg-gradient-to-br from-[#7E0018] to-[#4A000E] border border-[#E11D48] animate-pulse'
          : hasText
          ? 'bg-gradient-to-br from-[#3E0B12] to-[#24060A] hover:from-[#5A0E1A] hover:to-[#36080E] active:bg-[#2A050A] border border-[#5A0010] hover:border-[#7E0018] text-white'
          : 'bg-gradient-to-br from-[#3E0B12] to-[#24060A] hover:from-[#5A0E1A] hover:to-[#36080E] active:bg-[#2A050A] border border-[#5A0010] hover:border-[#7E0018] text-[#E5E7EB]'
      }`}
    >
      {/* Пульсуючий квадрат зупинки запису (11x11) */}
      <span
        className={`absolute inset-0 flex items-center justify-center transition-all duration-200 ease-in-out ${
          isRecording ? 'opacity-100 scale-100' : 'opacity-0 scale-75 pointer-events-none'
        }`}
      >
        <span className="w-[11px] h-[11px] bg-[#FECDD3] rounded-[2.5px] shadow-sm animate-ping" />
      </span>

      {/* Заповнена іконка відправки (19x19) */}
      <span
        className={`absolute inset-0 flex items-center justify-center transition-all duration-200 ease-in-out ${
          !isRecording && hasText
            ? 'opacity-100 scale-100'
            : 'opacity-0 scale-75 pointer-events-none'
        }`}
      >
        <svg viewBox="0 0 24 24" className="w-[19px] h-[19px] fill-current ml-0.5 text-white">
          <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" />
        </svg>
      </span>

      {/* Мікрофон (19x19) */}
      <span
        className={`absolute inset-0 flex items-center justify-center transition-all duration-200 ease-in-out ${
          !isRecording && !hasText
            ? 'opacity-100 scale-100'
            : 'opacity-0 scale-75 pointer-events-none'
        }`}
      >
        <Mic size={19} className="text-[#E5E7EB]" />
      </span>
    </button>
  );
};
