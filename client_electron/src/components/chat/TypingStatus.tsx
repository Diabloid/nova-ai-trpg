import React, { useState, useEffect } from 'react';
import { useGameStore } from '../../store/useGameStore';

export const TypingStatus: React.FC = () => {
  const { isLoading, isStreaming, statusText } = useGameStore();
  const [dots, setDots] = useState('');

  useEffect(() => {
    if (!isLoading && !isStreaming) return;

    const interval = setInterval(() => {
      setDots((prev) => (prev.length >= 3 ? '' : prev + '.'));
    }, 400);

    return () => clearInterval(interval);
  }, [isLoading, isStreaming]);

  if (!isLoading && !isStreaming) return null;

  const currentText = statusText || (isStreaming ? 'Створює оповідь...' : 'Розмірковує над дією');

  return (
    <div className="flex flex-col gap-1 py-2 px-1 animate-fade-in select-none">
      <span className="text-sm font-bold text-[#EAB308]">
        Оповідач:
      </span>
      <div className="flex items-center gap-1 text-sm italic text-[#9CA3AF] animate-pulse">
        <span>{currentText}</span>
        <span className="inline-block w-6 font-mono font-bold text-[#EAB308]">
          {dots}
        </span>
      </div>
    </div>
  );
};
