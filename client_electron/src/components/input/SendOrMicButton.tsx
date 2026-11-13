import React from 'react';
import { Mic, Send } from 'lucide-react';

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
      className={`relative w-12 h-12 rounded-[10px] flex items-center justify-center transition-all duration-180 cursor-pointer shadow-md disabled:opacity-50 disabled:cursor-not-allowed select-none ${
        isRecording
          ? 'bg-gradient-to-br from-[#7E0018] to-[#4A000E] border border-[#E11D48] animate-pulse'
          : hasText
          ? 'bg-gradient-to-br from-[#3E0B12] to-[#24060A] hover:from-[#5A0E1A] hover:to-[#36080E] active:bg-[#2A050A] border border-[#5A0010] hover:border-[#7E0018] text-white'
          : 'bg-gradient-to-br from-[#3E0B12] to-[#24060A] hover:from-[#5A0E1A] hover:to-[#36080E] active:bg-[#2A050A] border border-[#5A0010] hover:border-[#7E0018] text-[#E5E7EB]'
      }`}
    >
      {isRecording ? (
        /* Пульсуючий скруглений квадрат зупинки запису (11x11, CornerRadius 2.5, #FECDD3) */
        <span className="w-[11px] h-[11px] bg-[#FECDD3] rounded-[2.5px] shadow-sm animate-ping" />
      ) : hasText ? (
        /* Стрілка відправки (18x18 біла) */
        <Send size={18} className="text-white ml-0.5" />
      ) : (
        /* Мікрофон (18x18 #E5E7EB) */
        <Mic size={18} className="text-[#E5E7EB]" />
      )}
    </button>
  );
};
