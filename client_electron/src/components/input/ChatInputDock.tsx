import React from 'react';
import { SendOrMicButton } from './SendOrMicButton';
import { VoiceBanner } from './VoiceBanner';

interface ChatInputDockProps {
  children: React.ReactNode;
  hasText: boolean;
  isRecording: boolean;
  isTranscribing: boolean;
  isSendDisabled: boolean;
  onSendOrRecord: () => void;
  rightExtras?: React.ReactNode;
  isHighlighted?: boolean;
  isDimmed?: boolean;
  inputBoxMarker?: boolean;
}

/**
 * Спільний звужений консольний док вводу для всіх 3 чатів у точній палітрі застосунку.
 */
export const ChatInputDock: React.FC<ChatInputDockProps> = ({
  children,
  hasText,
  isRecording,
  isTranscribing,
  isSendDisabled,
  onSendOrRecord,
  rightExtras,
  isHighlighted = false,
  isDimmed = false,
  inputBoxMarker = false,
}) => {
  return (
    <div className="w-full pt-2 pb-0.5 px-2 sm:px-5 shrink-0 select-none">
      <div className="w-full max-w-[920px] mx-auto flex flex-col">
        <VoiceBanner isRecording={isRecording} isTranscribing={isTranscribing} />

        <div
          data-chat-input-box={inputBoxMarker ? 'true' : undefined}
          className={`group/dock w-full rounded-[18px] pl-4 pr-2 py-2 flex items-center gap-2.5 border transition-all duration-200 bg-gradient-to-b ${
            isHighlighted
              ? 'from-[#1C1912] to-[#15130E] border-[#EAB308] shadow-[inset_0_1px_0_rgba(255,255,255,0.04),inset_0_2px_6px_rgba(0,0,0,0.4),0_0_14px_rgba(234,179,8,0.22)]'
              : 'from-[#171717] to-[#141414] border-[#2C2C2C] hover:border-[#3D3D3D] shadow-[inset_0_1px_0_rgba(255,255,255,0.035),inset_0_2px_6px_rgba(0,0,0,0.42),0_6px_18px_-6px_rgba(0,0,0,0.55)] focus-within:border-[#7E0018] focus-within:hover:border-[#7E0018] focus-within:shadow-[inset_0_1px_0_rgba(255,255,255,0.04),inset_0_2px_6px_rgba(0,0,0,0.42),0_0_0_2px_rgba(126,0,24,0.16),0_6px_20px_-6px_rgba(126,0,24,0.24)]'
          } ${isDimmed ? 'opacity-65' : ''}`}
        >
          <div className="flex-1 min-w-0 min-h-[36px] py-1 flex items-center">{children}</div>

          <div className="w-px h-5 bg-[#2A2A2A] group-focus-within/dock:bg-[#4A1218]/80 transition-colors shrink-0" />

          <div className="flex items-center gap-1.5 shrink-0">
            {rightExtras}
            <SendOrMicButton
              hasText={hasText}
              isRecording={isRecording}
              disabled={isSendDisabled}
              size="compact"
              onClick={onSendOrRecord}
            />
          </div>
        </div>
      </div>
    </div>
  );
};
