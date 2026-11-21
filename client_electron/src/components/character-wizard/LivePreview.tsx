import React, { useMemo } from 'react';
import { ArrowRight, Info, Loader2, RefreshCw } from 'lucide-react';
import { useGameStore } from '../../store/useGameStore';
import { useWizardStore } from '../../store/useWizardStore';
import { parseDynamicSheet } from '../../utils/dynamicSheet';
import { DynamicSectionRenderer } from '../dynamic-sheet';
import { Button } from '../ui/Button';
import { COMPACT_FIELD_CLASS } from '../ui/Input';

function isPlainRecord(val: unknown): val is Record<string, any> {
  return typeof val === 'object' && val !== null && !Array.isArray(val);
}

export const LivePreview: React.FC = () => {
  const {
    wizardRawState,
    templateOverride,
    activeWorldDetail,
    isLoadingWorldSchema,
    updateWizardHeaderField,
    updateWizardSectionValue,
    updateWizardFieldLabel,
    translateWizardKeys,
    isSyncingDraft,
    hasUnsyncedEdits,
    syncWizardDraft,
    finalizeWizard,
    isWizardTyping,
    wizardMessages,
  } = useWizardStore();
  const backendOffline = useGameStore((s) => s.backendOffline);

  const schemaFallback = useMemo(
    () =>
      templateOverride?._schema_meta ||
      activeWorldDetail?.character_template?._schema_meta ||
      null,
    [templateOverride, activeWorldDetail]
  );

  const parsedSheet = useMemo(
    () => parseDynamicSheet(wizardRawState, schemaFallback),
    [wizardRawState, schemaFallback]
  );

  const meta = isPlainRecord(wizardRawState?.meta) ? wizardRawState.meta : {};
  const health = isPlainRecord(wizardRawState?.anatomy_and_health)
    ? wizardRawState.anatomy_and_health
    : null;

  const hasLocationAnchor =
    'location' in meta ||
    'location' in (wizardRawState || {}) ||
    parsedSheet.headers.location.length > 0;

  const hasOverallStateAnchor =
    parsedSheet.headers.overallState !== undefined ||
    'overall_state' in meta ||
    (health !== null && 'overall_state' in health);

  const worldAccent = activeWorldDetail?.accent_color || '#7E0018';

  return (
    <div className="w-[360px] shrink-0 bg-[#161616] border border-[#262626] rounded-xl p-4 pb-2.5 flex flex-col h-full shadow-lg">
      {/* 1. Верхня смуга дій: Заголовок + Кнопка ручної синхронізації */}
      <div className="flex items-center justify-between pb-3 border-b border-[#222222] gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span
            className="w-2 h-2 rounded-full shrink-0"
            style={{ backgroundColor: worldAccent }}
          />
          <span className="text-[#9CA3AF] text-[11px] font-bold tracking-wider uppercase truncate">
            ПОПЕРЕДНІЙ ПЕРЕГЛЯД
          </span>
        </div>
        <button
          type="button"
          onClick={() => syncWizardDraft()}
          disabled={
            isSyncingDraft ||
            isWizardTyping ||
            isLoadingWorldSchema ||
            backendOffline ||
            !hasUnsyncedEdits
          }
          data-tooltip={
            backendOffline
              ? 'Немає підключення до сервера гри'
              : !hasUnsyncedEdits
                ? 'Змін для синхронізації немає'
                : 'Синхронізувати ручні правки з ШІ за схемою світу'
          }
          className="flex items-center gap-1.5 px-2 py-1 bg-[#1A1A1A] border border-[#333333] rounded-md text-[#D1D5DB] text-[10px] font-semibold transition-all duration-150 shrink-0 enabled:hover:bg-[#252525] enabled:hover:border-[#444444] enabled:active:scale-[0.98] enabled:cursor-pointer disabled:opacity-50 disabled:cursor-default"
        >
          <RefreshCw className={`w-3 h-3 ${isSyncingDraft ? 'animate-spin text-[#A78BFA]' : ''}`} />
          <span>{isSyncingDraft ? 'Синхронізація...' : 'Синхронізувати'}</span>
        </button>
      </div>

      {/* 2. Скрол форми чернетки за схемою світу */}
      <div className="flex-1 overflow-y-auto mask-fade-vertical pr-1 py-3 space-y-3">
        {isLoadingWorldSchema ? (
          <div className="flex items-center justify-center gap-2 py-12 text-xs text-[#9CA3AF]">
            <Loader2 size={14} className="animate-spin text-[#A78BFA]" />
            <span>Завантаження шаблону світу...</span>
          </div>
        ) : (
          <>
            {/* М'які базові якорі шапки */}
            <div className="bg-[#141414] border border-[#262626] rounded-lg p-3 space-y-2.5">
              <div className="space-y-1">
                <label className="block text-[11px] text-[#9CA3AF]">Ім&apos;я персонажа:</label>
                <input
                  type="text"
                  value={parsedSheet.headers.name}
                  onChange={(e) => updateWizardHeaderField({ name: e.target.value })}
                  placeholder="Буде виведено з діалогу..."
                  className={`w-full px-2.5 py-1.5 text-xs ${COMPACT_FIELD_CLASS}`}
                />
              </div>

              {hasLocationAnchor && (
                <div className="space-y-1">
                  <label className="block text-[11px] text-[#9CA3AF]">Початкова локація:</label>
                  <input
                    type="text"
                    value={parsedSheet.headers.location}
                    onChange={(e) => updateWizardHeaderField({ location: e.target.value })}
                    placeholder="Визначається світом або діалогом..."
                    className={`w-full px-2.5 py-1.5 text-xs ${COMPACT_FIELD_CLASS}`}
                  />
                </div>
              )}

              {hasOverallStateAnchor && (
                <div className="space-y-1">
                  <label className="block text-[11px] text-[#9CA3AF]">Загальний стан:</label>
                  <input
                    type="text"
                    value={parsedSheet.headers.overallState ?? ''}
                    onChange={(e) => updateWizardHeaderField({ overallState: e.target.value })}
                    placeholder="Поточний стан персонажа..."
                    className={`w-full px-2.5 py-1.5 text-xs ${COMPACT_FIELD_CLASS}`}
                  />
                </div>
              )}
            </div>

            {/* Усі секції схеми через 5 універсальних компонентів у mode="edit" */}
            {parsedSheet.allEditableSections.map((section) => (
              <DynamicSectionRenderer
                key={section.path}
                section={section}
                mode="edit"
                variant="compact"
                onChange={(nextValue) => updateWizardSectionValue(section.path, nextValue)}
                onFieldLabelChange={updateWizardFieldLabel}
                onTranslateKeys={(keys) => {
                  void translateWizardKeys(keys);
                }}
              />
            ))}

            {/* Підказка */}
            <div className="bg-[#1A0D0E] border border-[#4A1218] rounded-lg p-2.5 flex items-start gap-2">
              <Info size={13} className="text-[#FCA5A5] shrink-0 mt-0.5" />
              <p className="text-[11px] text-[#FCA5A5] leading-relaxed">
                Можна вести діалог із Творцем Долі у вільному стилі або правити будь-які секції вручну й натиснути «Синхронізувати» для узгодження з ШІ.
              </p>
            </div>
          </>
        )}
      </div>

      {/* 3. Нижня закріплена кнопка: Завершити створення */}
      <div className="pt-2 border-t border-[#222222]">
        <Button
          variant="primary"
          onClick={() => finalizeWizard()}
          disabled={
            isWizardTyping ||
            isLoadingWorldSchema ||
            backendOffline ||
            wizardMessages.length <= 1
          }
          data-tooltip={backendOffline ? 'Немає підключення до сервера гри' : undefined}
          className="w-full justify-center text-xs py-2.5 font-bold shadow-md"
        >
          <span>Завершити створення</span>
          <ArrowRight size={13} />
        </Button>
      </div>
    </div>
  );
};
