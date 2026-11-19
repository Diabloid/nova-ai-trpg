import React from 'react';
import {
  Activity,
  BookOpen,
  RotateCcw,
  Sparkles,
  UserCheck,
  Wand2,
} from 'lucide-react';
import { useGameStore } from '../../store/useGameStore';
import {
  useWorldStudioStore,
  WORLD_TONE_CHIPS,
} from '../../store/useWorldStudioStore';
import type { WorldAiPrompts } from '../../types/api';
import { Button } from '../ui/Button';
import { STANDARD_FIELD_CLASS } from '../ui/Input';

interface PromptCardConfig {
  field: keyof WorldAiPrompts;
  title: string;
  hint: string;
  placeholder: string;
  icon: React.ReactNode;
}

const PROMPT_CARDS: PromptCardConfig[] = [
  {
    field: 'world_tone',
    title: 'Тон та атмосфера світу (world_tone)',
    hint: 'За що відповідає: стилістика описів, настрій пригод, рівень похмурості чи героїзму.',
    placeholder: 'Напр.: Суворий реалізм, неон під дощем, висока ціна кожної помилки...',
    icon: <Sparkles size={14} className="text-[#C084FC]" />,
  },
  {
    field: 'narrator_rules',
    title: 'Правила ШІ Оповідача (narrator_rules)',
    hint: 'За що відповідає: закони фізики, магії або технологій, економіка та поведінка NPC у грі.',
    placeholder: 'Опишіть закони світу, бойовку, магію/імпланти, соціальну ієрархію...',
    icon: <BookOpen size={14} className="text-[#F59E0B]" />,
  },
  {
    field: 'analyzer_rules',
    title: 'Правила Аналізатора стану (analyzer_rules)',
    hint: 'За що відповідає: які ресурси, травми, імпланти, валюту або репутацію має фіксувати ШІ після кожного ходу.',
    placeholder: 'Напр.: Відстежуй набої, рівень кібер-навантаження, кредити та поранення...',
    icon: <Activity size={14} className="text-[#34D399]" />,
  },
  {
    field: 'creator_rules',
    title: 'Правила Творця Персонажів (creator_rules)',
    hint: 'За що відповідає: доступні раси, архетипи, стартові обмеження й стиль діалогу при створенні героя.',
    placeholder: 'Напр.: Пропонуй класи Хакер, Наймит, Медик; початковий баланс не більше 500 кредитів...',
    icon: <UserCheck size={14} className="text-[#60A5FA]" />,
  },
];

export const WorldStepPrompts: React.FC = () => {
  const {
    aiPrompts,
    aiGeneratedPromptsSnapshot,
    selectedToneChips,
    promptsCustomInstruction,
    isGeneratingPrompts,
    isLoadingWorld,
    toggleToneChip,
    setPromptsCustomInstruction,
    updateAiPromptField,
    generateAiPrompts,
    resetPromptToAi,
  } = useWorldStudioStore();

  const backendOffline = useGameStore((s) => s.backendOffline);
  const isBusy = isGeneratingPrompts || isLoadingWorld;
  const hasAnyPromptModified = Boolean(
    aiGeneratedPromptsSnapshot &&
      PROMPT_CARDS.some(
        (card) => (aiPrompts[card.field] || '') !== (aiGeneratedPromptsSnapshot[card.field] || '')
      )
  );

  return (
    <div className="flex-1 flex flex-col gap-4 min-h-0 overflow-hidden">
      {/* Верхня панель генератора промптів */}
      <div className="bg-[#111111] border border-[#262626] rounded-xl p-4 flex flex-col gap-3 shrink-0 shadow-md">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[11px] font-bold uppercase tracking-wider text-[#9CA3AF] mr-1">
              Швидкі акценти:
            </span>
            {WORLD_TONE_CHIPS.map((chip) => {
              const isSelected = selectedToneChips.includes(chip);
              return (
                <button
                  key={chip}
                  type="button"
                  disabled={isBusy}
                  onClick={() => toggleToneChip(chip)}
                  className={`px-2.5 py-1 rounded-full text-xs font-medium border transition-colors enabled:cursor-pointer disabled:opacity-50 disabled:cursor-default ${
                    isSelected
                      ? 'bg-[#7E0018]/35 border-[#9E0020] text-white'
                      : 'bg-[#161616] border-[#2C2C2C] text-[#9CA3AF] enabled:hover:border-[#444444] enabled:hover:text-[#E5E7EB]'
                  }`}
                >
                  {chip}
                </button>
              );
            })}
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {hasAnyPromptModified && (
              <Button
                type="button"
                variant="secondary"
                size="sm"
                disabled={isBusy}
                onClick={() => resetPromptToAi()}
                data-tooltip="Повернути всі 4 поля до згенерованої ШІ версії"
              >
                <RotateCcw size={12} />
                <span>Скинути всі до ШІ</span>
              </Button>
            )}

            <Button
              type="button"
              variant="primary"
              size="sm"
              disabled={isBusy || backendOffline}
              isLoading={isGeneratingPrompts}
              onClick={() => {
                void generateAiPrompts();
              }}
            >
              <Wand2 size={13} />
              <span>Згенерувати / оновити з ШІ</span>
            </Button>
          </div>
        </div>

        <input
          type="text"
          value={promptsCustomInstruction}
          disabled={isBusy}
          onChange={(e) => setPromptsCustomInstruction(e.target.value)}
          placeholder="Побажання для ШІ (необов'язково): наприклад, «Зроби магію смертельно небезпечною і без телепортації»..."
          className={`w-full text-xs px-3 py-2 ${STANDARD_FIELD_CLASS}`}
        />
      </div>

      {/* Сітка 4 редагованих текстових правил */}
      <div className="flex-1 overflow-y-auto pr-1 min-h-0">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 pb-2">
          {PROMPT_CARDS.map((card) => {
            const value = aiPrompts[card.field] || '';
            const snapshotVal = aiGeneratedPromptsSnapshot?.[card.field];
            const canReset =
              typeof snapshotVal === 'string' && snapshotVal !== value;

            return (
              <div
                key={card.field}
                className="bg-[#111111] border border-[#262626] rounded-xl p-4 flex flex-col gap-2.5 shadow-md"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    {card.icon}
                    <h3 className="text-xs font-bold text-[#F3F4F6] break-words">
                      {card.title}
                    </h3>
                  </div>

                  {canReset && (
                    <button
                      type="button"
                      disabled={isBusy}
                      onClick={() => resetPromptToAi(card.field)}
                      data-tooltip="Скинути це поле до версії ШІ"
                      className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-[#161616] border border-[#2A2A2A] text-[11px] font-medium text-[#9CA3AF] transition-colors shrink-0 enabled:hover:text-white enabled:hover:bg-[#202020] enabled:hover:border-[#3A3A3A] enabled:cursor-pointer disabled:opacity-35 disabled:cursor-default"
                    >
                      <RotateCcw size={11} />
                      <span>Скинути до ШІ</span>
                    </button>
                  )}
                </div>

                <p className="text-[11px] text-[#6B7280] leading-snug break-words">
                  {card.hint}
                </p>

                <textarea
                  rows={7}
                  value={value}
                  disabled={isBusy}
                  onChange={(e) => updateAiPromptField(card.field, e.target.value)}
                  placeholder={card.placeholder}
                  className={`w-full text-xs leading-relaxed px-3 py-2.5 resize-y ${STANDARD_FIELD_CLASS}`}
                />
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
