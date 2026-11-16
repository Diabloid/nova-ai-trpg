import React, { useRef, useState } from 'react';
import { Globe, LayoutTemplate, Upload, X } from 'lucide-react';
import { useGameStore } from '../../store/useGameStore';
import { useWizardStore } from '../../store/useWizardStore';
import { DynamicLucideIcon } from '../dynamic-sheet';
import { LivePreview } from './LivePreview';
import { WizardChat } from './WizardChat';
import { Button } from '../ui/Button';
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

  const handleWorldSelect = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const nextWorldId = e.target.value;
    if (!nextWorldId || nextWorldId === selectedWorldId) return;
    requestGuardedAction({ kind: 'world', worldId: nextWorldId });
  };

  const handlePresetSelect = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const rawVal = e.target.value;
    if (rawVal === '__import_trigger__') {
      fileInputRef.current?.click();
      return;
    }
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
            className="text-xs px-3 py-1.5 text-[#9CA3AF] hover:text-[#EF4444] hover:bg-[#201014] border-[#333333] hover:border-[#7E0018] cursor-pointer transition-colors shrink-0"
          >
            <X size={13} />
            <span>Скасувати</span>
          </Button>
        </div>

        {/* Селектор Світу та Шаблону анкети */}
        <div className="flex flex-wrap items-center gap-2.5">
          {/* Селектор Світу */}
          <div className="flex items-center gap-2 bg-[#161616] border border-[#2A2A2A] rounded-lg px-2.5 py-1.5">
            <DynamicLucideIcon
              icon={activeWorldSummary?.icon}
              fallback={Globe}
              size={14}
              className="shrink-0"
              style={{ color: activeWorldSummary?.accent_color || '#C084FC' }}
            />
            <span className="text-[11px] font-medium text-[#9CA3AF] shrink-0">Світ:</span>
            <select
              value={selectedWorldId}
              onChange={handleWorldSelect}
              disabled={isSwitchingDisabled || availableWorlds.length === 0}
              aria-label="Оберіть світ для створення персонажа"
              className="bg-[#161616] text-xs font-semibold text-[#F3F4F6] outline-none cursor-pointer disabled:opacity-60 pr-1"
            >
              {availableWorlds.length > 0 ? (
                availableWorlds.map((world) => (
                  <option key={world.world_id} value={world.world_id} className="bg-[#161616] text-[#E5E7EB]">
                    {world.title} ({world.genre})
                  </option>
                ))
              ) : (
                <option value={selectedWorldId} className="bg-[#161616] text-[#E5E7EB]">
                  {activeWorldSummary?.title || selectedWorldId}
                </option>
              )}
            </select>
          </div>

          {/* Селектор Шаблону анкети */}
          <div className="flex items-center gap-2 bg-[#161616] border border-[#2A2A2A] rounded-lg px-2.5 py-1.5">
            <LayoutTemplate size={14} className="text-[#9CA3AF] shrink-0" />
            <span className="text-[11px] font-medium text-[#9CA3AF] shrink-0">Шаблон:</span>
            <select
              value={selectedPresetId ?? ''}
              onChange={handlePresetSelect}
              disabled={isSwitchingDisabled}
              aria-label="Оберіть шаблон анкети"
              className="bg-[#161616] text-xs font-medium text-[#E5E7EB] outline-none cursor-pointer disabled:opacity-60 pr-1"
            >
              <option value="" className="bg-[#161616] text-[#E5E7EB]">
                Стандартний шаблон цього світу
              </option>
              {availablePresets.map((preset) => (
                <option key={preset.id} value={preset.id} className="bg-[#161616] text-[#E5E7EB]">
                  Пресет: {preset.title} ({preset.genre})
                </option>
              ))}
              {selectedPresetId === '__custom_json__' && (
                <option value="__custom_json__" className="bg-[#161616] text-[#E5E7EB]">
                  Користувацький JSON-шаблон
                </option>
              )}
              <option value="__import_trigger__" className="bg-[#161616] text-[#A78BFA]">
                Імпортувати JSON-шаблон...
              </option>
            </select>
          </div>

          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={isSwitchingDisabled}
            title="Імпортувати власний JSON-шаблон анкети з файлу"
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-[#161616] hover:bg-[#1E1E1E] border border-[#2A2A2A] hover:border-[#444444] text-[11px] font-medium text-[#D1D5DB] transition-colors cursor-pointer disabled:opacity-50"
          >
            <Upload size={12} />
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
