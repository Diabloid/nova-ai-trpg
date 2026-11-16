import React, { useRef, useState, useEffect, useCallback } from 'react';
import { useGameStore } from '../../store/useGameStore';
import { useWizardStore } from '../../store/useWizardStore';
import { useVoiceRecorder } from '../../hooks/useVoiceRecorder';
import { SendOrMicButton } from '../input/SendOrMicButton';
import { VoiceBanner } from '../input/VoiceBanner';

export const WizardChat: React.FC = () => {
  const {
    wizardMessages,
    wizardInput,
    setWizardInput,
    sendWizardMessage,
    isWizardTyping,
    isLoadingWorldSchema,
    wizardStatusText,
  } = useWizardStore();
  const setSystemAlert = useGameStore((s) => s.setSystemAlert);

  const [isInputOverflowing, setIsInputOverflowing] = useState(false);
  const [animatedDots, setAnimatedDots] = useState('.');

  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleTranscribed = useCallback(
    (text: string) => {
      const currentInput = useWizardStore.getState().wizardInput;
      setWizardInput(currentInput ? `${currentInput} ${text}` : text);
    },
    [setWizardInput]
  );

  const handleVoiceError = useCallback(
    (message: string) => {
      setSystemAlert(message, 'error');
    },
    [setSystemAlert]
  );

  const { isRecording, isTranscribing, startRecording, stopRecording } = useVoiceRecorder({
    filename: 'wizard_recording.webm',
    onTranscribed: handleTranscribed,
    onError: handleVoiceError,
  });

  // Автоскрол донизу при зміні повідомлень або друку
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [wizardMessages, isWizardTyping]);

  // Анімація точок статусу ШІ (...)
  useEffect(() => {
    if (!isWizardTyping) return;
    const interval = setInterval(() => {
      setAnimatedDots((prev) => (prev.length >= 3 ? '.' : prev + '.'));
    }, 400);
    return () => clearInterval(interval);
  }, [isWizardTyping]);

  // Автовисота поля вводу та контроль скролбару
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      const scrollHeight = textareaRef.current.scrollHeight;
      textareaRef.current.style.height = `${Math.min(Math.max(scrollHeight, 24), 80)}px`;
      setIsInputOverflowing(scrollHeight > 80);
    }
  }, [wizardInput]);

  const handleSend = () => {
    const text = wizardInput.trim();
    if (!text || isWizardTyping || isLoadingWorldSchema) return;
    sendWizardMessage(text);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleSendOrRecordClick = () => {
    if (isRecording) {
      stopRecording();
    } else if (wizardInput.trim().length > 0) {
      handleSend();
    } else {
      startRecording();
    }
  };

  const hasText = wizardInput.trim().length > 0;
  const isInputDisabled = isWizardTyping || isTranscribing || isLoadingWorldSchema;

  return (
    <div className="flex-1 flex flex-col h-full bg-[#111111] border border-[#262626] rounded-xl p-4.5 pb-3 min-w-0 shadow-lg">
      {/* 1. Стрічка повідомлень діалогу */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto mask-fade-vertical pr-2 space-y-4 mb-3"
      >
        {wizardMessages.map((msg) => {
          const isPlayer = msg.isPlayer || msg.sender === 'Ти:';
          const senderColor = msg.senderColor || (isPlayer ? '#60A5FA' : '#C084FC');

          return (
            <div
              key={msg.id}
              className={`flex flex-col ${isPlayer ? 'items-end' : 'items-start'} max-w-full`}
            >
              {/* Шапка повідомлення (Заголовок та час) */}
              <div
                className={`flex items-center gap-2 mb-1 px-1 text-xs ${
                  isPlayer ? 'justify-end' : 'justify-start'
                }`}
              >
                <span className="font-bold" style={{ color: senderColor }}>
                  {msg.sender}
                </span>
                {msg.timeText && (
                  <span className="text-[#6B7280] text-[10px]">{msg.timeText}</span>
                )}
              </div>

              {/* Тіло бульбашки */}
              <div
                data-context-copy={msg.text}
                className={`rounded-xl px-4 py-3 text-sm leading-relaxed max-w-[85%] border shadow-sm ${
                  isPlayer
                    ? 'bg-[#18202F] border-[#253248] text-[#F3F4F6]'
                    : 'bg-[#161616] border-[#2A2A2A] text-[#E5E7EB]'
                }`}
                style={{ minWidth: '140px' }}
              >
                <div className="whitespace-pre-wrap break-words select-text">{msg.text}</div>
              </div>
            </div>
          );
        })}

        {/* Пульсуючий індикатор роздумів ШІ */}
        {isWizardTyping && (
          <div className="text-xs text-[#C084FC] italic pt-1 animate-pulse">
            <span>{(wizardStatusText || 'Творець Долі розмірковує').replace(/[.…]+$/, '').trim()}</span>
            <span className="w-4 inline-block text-left">{animatedDots}</span>
          </div>
        )}
      </div>

      {/* 2. Нижня панель вводу */}
      <div className="w-full flex flex-col select-none pt-2 border-t border-[#1F1F1F]">
        {/* Баннери голосу */}
        <VoiceBanner isRecording={isRecording} isTranscribing={isTranscribing} />

        {/* Контейнер інпута з динамічною кнопкою */}
        <div className="relative flex items-center gap-2.5">
          <textarea
            ref={textareaRef}
            rows={1}
            disabled={isInputDisabled}
            value={wizardInput}
            onChange={(e) => setWizardInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Відповідайте Творцю Долі (ім'я, клас, особливості, спорядження)..."
            className={`flex-1 bg-[#161616] text-[#E5E7EB] text-sm rounded-lg px-3.5 py-2.5 border border-[#333333] hover:border-[#444444] placeholder-[#555555] focus:outline-none focus:border-[#7E0018] focus:hover:border-[#7E0018] focus:ring-1 focus:ring-[#7E0018] disabled:opacity-50 disabled:cursor-not-allowed resize-none transition-all duration-150 leading-relaxed max-h-20 ${
              isInputOverflowing ? 'overflow-y-auto' : 'overflow-hidden'
            }`}
          />

          <SendOrMicButton
            hasText={hasText}
            isRecording={isRecording}
            disabled={isInputDisabled}
            onClick={handleSendOrRecordClick}
          />
        </div>
      </div>
    </div>
  );
};