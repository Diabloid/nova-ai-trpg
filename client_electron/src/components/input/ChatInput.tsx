import React, { useRef, useState, useEffect } from 'react';
import { useGameStore } from '../../store/useGameStore';
import { gameApi } from '../../api/gameApi';
import { SendOrMicButton } from './SendOrMicButton';
import { VoiceBanner } from './VoiceBanner';
import { SyntaxHelpTooltip } from './SyntaxHelpTooltip';

export const ChatInput: React.FC = () => {
  const {
    userInput,
    setUserInput,
    sendPlayerAction,
    isLoading,
    isStreaming,
    setSystemAlert,
  } = useGameStore();

  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);

  // Автовисота поля вводу (від 20px до 120px)
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      const scrollHeight = textareaRef.current.scrollHeight;
      textareaRef.current.style.height = `${Math.min(Math.max(scrollHeight, 24), 120)}px`;
    }
  }, [userInput]);

  const handleSend = () => {
    const text = userInput.trim();
    if (!text || isLoading || isStreaming) return;
    setUserInput('');
    sendPlayerAction(text).catch((err) => {
      setSystemAlert(`Помилка відправки: ${err.message}`, 'error');
    });
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  // Робота з аудіозаписом
  const startRecording = async () => {
    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        setSystemAlert('Аудіозапис не підтримується у цьому середовищі', 'error');
        return;
      }

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioChunksRef.current = [];

      const recorder = new MediaRecorder(stream);
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      recorder.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, {
          type: recorder.mimeType || 'audio/webm',
        });
        stream.getTracks().forEach((track) => track.stop());

        setIsTranscribing(true);
        try {
          const text = await gameApi.transcribeAudio(audioBlob, 'recording.webm');
          if (text) {
            setUserInput(userInput ? `${userInput} ${text}` : text);
          }
        } catch (err: any) {
          setSystemAlert(`Помилка розпізнавання: ${err.message}`, 'error');
        } finally {
          setIsTranscribing(false);
        }
      };

      recorder.start();
      setIsRecording(true);
    } catch (err: any) {
      setSystemAlert(`Не вдалося отримати доступ до мікрофона: ${err.message}`, 'error');
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  };

  const handleSendOrRecordClick = () => {
    if (isRecording) {
      stopRecording();
    } else if (userInput.trim().length > 0) {
      handleSend();
    } else {
      startRecording();
    }
  };

  const hasText = userInput.trim().length > 0;
  const isInputDisabled = isLoading || isStreaming || isTranscribing;

  return (
    <div className="w-full flex flex-col select-none">
      {/* Баннери запису та транскрипції голосу (1-в-1 як в Avalonia) */}
      <VoiceBanner isRecording={isRecording} isTranscribing={isTranscribing} />

      {/* Головна зона вводу: Border.inputBox + Кнопки праворуч */}
      <div className="flex items-end gap-3">
        {/* Поле вводу з фірмовою рамкою #333333 -> focus #5A0010 */}
        <div className="flex-1 bg-[#161616] border border-[#333333] hover:border-[#444444] focus-within:border-[#5A0010] rounded-[10px] p-[14px_16px] flex items-center transition-colors shadow-inner">
          <textarea
            ref={textareaRef}
            rows={1}
            value={userInput}
            onChange={(e) => setUserInput(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={isInputDisabled}
            placeholder="Введіть дію, думку або фразу..."
            className="w-full bg-transparent text-[15px] text-[#E5E7EB] placeholder-[#555555] placeholder:italic resize-none outline-none leading-relaxed select-text min-h-[24px] max-h-[120px]"
          />
        </div>

        {/* Права група: Send/Mic Button (48x48) + Help Icon (?) */}
        <div className="flex items-end gap-3 pb-0.5 shrink-0">
          <SendOrMicButton
            hasText={hasText}
            isRecording={isRecording}
            disabled={isInputDisabled && !isRecording}
            onClick={handleSendOrRecordClick}
          />
          <div className="pb-2.5">
            <SyntaxHelpTooltip />
          </div>
        </div>
      </div>
    </div>
  );
};
