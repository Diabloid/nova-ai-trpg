import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Check,
  Code2,
  Heart,
  LayoutTemplate,
  MapPin,
  Plus,
  Sliders,
  Sparkles,
  Trash2,
  User,
  Wand2,
  X,
} from 'lucide-react';
import { useGameStore } from '../../store/useGameStore';
import { useWorldStudioStore } from '../../store/useWorldStudioStore';
import { parseDynamicSheet } from '../../utils/dynamicSheet';
import { hexToRgba } from '../../utils/lucideIconMap';
import { AddSectionDialog } from '../character-editor/AddSectionDialog';
import { DynamicSectionRenderer } from '../dynamic-sheet';
import { DynamicLucideIcon } from '../ui/DynamicLucideIcon';
import { Button } from '../ui/Button';
import { Input, Textarea } from '../ui/Input';

const PLACEMENT_LABELS: Record<string, string> = {
  drawer_column: 'Колонка шторки',
  details: 'Спойлер деталей',
  header_badge: 'Бейдж шапки',
};

export const WorldStepTemplate: React.FC = () => {
  const {
    passport,
    templateDraft,
    demoState,
    templateSummaryNote,
    templateCustomInstruction,
    isJsonMode,
    isGeneratingTemplate,
    isLoadingWorld,
    isSavingWorld,
    setTemplateCustomInstruction,
    setIsJsonMode,
    generateWorldTemplate,
    addTemplateSection,
    removeTemplateSection,
    applyTemplateJson,
    clearTemplateSummaryNote,
  } = useWorldStudioStore();

  const [isAddSectionOpen, setIsAddSectionOpen] = useState(false);
  const [rawJsonText, setRawJsonText] = useState('');
  const [jsonError, setJsonError] = useState<string | null>(null);
  const [closingSummaryText, setClosingSummaryText] = useState<string | null>(null);
  const manualCloseTimerRef = useRef<number | null>(null);

  const handleCloseSummaryNote = useCallback(() => {
    if (!templateSummaryNote) return;
    if (manualCloseTimerRef.current !== null) {
      window.clearTimeout(manualCloseTimerRef.current);
    }
    setClosingSummaryText(templateSummaryNote);
    manualCloseTimerRef.current = window.setTimeout(() => {
      clearTemplateSummaryNote();
      setClosingSummaryText(null);
      manualCloseTimerRef.current = null;
    }, 300);
  }, [templateSummaryNote, clearTemplateSummaryNote]);

  useEffect(() => {
    if (!templateSummaryNote) return;
    const noteSnapshot = templateSummaryNote;
    const fadeTimer = window.setTimeout(() => {
      setClosingSummaryText(noteSnapshot);
    }, 4700);
    const clearTimer = window.setTimeout(() => {
      clearTemplateSummaryNote();
      setClosingSummaryText(null);
    }, 5000);

    return () => {
      window.clearTimeout(fadeTimer);
      window.clearTimeout(clearTimer);
    };
  }, [templateSummaryNote, clearTemplateSummaryNote]);

  useEffect(() => {
    return () => {
      if (manualCloseTimerRef.current !== null) {
        window.clearTimeout(manualCloseTimerRef.current);
      }
    };
  }, []);

  const isSummaryOpen = Boolean(templateSummaryNote) && closingSummaryText !== templateSummaryNote;

  const backendOffline = useGameStore((s) => s.backendOffline);
  const isBusy = isGeneratingTemplate || isLoadingWorld || isSavingWorld;
  const hasTemplate = Object.keys(templateDraft || {}).length > 0;

  const previewSource = useMemo(() => {
    if (demoState && Object.keys(demoState).length > 0) {
      return demoState;
    }
    return templateDraft;
  }, [demoState, templateDraft]);

  const parsedPreview = useMemo(
    () => parseDynamicSheet(previewSource, templateDraft?._schema_meta),
    [previewSource, templateDraft]
  );

  const parsedTemplateSections = useMemo(
    () => parseDynamicSheet(templateDraft, templateDraft?._schema_meta).allSections,
    [templateDraft]
  );

  const isJsonDirty =
    isJsonMode && rawJsonText !== JSON.stringify(templateDraft || {}, null, 2);

  const handleToggleJsonMode = () => {
    if (!isJsonMode) {
      setRawJsonText(JSON.stringify(templateDraft || {}, null, 2));
      setJsonError(null);
      setIsJsonMode(true);
    } else {
      if (isJsonDirty) {
        const result = applyTemplateJson(rawJsonText);
        if (!result.ok) {
          setJsonError(result.error || 'Невалідний JSON');
          return;
        }
      }
      setIsJsonMode(false);
      setJsonError(null);
    }
  };

  const handleApplyJson = () => {
    const result = applyTemplateJson(rawJsonText);
    if (!result.ok) {
      setJsonError(result.error || 'Невалідний JSON');
    } else {
      setJsonError(null);
    }
  };

  return (
    <div className="flex-1 flex flex-col gap-3 min-h-0 overflow-hidden">
      {/* 1. Верхня панель AI-генерації та коригування шаблону */}
      <div className="bg-bg-deep border border-border-default rounded-xl p-3.5 flex flex-col gap-2.5 shrink-0 shadow-md">
        <div className="flex flex-wrap items-center justify-between gap-2.5">
          <div className="flex items-center gap-2 min-w-0">
            <LayoutTemplate size={15} className="text-[#38BDF8] shrink-0" />
            <span className="text-xs font-semibold text-text-bright">
              Унікальний шаблон анкети персонажа цього світу
            </span>
          </div>

          <Button
            type="button"
            variant="primary"
            size="sm"
            disabled={isBusy || backendOffline}
            isLoading={isGeneratingTemplate}
            onClick={() => {
              void generateWorldTemplate();
            }}
          >
            <Wand2 size={13} />
            <span>Згенерувати шаблон і демо-дані з ШІ</span>
          </Button>
        </div>

        <div className="flex items-center gap-2">
          <Input
            type="text"
            value={templateCustomInstruction}
            disabled={isBusy}
            onChange={(e) => setTemplateCustomInstruction(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                void generateWorldTemplate(templateCustomInstruction);
              }
            }}
            placeholder="AI-коригування шаблону: напр. «Додай шкалу Радіації й прибери Ману»..."
            className="w-auto flex-1 text-xs px-3 py-2"
          />
          <Button
            type="button"
            variant="secondary"
            size="sm"
            disabled={isBusy || backendOffline || !templateCustomInstruction.trim()}
            isLoading={isGeneratingTemplate}
            onClick={() => {
              void generateWorldTemplate(templateCustomInstruction);
            }}
            className="shrink-0"
          >
            <Sparkles size={12} className="text-[#C084FC]" />
            <span>Оновити з ШІ</span>
          </Button>
        </div>

        <div
          className={`grid transition-all duration-300 ease-out ${
            isSummaryOpen
              ? 'grid-rows-[1fr] opacity-100 mt-0'
              : 'grid-rows-[0fr] opacity-0 -mt-2.5 pointer-events-none'
          }`}
        >
          <div className="min-h-0 overflow-hidden">
            {templateSummaryNote && (
              <div className="flex items-start justify-between gap-2 text-[11px] text-text-muted bg-bg-panel border border-border-default rounded-lg px-3 py-1.5">
                <span className="break-words min-w-0 leading-relaxed">{templateSummaryNote}</span>
                <button
                  type="button"
                  onClick={handleCloseSummaryNote}
                  aria-label="Закрити підказку"
                  className="w-5 h-5 rounded inline-flex items-center justify-center text-text-muted shrink-0 enabled:hover:text-danger enabled:hover:bg-accent-ruby-soft transition-colors enabled:cursor-pointer"
                >
                  <X size={12} />
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 2. Спліт: Ліворуч живе прев'ю анкети з демо-даними, Праворуч конструктор / JSON */}
      <div className="flex-1 flex gap-4 min-h-0 overflow-hidden">
        {/* ЛІВА ПАНЕЛЬ: Живе візуальне прев'ю */}
        <div className="flex-1 min-w-0 h-full bg-bg-deep border border-border-default rounded-xl p-4 flex flex-col gap-3 overflow-hidden shadow-lg">
          <div className="flex items-center justify-between gap-2 pb-2 border-b border-border-subtle shrink-0">
            <span className="text-[11px] font-bold uppercase tracking-wider text-text-muted">
              ЖИВЕ ПРЕВ’Ю АНКЕТИ ГЕРОЯ
            </span>
            <span className="text-[11px] text-text-dim">
              {demoState && Object.keys(demoState).length > 0
                ? 'Із демо-даними ШІ'
                : 'Структура шаблону'}
            </span>
          </div>

          {!hasTemplate ? (
            <div className="flex-1 flex flex-col items-center justify-center text-center px-6 text-text-dim">
              <LayoutTemplate size={28} className="mb-2 text-[#4B5563]" />
              <span className="text-sm font-medium text-text-muted">
                Шаблон анкети ще не сформовано
              </span>
              <span className="text-xs mt-1 max-w-md">
                Натисніть «Згенерувати шаблон і демо-дані з ШІ» або додайте секції вручну у конструкторі праворуч.
              </span>
            </div>
          ) : (
            <div className="flex-1 overflow-y-auto pr-1 space-y-3 min-h-0">
              {/* Прев'ю верхньої шапки з header_badge */}
              <div className="bg-bg-tooltip border border-[#2C2C2C] rounded-xl p-3 flex flex-wrap items-center justify-between gap-2.5">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="w-8 h-8 rounded-lg bg-bg-elevated border border-[#323232] flex items-center justify-center shrink-0">
                    <User size={15} className="text-text-muted" />
                  </div>
                  <div className="flex flex-col min-w-0">
                    <span className="text-sm font-bold text-text-bright truncate">
                      {parsedPreview.headers.name || 'Ім’я демо-героя'}
                    </span>
                    <span className="inline-flex items-center gap-1 text-[11px] text-text-muted truncate">
                      <MapPin size={11} className="shrink-0" />
                      <span className="truncate">
                        {parsedPreview.headers.location ||
                          passport.starting_locations[0] ||
                          'Стартова локація'}
                      </span>
                    </span>
                  </div>
                </div>

                <div className="flex flex-wrap items-center justify-end gap-1.5">
                  {parsedPreview.headerBadges.map((badge) => (
                    <div
                      key={badge.key}
                      className="flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[11px]"
                      style={{
                        backgroundColor: hexToRgba(badge.color, 0.14),
                        borderColor: hexToRgba(badge.color, 0.38),
                      }}
                    >
                      <DynamicLucideIcon
                        icon={badge.icon}
                        size={11}
                        style={{ color: badge.color }}
                      />
                      <span className="text-text-secondary">
                        {badge.label}:{' '}
                        <strong className="text-white font-semibold">{badge.value}</strong>
                      </span>
                    </div>
                  ))}

                  {parsedPreview.headers.overallState && (
                    <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[#2A1414]/70 border border-[#4A1818] text-[11px] text-danger-soft font-semibold">
                      <Heart size={11} className="text-danger shrink-0" />
                      <span>{parsedPreview.headers.overallState}</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Колонки шторки */}
              {parsedPreview.drawerColumns.length > 0 && (
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                  {parsedPreview.drawerColumns.map((section) => (
                    <div
                      key={section.path}
                      className="bg-bg-panel border border-border-default rounded-xl p-3 flex flex-col min-h-[140px]"
                    >
                      <DynamicSectionRenderer
                        section={section}
                        mode="read"
                        variant="column"
                      />
                    </div>
                  ))}
                </div>
              )}

              {/* Секції деталей */}
              {parsedPreview.detailSections.length > 0 && (
                <div className="bg-bg-panel border border-border-default rounded-xl p-3 space-y-3">
                  <div className="text-[10px] font-bold uppercase tracking-wider text-text-dim">
                    ДЕТАЛІ ЛИСТА (СПОЙЛЕР)
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {parsedPreview.detailSections.map((section) => (
                      <div
                        key={section.path}
                        className="bg-bg-app border border-bg-hover rounded-lg p-2.5"
                      >
                        <DynamicSectionRenderer
                          section={section}
                          mode="read"
                          variant="compact"
                        />
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* ПРАВА ПАНЕЛЬ: Конструктор секцій або Режим JSON */}
        <div className="w-[410px] lg:w-[440px] shrink-0 h-full bg-bg-deep border border-border-default rounded-xl p-4 flex flex-col gap-3 overflow-hidden shadow-lg">
          <div className="flex items-center justify-between gap-2 pb-2 border-b border-border-subtle shrink-0">
            <span className="text-[11px] font-bold uppercase tracking-wider text-text-muted">
              {isJsonMode ? 'РЕДАКТОР JSON-ШАБЛОНУ' : 'КОНСТРУКТОР СЕКЦІЙ'}
            </span>

            <Button
              type="button"
              variant={isJsonMode ? 'primary' : 'secondary'}
              size="sm"
              disabled={isBusy}
              onClick={handleToggleJsonMode}
            >
              {isJsonMode ? <Sliders size={12} /> : <Code2 size={12} />}
              <span>{isJsonMode ? 'Конструктор' : 'Режим JSON'}</span>
            </Button>
          </div>

          {isJsonMode ? (
            <div className="flex-1 flex flex-col gap-2.5 min-h-0">
              <Textarea
                value={rawJsonText}
                disabled={isBusy}
                onChange={(e) => {
                  setRawJsonText(e.target.value);
                  setJsonError(null);
                }}
                spellCheck={false}
                className="flex-1 font-mono p-3 resize-none overflow-y-auto"
              />

              <div
                className={`grid transition-all duration-200 ease-out shrink-0 ${
                  jsonError
                    ? 'grid-rows-[1fr] opacity-100'
                    : 'grid-rows-[0fr] opacity-0 -mt-2.5 pointer-events-none'
                }`}
              >
                <div className="min-h-0 overflow-hidden">
                  {jsonError && (
                    <div className="text-xs text-danger-soft bg-[#2A1215] border border-[#7F1D1D] rounded-lg px-3 py-2 break-words">
                      Помилка JSON: {jsonError}
                    </div>
                  )}
                </div>
              </div>

              <div
                className={`grid transition-all duration-200 ease-out shrink-0 ${
                  !jsonError && isJsonDirty
                    ? 'grid-rows-[1fr] opacity-100'
                    : 'grid-rows-[0fr] opacity-0 -mt-2.5 pointer-events-none'
                }`}
              >
                <div className="min-h-0 overflow-hidden">
                  {!jsonError && isJsonDirty && (
                    <div className="text-[11px] text-[#FCD34D] bg-[#291D0B] border border-[#78350F] rounded-lg px-3 py-1.5">
                      Є незастосовані зміни JSON — натисніть «Застосувати JSON».
                    </div>
                  )}
                </div>
              </div>

              <Button
                type="button"
                variant="primary"
                size="sm"
                disabled={isBusy}
                onClick={handleApplyJson}
                className="w-full justify-center shrink-0"
              >
                <Check size={13} />
                <span>Застосувати JSON</span>
              </Button>
            </div>
          ) : (
            <div className="flex-1 flex flex-col gap-2.5 min-h-0">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                disabled={isBusy}
                onClick={() => setIsAddSectionOpen(true)}
                className="w-full justify-center shrink-0"
              >
                <Plus size={13} />
                <span>Додати секцію</span>
              </Button>

              <div className="flex-1 overflow-y-auto space-y-2 pr-1 min-h-0">
                {parsedTemplateSections.length === 0 ? (
                  <div className="text-xs text-text-dim italic text-center py-8 px-3 border border-dashed border-border-default rounded-lg">
                    У шаблоні поки немає секцій. Згенеруйте шаблон з ШІ або додайте секцію вручну.
                  </div>
                ) : (
                  parsedTemplateSections.map((sec) => (
                    <div
                      key={sec.path}
                      className="flex items-center justify-between gap-2 bg-bg-panel border border-border-default rounded-lg p-2.5"
                    >
                      <div className="flex items-center gap-2.5 min-w-0 flex-1">
                        <div
                          className="w-7 h-7 rounded-md border flex items-center justify-center shrink-0"
                          style={{
                            backgroundColor: hexToRgba(sec.color, 0.14),
                            borderColor: hexToRgba(sec.color, 0.4),
                          }}
                        >
                          <DynamicLucideIcon
                            icon={sec.icon}
                            size={13}
                            style={{ color: sec.color }}
                          />
                        </div>

                        <div className="flex flex-col min-w-0 flex-1">
                          <span className="text-xs font-semibold text-text-bright truncate">
                            {sec.title}
                          </span>
                          <div className="flex flex-wrap items-center gap-1 mt-0.5">
                            <span className="text-[10px] font-mono text-text-dim truncate">
                              {sec.path}
                            </span>
                            <span className="px-1.5 py-0.2 rounded bg-[#202020] border border-[#2F2F2F] text-[10px] text-text-muted">
                              {sec.archetype}
                            </span>
                            <span className="px-1.5 py-0.2 rounded bg-[#202020] border border-[#2F2F2F] text-[10px] text-text-muted">
                              {PLACEMENT_LABELS[sec.placement] || sec.placement}
                            </span>
                          </div>
                        </div>
                      </div>

                      <button
                        type="button"
                        disabled={isBusy}
                        onClick={() => removeTemplateSection(sec.path)}
                        data-tooltip={`Видалити секцію «${sec.title}»`}
                        className="w-7 h-7 rounded flex items-center justify-center text-text-muted shrink-0 enabled:hover:text-danger enabled:hover:bg-accent-ruby-soft transition-colors enabled:cursor-pointer disabled:opacity-35 disabled:cursor-default"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Діалог конструктора нової секції */}
      <AddSectionDialog
        isOpen={isAddSectionOpen}
        onClose={() => setIsAddSectionOpen(false)}
        onAdd={(input) => addTemplateSection(input)}
      />
    </div>
  );
};
