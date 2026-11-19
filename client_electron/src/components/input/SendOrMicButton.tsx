import React from 'react';
import { Mic } from 'lucide-react';

interface SendOrMicButtonProps {
  hasText: boolean;
  isRecording: boolean;
  disabled?: boolean;
  size?: 'md' | 'compact';
  onClick: () => void;
}

export const SendOrMicButton: React.FC<SendOrMicButtonProps> = ({
  hasText,
  isRecording,
  disabled = false,
  size = 'md',
  onClick,
}) => {
  const sizeClass = size === 'compact' ? 'w-9 h-9 rounded-[10px]' : 'w-12 h-12 rounded-[10px]';
  const iconSizeClass = size === 'compact' ? 'w-4 h-4' : 'w-[18px] h-[18px]';
  const micSize = size === 'compact' ? 16 : 18;

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      data-tooltip={
        isRecording
          ? 'Зупинити запис голосу'
          : hasText
          ? 'Надіслати дію (Enter)'
          : 'Записати голос'
      }
      className={`relative box-border ${sizeClass} overflow-hidden flex items-center justify-center transition-all duration-200 enabled:cursor-pointer enabled:active:scale-[0.95] disabled:opacity-45 disabled:cursor-default select-none shrink-0 ${
        isRecording
          ? 'bg-gradient-to-b from-[#7E0018] to-[#4A000E] border border-[#E11D48] shadow-[0_0_10px_rgba(225,29,72,0.35)] animate-pulse'
          : hasText
          ? 'bg-gradient-to-b from-[#4D101B] to-[#2B070E] enabled:hover:from-[#631422] enabled:hover:to-[#3A0A13] border border-[#7E0018] enabled:hover:border-[#9E0020] text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.08),0_0_10px_rgba(126,0,24,0.22)]'
          : 'bg-gradient-to-b from-[#2B0B11] to-[#1D070B] enabled:hover:from-[#3F1019] enabled:hover:to-[#29090F] border border-[#4D121C] enabled:hover:border-[#7E0018] text-[#E5E7EB] shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]'
      }`}
    >
      {/* Пульсуючий квадрат зупинки запису */}
      <span
        className={`absolute inset-0 flex items-center justify-center transition-all duration-200 ease-in-out ${
          isRecording ? 'opacity-100 scale-100' : 'opacity-0 scale-75 pointer-events-none'
        }`}
      >
        <span className="w-2.5 h-2.5 bg-[#FECDD3] rounded-[2.5px] shadow-sm animate-ping block" />
      </span>

      {/* Заповнена іконка відправки */}
      <span
        className={`absolute inset-0 flex items-center justify-center transition-all duration-200 ease-in-out ${
          !isRecording && hasText
            ? 'opacity-100 scale-100'
            : 'opacity-0 scale-75 pointer-events-none'
        }`}
      >
        <svg viewBox="0.5 0 24 24" className={`${iconSizeClass} fill-current text-white block`}>
          <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" />
        </svg>
      </span>

      {/* Мікрофон */}
      <span
        className={`absolute inset-0 flex items-center justify-center transition-all duration-200 ease-in-out ${
          !isRecording && !hasText
            ? 'opacity-100 scale-100'
            : 'opacity-0 scale-75 pointer-events-none'
        }`}
      >
        <Mic size={micSize} className="text-[#E5E7EB] block" />
      </span>
    </button>
  );
};
