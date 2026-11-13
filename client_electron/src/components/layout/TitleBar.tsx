import React, { useEffect, useState } from 'react';
import { Minus, Square, Copy, X } from 'lucide-react';

export const TitleBar: React.FC = () => {
  const [isMaximized, setIsMaximized] = useState(false);

  useEffect(() => {
    // Check initial state
    window.electronAPI?.isMaximized().then(setIsMaximized);

    // Subscribe to maximize changes
    const cleanup = window.electronAPI?.onMaximizedChange((max) => {
      setIsMaximized(max);
    });

    return () => {
      cleanup?.();
    };
  }, []);

  const handleMinimize = () => {
    window.electronAPI?.minimize();
  };

  const handleMaximize = () => {
    window.electronAPI?.maximize();
  };

  const handleClose = () => {
    window.electronAPI?.close();
  };

  return (
    <header className="w-full h-[34px] bg-[#121212] border-b border-[#222222] flex items-center justify-between select-none drag-region shrink-0 z-50">
      {/* Left accent / spacer */}
      <div className="flex items-center gap-2 pl-3">
        <span className="w-2 h-2 rounded-full bg-[#7E0018]" />
      </div>

      {/* Center Title */}
      <div className="text-[11px] font-semibold tracking-[0.2em] text-[#888888] uppercase pointer-events-none">
        NOVA AI TRPG
      </div>

      {/* Right Window Controls */}
      <div className="flex items-center h-full no-drag">
        <button
          onClick={handleMinimize}
          className="w-[46px] h-[34px] inline-flex items-center justify-center text-[#888888] hover:text-[#FFFFFF] hover:bg-[#222222] transition-colors cursor-pointer"
          title="Згорнути"
        >
          <Minus size={13} strokeWidth={2} />
        </button>

        <button
          onClick={handleMaximize}
          className="w-[46px] h-[34px] inline-flex items-center justify-center text-[#888888] hover:text-[#FFFFFF] hover:bg-[#222222] transition-colors cursor-pointer"
          title={isMaximized ? 'Відновити' : 'Розгорнути'}
        >
          {isMaximized ? (
            <Copy size={11} strokeWidth={2} className="rotate-90" />
          ) : (
            <Square size={11} strokeWidth={2} />
          )}
        </button>

        <button
          onClick={handleClose}
          className="w-[46px] h-[34px] inline-flex items-center justify-center text-[#888888] hover:text-white hover:bg-[#7E0018] transition-colors cursor-pointer"
          title="Закрити"
        >
          <X size={14} strokeWidth={2} />
        </button>
      </div>
    </header>
  );
};
