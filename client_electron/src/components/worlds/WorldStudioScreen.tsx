import React, { useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Check,
  Globe,
  LayoutTemplate,
  Loader2,
  Save,
  Sparkles,
  X,
} from 'lucide-react';
import {
  useWorldStudioStore,
  type WorldStudioStep,
} from '../../store/useWorldStudioStore';
import { ConfirmModal } from '../modals/ConfirmModal';
import { Button } from '../ui/Button';
import { WorldStepLore } from './WorldStepLore';
import { WorldStepPassport } from './WorldStepPassport';
import { WorldStepPrompts } from './WorldStepPrompts';
import { WorldStepTemplate } from './WorldStepTemplate';

interface StepMeta {
  step: WorldStudioStep;
  label: string;
  subtitle: string;
  icon: React.ReactNode;
}

const STUDIO_STEPS: StepMeta[] = [
  {
    step: 1,
    label: '1. Паспорт',
    subtitle: 'Назва, жанр, опис, іконка, акцентний колір та стартові локації світу.',
    icon: <Globe size={13} />,
  },
  {
    step: 2,
    label: '2. Промпти ШІ',
    subtitle: 'Правила світу для Оповідача, Аналізатора стану та Творця Персонажів.',
    icon: <Sparkles size={13} />,
  },
  {
    step: 3,
    label: '3. База Лору',
    subtitle: 'Стартові статті лору та власні .md / .txt матеріали всесвіту.',
    icon: <BookOpen size={13} />,
  },
  {
    step: 4,
    label: '4. Шаблон Анкети',
    subtitle: 'Структура листа персонажа та живе візуальне прев’ю з демо-даними.',
    icon: <LayoutTemplate size={13} />,
  },
];

