import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  MapPin,
  Palette,
  Plus,
  Sparkles,
  Trash2,
  Zap,
} from 'lucide-react';
import { useVoiceRecorder } from '../../hooks/useVoiceRecorder';
import { useGameStore } from '../../store/useGameStore';
import { useWorldStudioStore } from '../../store/useWorldStudioStore';
import { hexToRgba } from '../../utils/lucideIconMap';
import { IconPicker } from '../character-editor/IconPicker';
import { DynamicLucideIcon } from '../dynamic-sheet';
import { SendOrMicButton } from '../input/SendOrMicButton';
import { VoiceBanner } from '../input/VoiceBanner';
import { Button } from '../ui/Button';

const WORLD_ACCENT_PALETTE = [
  '#7E0018',
  '#EF4444',
  '#F59E0B',
  '#10B981',
  '#38BDF8',
  '#60A5FA',
  '#A78BFA',
  '#C084FC',
];

export const WorldStepPassport: React.FC = () => {
  const {
    passport,
    passportMessages,
    passportInput,
    oneShotDescription,
    isGeneratingPassport,
    isLoadingWorld,
    updatePassport,
    addStartingLocation,
    removeStartingLocation,
    updateStartingLocation,
    setPassportInput,
    setOneShotDescription,
    sendPassportDialog,
    generatePassportOneShot,
  } = useWorldStudioStore();
  const setSystemAlert = useGameStore((s) => s.setSystemAlert);

  const [newLocationInput, setNewLocationInput] = useState('');
  const [animatedDots, setAnimatedDots] = useState('.');
  const [isInputOverflowing, setIsInputOverflowing] = useState(false);

  const chatScrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleTranscribed = useCallback(
    (text: string) => {
      const current = useWorldStudioStore.getState().passportInput;
      setPassportInput(current ? `${current} ${text}` : text);
    },
    [setPassportInput]
  );

  const handleVoiceError = useCallback(
    (msg: string) => {
      setSystemAlert(msg, 'error');
    },
    [setSystemAlert]
  );

  const { isRecording, isTranscribing, startRecording, stopRecording } = useVoiceRecorder({
    filename: 'world_passport_recording.webm',
    onTranscribed: handleTranscribed,
    onError: handleVoiceError,
  });

  useEffect(() => {
    if (chatScrollRef.current) {
      chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight;
    }
  }, [passportMessages, isGeneratingPassport]);

  useEffect(() => {
    if (!isGeneratingPassport) return;
    const timer = setInterval(() => {
      setAnimatedDots((prev) => (prev.length >= 3 ? '.' : `${prev}.`));
    }, 400);
    return () => clearInterval(timer);
  }, [isGeneratingPassport]);

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      const sh = textareaRef.current.scrollHeight;
      textareaRef.current.style.height = `${Math.min(Math.max(sh, 24), 80)}px`;
      setIsInputOverflowing(sh > 80);
    }
  }, [passportInput]);

  const handleAddLocation = () => {
    if (!newLocationInput.trim()) return;
    addStartingLocation(newLocationInput);
    setNewLocationInput('');
  };

  const handleSendChat = () => {
    const trimmed = passportInput.trim();
    if (!trimmed || isGeneratingPassport || isLoadingWorld) return;
    void sendPassportDialog(trimmed);
  };

  const handleChatKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendChat();
    }
  };

  const handleSendOrRecord = () => {
    if (isRecording) {
      stopRecording();
    } else if (passportInput.trim().length > 0) {
      handleSendChat();
    } else {
      startRecording();
    }
  };

  const accentColor = passport.accent_color || '#7E0018';
  const isFormDisabled = isLoadingWorld || isGeneratingPassport;
  const isChatDisabled = isGeneratingPassport || isTranscribing || isLoadingWorld;

  return (
    <div className="flex-1 flex gap-4 min-h-0 overflow-hidden">
      {/* ЛІВА ПАНЕЛЬ: Ручний редактор паспорта світу */}
      <div className="w-[460px] lg:w-[500px] shrink-0 h-full bg-[#111111] border border-[#262626] rounded-xl p-4 flex flex-col gap-4 overflow-y-auto shadow-lg">
        <div className="flex items-center gap-3 pb-3 border-b border-[#222222] shrink-0">
          <div
            className="w-11 h-11 rounded-xl border flex items-center justify-center shrink-0"
            style={{
              backgroundColor: hexToRgba(accentColor, 0.16),
              borderColor: hexToRgba(accentColor, 0.45),
            }}
          >
            <DynamicLucideIcon
              icon={passport.icon || 'globe'}
              size={22}
              style={{ color: accentColor }}
            />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-[11px] font-bold tracking-wider uppercase text-[#9CA3AF]">
              ПАСПОРТ СВІТУ
            </div>
            <div className="text-sm font-bold text-[#F3F4F6] truncate">
              {passport.title.trim() || 'Новий безіменний світ'}
            </div>
          </div>
        </div>

        {/* Назва + Жанр */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 shrink-0">
          <div className="space-y-1.5">
            <label className="block text-xs font-medium text-[#9CA3AF]">
              Назва світу <span className="text-[#EF4444]">*</span>
            </label>
            <input
              type="text"
              value={passport.title}
              disabled={isFormDisabled}
              onChange={(e) => updatePassport({ title: e.target.value })}
              placeholder="Напр.: Нео-Київ 2099"
              className="w-full bg-[#161616] text-[#E5E7EB] text-sm rounded-lg px-3 py-2 border border-[#333333] placeholder-[#555555] focus:outline-none focus:border-[#7E0018] focus:ring-1 focus:ring-[#7E0018] disabled:opacity-60"
            />
          </div>

          <div className="space-y-1.5">
            <label className="block text-xs font-medium text-[#9CA3AF]">
              Жанр / Сетинг
            </label>
            <input
              type="text"
              value={passport.genre}
              disabled={isFormDisabled}
              onChange={(e) => updatePassport({ genre: e.target.value })}
              placeholder="Напр.: Кіберпанк-нуар"
              className="w-full bg-[#161616] text-[#E5E7EB] text-sm rounded-lg px-3 py-2 border border-[#333333] placeholder-[#555555] focus:outline-none focus:border-[#7E0018] focus:ring-1 focus:ring-[#7E0018] disabled:opacity-60"
            />
          </div>
        </div>

        {/* Опис світу */}
        <div className="space-y-1.5 shrink-0">
          <label className="block text-xs font-medium text-[#9CA3AF]">
            Анотація та концепція світу
          </label>
          <textarea
            rows={4}
            value={passport.description}
            disabled={isFormDisabled}
            onChange={(e) => updatePassport({ description: e.target.value })}
            placeholder="Короткий опис атмосфери, головної загрози, технологій чи магії..."
            className="w-full bg-[#161616] text-[#E5E7EB] text-xs leading-relaxed rounded-lg px-3 py-2.5 border border-[#333333] placeholder-[#555555] focus:outline-none focus:border-[#7E0018] focus:ring-1 focus:ring-[#7E0018] resize-y disabled:opacity-60"
          />
        </div>

        {/* Іконка (IconPicker) + Акцентний колір */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 shrink-0">
          <div className="space-y-1.5">
            <label className="block text-xs font-medium text-[#9CA3AF]">
              Іконка світу
            </label>
            <IconPicker
              value={passport.icon}
              onChange={(iconKey) => updatePassport({ icon: iconKey })}
              accentColor={accentColor}
              disabled={isFormDisabled}
            />
          </div>

          <div className="space-y-1.5">
            <label className="flex items-center gap-1.5 text-xs font-medium text-[#9CA3AF]">
              <Palette size={12} />
              <span>Акцентний колір</span>
            </label>
            <div className="bg-[#161616] border border-[#2C2C2C] rounded-lg p-2 flex flex-wrap items-center gap-1.5">
              {WORLD_ACCENT_PALETTE.map((hex) => {
                const isSelected = accentColor.toLowerCase() === hex.toLowerCase();
                return (
                  <button
                    key={hex}
                    type="button"
                    disabled={isFormDisabled}
                    onClick={() => updatePassport({ accent_color: hex })}
                    title={hex}
                    className={`w-5 h-5 rounded-md border transition-transform enabled:cursor-pointer enabled:hover:scale-110 disabled:opacity-50 disabled:cursor-default ${
                      isSelected ? 'border-white ring-1 ring-white/60 scale-110' : 'border-black/40'
                    }`}
                    style={{ backgroundColor: hex }}
                  />
                );
              })}

              <label
                title="Власний колір"
                className={`ml-auto inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-[#222222] border border-[#353535] text-[10px] font-mono text-[#D1D5DB] transition-colors ${
                  isFormDisabled
                    ? 'opacity-50 cursor-default'
                    : 'cursor-pointer hover:border-[#505050]'
                }`}
              >
                <input
                  type="color"
                  value={/^#[0-9a-fA-F]{6}$/.test(accentColor) ? accentColor : '#7E0018'}
                  disabled={isFormDisabled}
                  onChange={(e) => updatePassport({ accent_color: e.target.value })}
                  className="sr-only"
                />
                <span
                  className="w-2.5 h-2.5 rounded-full border border-white/30"
                  style={{ backgroundColor: accentColor }}
                />
                <span>{accentColor.toUpperCase()}</span>
              </label>
            </div>
          </div>
        </div>

        {/* Стартові локації */}
        <div className="space-y-2 shrink-0">
          <div className="flex items-center justify-between">
            <label className="flex items-center gap-1.5 text-xs font-medium text-[#9CA3AF]">
              <MapPin size={12} style={{ color: accentColor }} />
              <span>Стартові локації ({passport.starting_locations.length})</span>
            </label>
          </div>

          <div className="flex gap-2">
            <input
              type="text"
              value={newLocationInput}
              disabled={isFormDisabled}
              onChange={(e) => setNewLocationInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  handleAddLocation();
                }
              }}
              placeholder="Додати стартову локацію..."
              className="flex-1 bg-[#161616] text-[#E5E7EB] text-xs rounded-lg px-3 py-2 border border-[#333333] placeholder-[#555555] focus:outline-none focus:border-[#7E0018] disabled:opacity-60"
            />
            <Button
              type="button"
              variant="secondary"
              size="sm"
              disabled={isFormDisabled || !newLocationInput.trim()}
              onClick={handleAddLocation}
              className="shrink-0"
            >
              <Plus size={13} />
              <span>Додати</span>
            </Button>
          </div>

          {passport.starting_locations.length === 0 ? (
            <div className="text-[11px] text-[#6B7280] italic px-2 py-2 bg-[#161616]/60 border border-dashed border-[#2A2A2A] rounded-lg">
              Поки немає стартових локацій — додайте вручну або згенеруйте за допомогою ШІ праворуч.
            </div>
          ) : (
            <div className="flex flex-col gap-1.5">
              {passport.starting_locations.map((loc, idx) => (
                <div
                  key={`${idx}-${loc}`}
                  className="flex items-center gap-2 bg-[#161616] border border-[#262626] rounded-lg px-2.5 py-1.5"
                >
                  <MapPin size={12} className="text-[#9CA3AF] shrink-0" />
                  <input
                    type="text"
                    value={loc}
                    disabled={isFormDisabled}
                    onChange={(e) => updateStartingLocation(idx, e.target.value)}
                    className="flex-1 bg-transparent text-xs text-[#E5E7EB] focus:outline-none min-w-0"
                  />
                  <button
                    type="button"
                    disabled={isFormDisabled}
                    onClick={() => removeStartingLocation(idx)}
                    title="Видалити локацію"
                    className="w-6 h-6 rounded flex items-center justify-center text-[#9CA3AF] enabled:hover:text-[#EF4444] enabled:hover:bg-[#2A1418] transition-colors enabled:cursor-pointer disabled:opacity-40 disabled:cursor-default shrink-0"
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ПРАВА ПАНЕЛЬ: Швидка генерація з 1 опису + живий AI-чат опитування */}
      <div className="flex-1 flex flex-col gap-3 min-w-0 h-full overflow-hidden">
        {/* Блок One-Shot генерації */}
        <div className="bg-[#111111] border border-[#262626] rounded-xl p-3.5 shrink-0 flex flex-col gap-2.5 shadow-md">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-[#F3F4F6]">
              <Zap size={14} className="text-[#F59E0B]" />
              <span>Швидке заповнення паспорта з одного опису</span>
            </div>
            <Button
              type="button"
              variant="primary"
              size="sm"
              disabled={!oneShotDescription.trim() || isGeneratingPassport || isLoadingWorld}
              isLoading={isGeneratingPassport}
              onClick={() => {
                void generatePassportOneShot();
              }}
            >
              <Sparkles size={13} />
              <span>Заповнити все з одного опису</span>
            </Button>
          </div>

          <textarea
            rows={2}
            value={oneShotDescription}
            disabled={isGeneratingPassport || isLoadingWorld}
            onChange={(e) => setOneShotDescription(e.target.value)}
            placeholder="Вставте один абзац із ідеєю світу (напр.: «Стім-панк мегаполіс на дні океану, де корпорації торгують киснем, а глибоководні мутанти погрожують куполам...»)"
            className="w-full bg-[#161616] text-[#E5E7EB] text-xs rounded-lg px-3 py-2 border border-[#2D2D2D] placeholder-[#555555] focus:outline-none focus:border-[#7E0018] resize-none disabled:opacity-60"
          />
        </div>

        {/* Живий AI-діалог з Архітектором Світів */}
        <div className="flex-1 flex flex-col min-h-0 bg-[#111111] border border-[#262626] rounded-xl p-4 pb-3 shadow-lg">
          <div
            ref={chatScrollRef}
            className="flex-1 overflow-y-auto mask-fade-vertical pr-2 space-y-4 mb-3 min-h-0"
          >
            {passportMessages.map((msg) => {
              const isPlayer = Boolean(msg.isPlayer);
              const senderColor = msg.senderColor || (isPlayer ? '#60A5FA' : '#C084FC');

              return (
                <div
                  key={msg.id}
                  className={`flex flex-col ${isPlayer ? 'items-end' : 'items-start'} max-w-full`}
                >
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

            {isGeneratingPassport && (
              <div className="text-xs text-[#C084FC] italic pt-1 animate-pulse">
                <span>Архітектор Світів формує паспорт</span>
                <span className="w-4 inline-block text-left">{animatedDots}</span>
              </div>
            )}
          </div>

          <div className="w-full flex flex-col select-none pt-2 border-t border-[#1F1F1F] shrink-0">
            <VoiceBanner isRecording={isRecording} isTranscribing={isTranscribing} />

            <div className="relative flex items-center gap-2.5">
              <textarea
                ref={textareaRef}
                rows={1}
                disabled={isChatDisabled}
                value={passportInput}
                onChange={(e) => setPassportInput(e.target.value)}
                onKeyDown={handleChatKeyDown}
                placeholder="Обговоріть сеттинг із Архітектором Світів або надиктуйте ідею голосом..."
                className={`flex-1 bg-[#161616] text-[#E5E7EB] text-sm rounded-lg px-3.5 py-2.5 border border-[#333333] hover:border-[#444444] placeholder-[#555555] focus:outline-none focus:border-[#7E0018] focus:hover:border-[#7E0018] focus:ring-1 focus:ring-[#7E0018] disabled:opacity-50 disabled:cursor-not-allowed resize-none transition-all duration-150 leading-relaxed max-h-20 ${
                  isInputOverflowing ? 'overflow-y-auto' : 'overflow-hidden'
                }`}
              />

              <SendOrMicButton
                hasText={passportInput.trim().length > 0}
                isRecording={isRecording}
                disabled={isChatDisabled}
                onClick={handleSendOrRecord}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
