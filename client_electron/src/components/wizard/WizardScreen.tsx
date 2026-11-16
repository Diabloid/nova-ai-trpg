import React, { useMemo, useRef, useState } from 'react';
import { Globe, LayoutTemplate, Upload, X } from 'lucide-react';
import { useGameStore } from '../../store/useGameStore';
import { useWizardStore } from '../../store/useWizardStore';
import { DynamicLucideIcon } from '../dynamic-sheet';
import { LivePreview } from './LivePreview';
import { WizardChat } from './WizardChat';
import { Button } from '../ui/Button';
import { CustomSelect, type CustomSelectOption } from '../ui/CustomSelect';
import { ConfirmModal } from '../modals/ConfirmModal';

type PendingWizardAction =
  | { kind: 'cancel' }
  | { kind: 'world'; worldId: string }
  | { kind: 'preset'; presetId: string | null }
  | { kind: 'import'; template: Record<string, any> };

export const WizardScreen: React.FC = () => {
  const {
    isWizardOpen,
    closeWizard,
    wizardMessages,
    wizardRawState,
    initialDraftSnapshot,
    wizardInput,
    availableWorlds,
    activeWorldDetail,
    availablePresets,
    selectedWorldId,
    selectedPresetId,
    isWizardTyping,
    isSyncingDraft,
    isLoadingWorldSchema,
    selectWizardWorld,
    selectWizardPreset,
    importCustomTemplate,
  } = useWizardStore();
  const setSystemAlert = useGameStore((s) => s.setSystemAlert);

  const [pendingAction, setPendingAction] = useState<PendingWizardAction | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const worldOptions = useMemo<CustomSelectOption[]>(() => {
    if (availableWorlds.length > 0) {
      return availableWorlds.map((world) => ({
        value: world.world_id,
        label: world.title,
        sublabel: world.genre,
        icon: (
          <DynamicLucideIcon
            icon={world.icon}
            fallback={Globe}
            size={13}
            style={{ color: world.accent_color || '#C084FC' }}
          />
        ),
      }));
    }

    return [
      {
        value: selectedWorldId,
        label: activeWorldDetail?.title || selectedWorldId,
        sublabel: activeWorldDetail?.genre,
        icon: (
          <DynamicLucideIcon
            icon={activeWorldDetail?.icon}
            fallback={Globe}
            size={13}
            style={{ color: activeWorldDetail?.accent_color || '#C084FC' }}
          />
        ),
      },
    ];
  }, [availableWorlds, selectedWorldId, activeWorldDetail]);

  const presetOptions = useMemo<CustomSelectOption[]>(() => {
    const items: CustomSelectOption[] = [
      {
        value: '',
        label: 'Стандартний шаблон цього світу',
      },
      ...availablePresets.map((preset) => ({
        value: preset.id,
        label: `Пресет: ${preset.title}`,
        sublabel: preset.genre,
        icon: (
          <DynamicLucideIcon
            icon={preset.icon}
            fallback={LayoutTemplate}
            size={13}
            className="text-[#9CA3AF]"
          />
        ),
      })),
    ];

    if (selectedPresetId === '__custom_json__') {
      items.push({
        value: '__custom_json__',
        label: 'Користувацький JSON-шаблон',
        icon: <Upload size={13} className="text-[#A78BFA]" />,
      });
    }

    return items;
  }, [availablePresets, selectedPresetId]);

  if (!isWizardOpen) return null;

  const hasUnsavedProgress =
    wizardMessages.length > 1 ||
    !!wizardInput.trim() ||
    JSON.stringify(wizardRawState) !== initialDraftSnapshot;

  const activeWorldSummary =
    availableWorlds.find((w) => w.world_id === selectedWorldId) || activeWorldDetail;

  const executePendingAction = (action: PendingWizardAction) => {
    switch (action.kind) {
      case 'cancel':
        closeWizard();
        break;
      case 'world':
        selectWizardWorld(action.worldId);
        break;
      case 'preset':
        selectWizardPreset(action.presetId);
        break;
      case 'import':
        importCustomTemplate(action.template);
        break;
    }
  };

  const requestGuardedAction = (action: PendingWizardAction) => {
    if (hasUnsavedProgress) {
      setPendingAction(action);
    } else {
      executePendingAction(action);
    }
  };

  const handleWorldChange = (nextWorldId: string) => {
    if (!nextWorldId || nextWorldId === selectedWorldId) return;
    requestGuardedAction({ kind: 'world', worldId: nextWorldId });
  };

  const handlePresetChange = (rawVal: string) => {
    const nextPresetId = rawVal === '' ? null : rawVal;
    if (nextPresetId === selectedPresetId) return;
    requestGuardedAction({ kind: 'preset', presetId: nextPresetId });
  };

  const handleJsonFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    try {
      const content = await file.text();
      const parsed = JSON.parse(content);
      if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
        setSystemAlert('Файл шаблону повинен містити коректний JSON-об’єкт анкети', 'error');
        return;
      }
      requestGuardedAction({ kind: 'import', template: parsed as Record<string, any> });
    } catch {
      setSystemAlert('Не вдалося прочитати JSON-файл шаблону', 'error');
    }
  };

  const confirmDialogConfig =
    pendingAction?.kind === 'cancel'
      ? {
          title: 'ПЕРЕРВАТИ СТВОРЕННЯ?',
          message:
            'Ви впевнені, що бажаєте перервати створення персонажа? Увесь прогрес чернетки буде втрачено.',
          confirmText: 'Так, вийти',
          cancelText: 'Ні, продовжити',
        }
      : {
          title: 'ЗМІНИТИ СВІТ АБО ШАБЛОН?',
          message:
            'Перемикання світу чи шаблону анкети перезавантажить структуру чернетки й очистить поточний діалог візарда. Продовжити?',
          confirmText: 'Так, змінити',
          cancelText: 'Ні, залишити',
        };

  const isSwitchingDisabled = isWizardTyping || isSyncingDraft || isLoadingWorldSchema;

  return (
    <div className="absolute inset-0 z-30 bg-[#121212] flex flex-col pl-[46px] pr-8 py-6 select-none animate-in fade-in duration-200">
      {/* 1. Верхня панель екрану створення: Заголовок + Селектори Світу/Шаблону + Скасувати */}
      <div className="flex flex-col gap-3 pb-4 border-b border-[#222222] mb-4">
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-1 min-w-0">
            <h1 className="text-base font-bold text-[#F3F4F6] tracking-wide">
              ТВОРЕЦЬ ДОЛІ: СТВОРЕННЯ ПЕРСОНАЖА
            </h1>
            <p className="text-xs text-[#9CA3AF]">
              Оберіть світ і шаблон анкети та опишіть свого героя у вільній формі. Штучний інтелект сформує анкету за правилами світу.
            </p>
          </div>

          <Button
            variant="secondary"
            onClick={() => requestGuardedAction({ kind: 'cancel' })}
            className="text-xs px-3 py-1.5 text-[#9CA3AF] enabled:hover:text-[#EF4444] enabled:hover:bg-[#201014] border-[#333333] enabled:hover:border-[#7E0018] shrink-0"
          >
            <X size={13} />
            <span>Скасувати</span>
          </Button>
        </div>

        {/* Селектор Світу, Шаблону анкети (однакова компактна ширина + h-[34px]) та кнопка Імпорт JSON (h-[34px]) */}
        <div className="flex flex-wrap items-center gap-2.5">
          <div className="flex-1 min-w-[210px] max-w-[310px]">
            <CustomSelect
              value={selectedWorldId}
              options={worldOptions}
              onChange={handleWorldChange}
              disabled={isSwitchingDisabled || availableWorlds.length === 0}
              prefixLabel="Світ:"
              ariaLabel="Оберіть світ для створення персонажа"
              leftIcon={
                <DynamicLucideIcon
                  icon={activeWorldSummary?.icon}
                  fallback={Globe}
                  size={14}
                  style={{ color: activeWorldSummary?.accent_color || '#C084FC' }}
                />
              }
            />
          </div>

          <div className="flex-1 min-w-[210px] max-w-[310px]">
            <CustomSelect
              value={selectedPresetId ?? ''}
              options={presetOptions}
              onChange={handlePresetChange}
              disabled={isSwitchingDisabled}
              prefixLabel="Шаблон:"
              ariaLabel="Оберіть шаблон анкети"
              leftIcon={<LayoutTemplate size={14} className="text-[#9CA3AF]" />}
              actionItem={{
                label: 'Імпортувати JSON-шаблон...',
                icon: <Upload size={13} />,
                onClick: () => fileInputRef.current?.click(),
              }}
            />
          </div>

          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={isSwitchingDisabled}
            title="Імпортувати власний JSON-шаблон анкети з файлу"
            className="h-[34px] shrink-0 inline-flex items-center gap-1.5 px-3 rounded-[8px] bg-[#161616] border border-[#2A2A2A] text-xs font-medium text-[#E5E7EB] transition-all duration-150 enabled:hover:bg-[#1E1E1E] enabled:hover:border-[#3E3E3E] enabled:active:bg-[#141414] enabled:active:scale-[0.985] enabled:cursor-pointer disabled:opacity-50 disabled:cursor-default"
          >
            <Upload size={13} className="text-[#9CA3AF] shrink-0" />
            <span>Імпорт JSON</span>
          </button>

          <input
            ref={fileInputRef}
            type="file"
            accept=".json,application/json"
            onChange={handleJsonFileChange}
            className="hidden"
          />
        </div>
      </div>

      {/* 2. Центральна частина: Спліт Прев'ю ліворуч (360px) + Чат праворуч (flex-1) */}
      <div className="flex-1 flex gap-4 min-h-0 overflow-hidden">
        <LivePreview />
        <WizardChat />
      </div>

      {/* 3. Фірмове модальне вікно підтвердження (скасування або зміна світу/шаблону) */}
      <ConfirmModal
        isOpen={!!pendingAction}
        onClose={() => setPendingAction(null)}
        onConfirm={() => {
          if (pendingAction) {
            executePendingAction(pendingAction);
          }
          setPendingAction(null);
        }}
        title={confirmDialogConfig.title}
        message={confirmDialogConfig.message}
        confirmText={confirmDialogConfig.confirmText}
        cancelText={confirmDialogConfig.cancelText}
      />
    </div>
  );
};