export const WorldStudioScreen: React.FC = () => {
  const {
    isOpen,
    mode,
    editingWorldId,
    currentStep,
    passport,
    templateDraft,
    isLoadingWorld,
    isSavingWorld,
    isGeneratingPassport,
    isGeneratingPrompts,
    isGeneratingTemplate,
    isMutatingLore,
    loreGenProgress,
    isDirty,
    setCurrentStep,
    nextStep,
    prevStep,
    closeStudio,
    finalizeCreateWorld,
    saveEditWorld,
  } = useWorldStudioStore();

  const [isCancelConfirmOpen, setIsCancelConfirmOpen] = useState(false);

  if (!isOpen) return null;

  const activeStepMeta =
    STUDIO_STEPS.find((item) => item.step === currentStep) || STUDIO_STEPS[0];

  const isBusy =
    isLoadingWorld ||
    isSavingWorld ||
    isGeneratingPassport ||
    isGeneratingPrompts ||
    isGeneratingTemplate ||
    isMutatingLore ||
    Boolean(loreGenProgress?.active);

  const hasValidTitle = passport.title.trim().length > 0;
  const hasTemplate = Object.keys(templateDraft || {}).length > 0;

  const handleRequestClose = () => {
    if (isBusy) return;
    if (isDirty) {
      setIsCancelConfirmOpen(true);
      return;
    }
    closeStudio(true);
  };

  const handleTabClick = (targetStep: WorldStudioStep) => {
    if (isBusy) return;
    if (mode === 'edit') {
      setCurrentStep(targetStep);
      return;
    }
    if (targetStep <= currentStep || hasValidTitle) {
      setCurrentStep(targetStep);
    }
  };

  const renderStepContent = () => {
    if (isLoadingWorld) {
      return (
        <div className="flex-1 flex flex-col items-center justify-center gap-3 text-[#9CA3AF]">
          <Loader2 size={24} className="animate-spin text-[#EF4444]" />
          <span className="text-sm font-medium">Завантаження даних світу...</span>
        </div>
      );
    }

    if (currentStep === 1) {
      return <WorldStepPassport />;
    }

    if (currentStep === 2) {
      return <WorldStepPrompts />;
    }

    if (currentStep === 3) {
      return <WorldStepLore />;
    }

    return <WorldStepTemplate />;
  };

  return (
    <div className="absolute inset-0 z-30 bg-[#121212] flex flex-col pl-[46px] pr-8 py-6 select-none animate-in fade-in duration-200">
      {/* 1. Верхня панель заголовка, дій та Stepper-індикатора */}
      <div className="flex flex-col gap-3 pb-4 border-b border-[#222222] mb-4 shrink-0">
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-1 min-w-0">
            <h1 className="text-base font-bold text-[#F3F4F6] tracking-wide truncate">
              {mode === 'create'
                ? 'ТВОРЕЦЬ СВІТІВ: СТВОРЕННЯ СВІТУ'
                : `РЕДАГУВАННЯ СВІТУ: ${passport.title.trim() || editingWorldId || ''}`}
            </h1>
            <p className="text-xs text-[#9CA3AF] truncate">
              {activeStepMeta.subtitle}
            </p>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {mode === 'edit' && (
              <Button
                type="button"
                variant="primary"
                size="sm"
                disabled={isBusy || !hasValidTitle}
                isLoading={isSavingWorld}
                onClick={() => {
                  void saveEditWorld();
                }}
              >
                <Save size={13} />
                <span>Зберегти зміни світу</span>
              </Button>
            )}

            <Button
              type="button"
              variant="secondary"
              disabled={isBusy}
              onClick={handleRequestClose}
              className="text-xs px-3 py-1.5 text-[#9CA3AF] enabled:hover:text-[#EF4444] enabled:hover:bg-[#201014] border-[#333333] enabled:hover:border-[#7E0018]"
            >
              <X size={13} />
              <span>{mode === 'edit' ? 'Закрити' : 'Скасувати'}</span>
            </Button>
          </div>
        </div>

        {/* Індикатор 4 кроків / вкладок */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {STUDIO_STEPS.map((item) => {
            const isActive = currentStep === item.step;
            const isCompleted = mode === 'create' && item.step < currentStep;
            const isClickable =
              !isBusy &&
              (mode === 'edit' || item.step <= currentStep || hasValidTitle);

            return (
              <button
                key={item.step}
                type="button"
                disabled={!isClickable}
                onClick={() => handleTabClick(item.step)}
                title={
                  !isClickable && mode === 'create' && !hasValidTitle
                    ? 'Спочатку вкажіть назву світу'
                    : item.label
                }
                className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-xs font-semibold transition-all text-left enabled:cursor-pointer disabled:cursor-default ${
                  isActive
                    ? 'bg-[#211216] border-[#7E0018] text-white shadow-sm'
                    : isCompleted
                      ? 'bg-[#161B18] border-[#10B981]/35 text-[#D1FAE5] enabled:hover:border-[#10B981]/60'
                      : 'bg-[#161616] border-[#262626] text-[#9CA3AF] enabled:hover:bg-[#1C1C1C] enabled:hover:text-[#E5E7EB] disabled:opacity-55'
                }`}
              >
                <span
                  className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 border ${
                    isActive
                      ? 'bg-[#7E0018] border-[#9E0020] text-white'
                      : isCompleted
                        ? 'bg-[#10B981]/20 border-[#10B981]/50 text-[#34D399]'
                        : 'bg-[#202020] border-[#333333] text-[#9CA3AF]'
                  }`}
                >
                  {isCompleted ? <Check size={11} strokeWidth={3} /> : item.icon}
                </span>
                <span className="truncate">{item.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* 2. Контент активного кроку */}
      <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
        {renderStepContent()}
      </div>

      {/* 3. Покрокова навігація внизу (режим create) */}
      {mode === 'create' && (
        <div className="pt-4 mt-4 border-t border-[#222222] flex items-center justify-between gap-4 shrink-0">
          <Button
            type="button"
            variant="secondary"
            disabled={isBusy || currentStep === 1}
            onClick={prevStep}
          >
            <ArrowLeft size={14} />
            <span>Назад</span>
          </Button>

          <span className="text-xs text-[#6B7280] font-medium">
            {currentStep === 1 && !hasValidTitle
              ? 'Вкажіть назву світу, щоб перейти далі'
              : currentStep === 4 && !hasTemplate
                ? 'Згенеруйте або створіть шаблон анкети, щоб завершити створення світу'
                : `Крок ${currentStep} з 4`}
          </span>

          {currentStep < 4 ? (
            <Button
              type="button"
              variant="primary"
              disabled={isBusy || (currentStep === 1 && !hasValidTitle)}
              onClick={nextStep}
            >
              <span>Далі</span>
              <ArrowRight size={14} />
            </Button>
          ) : (
            <Button
              type="button"
              variant="emerald"
              disabled={isBusy || !hasValidTitle || !hasTemplate}
              isLoading={isSavingWorld}
              onClick={() => {
                void finalizeCreateWorld();
              }}
              className="font-semibold"
            >
              <Sparkles size={14} />
              <span>Завершити і Створити Світ</span>
            </Button>
          )}
        </div>
      )}

      {/* 4. Підтвердження скасування при наявності змін */}
      <ConfirmModal
        isOpen={isCancelConfirmOpen}
        onClose={() => setIsCancelConfirmOpen(false)}
        onConfirm={() => {
          setIsCancelConfirmOpen(false);
          closeStudio(true);
        }}
        title={mode === 'create' ? 'ПЕРЕРВАТИ СТВОРЕННЯ СВІТУ?' : 'СКАСУВАТИ РЕДАГУВАННЯ?'}
        message={
          mode === 'create'
            ? 'Ви впевнені, що бажаєте вийти? Локальну чернетку нового світу буде очищено.'
            : 'У вас є незбережені зміни. Вийти без збереження?'
        }
        confirmText="Так, вийти"
        cancelText="Ні, продовжити"
      />
    </div>
  );
};
