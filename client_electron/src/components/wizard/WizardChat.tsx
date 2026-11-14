import React, { useRef, useState, useEffect } from 'react';
import { useGameStore } from '../../store/useGameStore';
import { useWizardStore } from '../../store/useWizardStore';
import { gameApi } from '../../api/gameApi';
import { SendOrMicButton } from '../input/SendOrMicButton';
import { VoiceBanner } from '../input/VoiceBanner';

export const WizardChat: React.FC = () => {
  const {
    wizardMessages,
    wizardInput,
    setWizardInput,
    sendWizardMessage,
    isWizardTyping,
    wizardStatusText,
  } = useWizardStore();
  const setSystemAlert = useGameStore((s) => s.setSystemAlert);

  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [isInputOverflowing, setIsInputOverflowing] = useState(false);
  const [animatedDots, setAnimatedDots] = useState('');

  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);

  // Автоскрол донизу при зміні повідомлень або друку
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [wizardMessages, isWizardTyping]);

  // Анімація точок статусу ШІ (...)
  useEffect(() => {
    if (!isWizardTyping) return;
    let count = 0;
    const interval = setInterval(() => {
      count = (count + 1) % 4;
      setAnimatedDots('.'.repeat(count));
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
    if (!text || isWizardTyping) return;
    sendWizardMessage(text);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  // Робота з аудіозаписом (Web MediaRecorder + Whisper)
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
          const text = await gameApi.transcribeAudio(audioBlob, 'wizard_recording.webm');
          if (text) {
            setWizardInput(wizardInput ? `${wizardInput} ${text}` : text);
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
    } else if (wizardInput.trim().length > 0) {
      handleSend();
    } else {
      startRecording();
    }
  };

  const hasText = wizardInput.trim().length > 0;
  const isInputDisabled = isWizardTyping || isTranscribing;

  return (
    <div className="flex-1 flex flex-col h-full bg-[#111111] border border-[#262626] rounded-xl p-4.5 pb-3 min-w-0 shadow-lg">
      {/* 1. Стрічка повідомлень діалогу */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto mask-fade-vertical pr-2 space-y-4 mb-3"
      >
        {wizardMessages.map((msg) => {
          const isPlayer = msg.isPlayer || msg.sender === 'Ти:';
          const isSystem = msg.isSystem || msg.sender.includes('Система');
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
                  isSystem
                    ? 'bg-[#220D12] border-[#5A141E] text-[#FCA5A5]'
                    : isPlayer
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
          <div className="flex items-center gap-1.5 text-xs text-[#C084FC] italic pt-1 animate-pulse">
            <span>{wizardStatusText || 'Творець Долі розмірковує'}</span>
            <span className="w-5 inline-block font-mono">{animatedDots}</span>
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