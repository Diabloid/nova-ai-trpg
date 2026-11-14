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
    <header className="relative w-full h-[34px] bg-[#121212] border-b border-[#222222] flex items-center justify-between select-none shrink-0 z-50">
      {/* Free draggable region (left & center) */}
      <div className="flex-1 h-full flex items-center pl-3 drag-region">
        <span className="w-2 h-2 rounded-full bg-[#7E0018] shrink-0" />
      </div>

      {/* Center Title (over header, non-interactive so drag passes through) */}
      <div className="absolute left-1/2 -translate-x-1/2 text-[11px] font-semibold tracking-[0.2em] text-[#888888] uppercase pointer-events-none">
        NOVA AI TRPG
      </div>

      {/* Right Window Controls */}
      <div className="flex items-center h-full no-drag shrink-0">
        <button
          type="button"
          onClick={handleMinimize}
          className="w-[46px] h-[34px] inline-flex items-center justify-center text-[#888888] hover:text-[#FFFFFF] hover:bg-[#222222] transition-colors cursor-pointer no-drag"
          title="Згорнути"
        >
          <Minus size={13} strokeWidth={2} />
        </button>

        <button
          type="button"
          onClick={handleMaximize}
          className="w-[46px] h-[34px] inline-flex items-center justify-center text-[#888888] hover:text-[#FFFFFF] hover:bg-[#222222] transition-colors cursor-pointer no-drag"
          title={isMaximized ? 'Відновити' : 'Розгорнути'}
        >
          {isMaximized ? (
            <Copy size={11} strokeWidth={2} className="rotate-90" />
          ) : (
            <Square size={11} strokeWidth={2} />
          )}
        </button>

        <button
          type="button"
          onClick={handleClose}
          className="w-[46px] h-[34px] inline-flex items-center justify-center text-[#888888] hover:text-white hover:bg-[#7E0018] transition-colors cursor-pointer no-drag"
          title="Закрити"
        >
          <X size={14} strokeWidth={2} />
        </button>
      </div>
    </header>
  );
};
