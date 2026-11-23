import React, { useState, useEffect } from 'react';
import { Sparkles } from 'lucide-react';
import { useGameStore } from '../../store/useGameStore';

interface TypingStatusProps {
  hasText?: boolean;
}

export const TypingStatus: React.FC<TypingStatusProps> = ({ hasText = false }) => {
  const { isStreaming, statusText } = useGameStore();
  const [dots, setDots] = useState('.');

  useEffect(() => {
    if (!isStreaming) return;

    const interval = setInterval(() => {
      setDots((prev) => (prev.length >= 3 ? '.' : prev + '.'));
    }, 400);

    return () => clearInterval(interval);
  }, [isStreaming]);

  if (!isStreaming) return null;

  // Знімаємо завершальні крапки з рядка статусу, щоб анімовані крапки не накладалися
  const rawStatus = statusText || 'Створює оповідь';
  const cleanStatus = rawStatus.replace(/[.…]+$/, '').trim() || 'Створює оповідь';
  const displayStatus =
    hasText && cleanStatus === 'Розмірковує над дією'
      ? 'Створює оповідь'
      : cleanStatus;

  return (
    <div
      className={`flex items-center gap-2 italic text-[#9CA3AF] select-none ${
        hasText ? 'mt-3 pt-2.5 border-t border-[#222222]/80 text-xs' : 'text-[14px] leading-[24px]'
      }`}
    >
      <Sparkles size={13} className="text-[#EAB308] animate-pulse shrink-0" />
      <span className="animate-pulse">
        {displayStatus}
        <span className="inline-block w-4 text-left not-italic">{dots}</span>
      </span>
    </div>
  );
};
