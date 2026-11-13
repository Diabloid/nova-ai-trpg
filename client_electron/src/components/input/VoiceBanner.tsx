import React from 'react';

interface VoiceBannerProps {
  isRecording: boolean;
  isTranscribing: boolean;
}

export const VoiceBanner: React.FC<VoiceBannerProps> = ({
  isRecording,
  isTranscribing,
}) => {
  if (!isRecording && !isTranscribing) return null;

  if (isRecording) {
    return (
      <div className="w-full bg-[#22060B] border border-[#7E0018] rounded-lg px-3 py-1.5 mb-2 flex items-center gap-2.5 animate-fade-in shadow-md">
        <span className="w-2.5 h-2.5 rounded-full bg-[#E11D48] animate-ping shrink-0" />
        <span className="text-xs font-semibold text-[#FDA4AF]">
          🎙️ Запис голосу... Говоріть дію (натисніть кнопку ще раз для завершення)
        </span>
      </div>
    );
  }

  if (isTranscribing) {
    return (
      <div className="w-full bg-[#160D1E] border border-[#5B21B6] rounded-lg px-3 py-1.5 mb-2 flex items-center gap-2 animate-fade-in shadow-md">
        <span className="text-xs italic text-[#DDD6FE]">
          🔮 Перетворення голосу в текст через Groq Whisper v3...
        </span>
      </div>
    );
  }

  return null;
};
