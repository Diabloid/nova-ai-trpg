import React from 'react';
import { Mic, Loader2 } from 'lucide-react';

interface VoiceBannerProps {
  isRecording: boolean;
  isTranscribing: boolean;
}

export const VoiceBanner: React.FC<VoiceBannerProps> = ({
  isRecording,
  isTranscribing,
}) => {
  const showRecording = isRecording;
  const showTranscribing = !isRecording && isTranscribing;

  return (
    <div className="w-full flex flex-col">
      <div
        className={`grid transition-all duration-200 ease-out ${
          showRecording
            ? 'grid-rows-[1fr] opacity-100 mb-2'
            : 'grid-rows-[0fr] opacity-0 mb-0 pointer-events-none'
        }`}
      >
        <div className="min-h-0 overflow-hidden">
          <div className="w-full bg-[#22060B] border border-[#7E0018] rounded-lg px-3 py-1.5 flex items-center gap-2.5 shadow-md">
            <span className="w-2.5 h-2.5 rounded-[2px] bg-[#E11D48] animate-ping shrink-0" />
            <Mic size={14} className="text-[#FDA4AF] shrink-0" />
            <span className="text-xs font-semibold text-[#FDA4AF]">
              Запис голосу... Говоріть дію (натисніть кнопку ще раз для завершення)
            </span>
          </div>
        </div>
      </div>

      <div
        className={`grid transition-all duration-200 ease-out ${
          showTranscribing
            ? 'grid-rows-[1fr] opacity-100 mb-2'
            : 'grid-rows-[0fr] opacity-0 mb-0 pointer-events-none'
        }`}
      >
        <div className="min-h-0 overflow-hidden">
          <div className="w-full bg-[#160D1E] border border-[#5B21B6] rounded-lg px-3 py-1.5 flex items-center gap-2 shadow-md">
            <Loader2 size={14} className="animate-spin text-[#C4B5FD] shrink-0" />
            <span className="text-xs italic text-[#DDD6FE]">
              Розпізнавання мовлення...
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};
