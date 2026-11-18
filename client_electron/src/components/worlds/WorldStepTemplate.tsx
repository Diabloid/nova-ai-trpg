import React, { useMemo, useState } from 'react';
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
} from 'lucide-react';
import { useWorldStudioStore } from '../../store/useWorldStudioStore';
import { parseDynamicSheet } from '../../utils/dynamicSheetParser';
import { hexToRgba } from '../../utils/lucideIconMap';
import { AddSectionDialog } from '../character-editor/AddSectionDialog';
import { DynamicLucideIcon, DynamicSectionRenderer } from '../dynamic-sheet';
import { Button } from '../ui/Button';

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
  } = useWorldStudioStore();

  const [isAddSectionOpen, setIsAddSectionOpen] = useState(false);
  const [rawJsonText, setRawJsonText] = useState('');
  const [jsonError, setJsonError] = useState<string | null>(null);

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
      <div className="bg-[#111111] border border-[#262626] rounded-xl p-3.5 flex flex-col gap-2.5 shrink-0 shadow-md">
        <div className="flex flex-wrap items-center justify-between gap-2.5">
          <div className="flex items-center gap-2 min-w-0">
            <LayoutTemplate size={15} className="text-[#38BDF8] shrink-0" />
            <span className="text-xs font-semibold text-[#F3F4F6]">
              Унікальний шаблон анкети персонажа цього світу
            </span>
          </div>

          <Button
            type="button"
            variant="primary"
            size="sm"
            disabled={isBusy}
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
          <input
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
            className="flex-1 bg-[#161616] text-[#E5E7EB] text-xs rounded-lg px-3 py-2 border border-[#2D2D2D] placeholder-[#555555] focus:outline-none focus:border-[#7E0018] disabled:opacity-60"
          />
          <Button
            type="button"
            variant="secondary"
            size="sm"
            disabled={isBusy || !templateCustomInstruction.trim()}
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

        {templateSummaryNote && (
          <div className="text-[11px] text-[#9CA3AF] bg-[#161616] border border-[#262626] rounded-lg px-3 py-1.5 break-words">
            {templateSummaryNote}
          </div>
        )}
      </div>

      {/* 2. Спліт: Ліворуч живе прев'ю анкети з демо-даними, Праворуч конструктор / JSON */}
      <div className="flex-1 flex gap-4 min-h-0 overflow-hidden">
        {/* ЛІВА ПАНЕЛЬ: Живе візуальне прев'ю */}
        <div className="flex-1 min-w-0 h-full bg-[#111111] border border-[#262626] rounded-xl p-4 flex flex-col gap-3 overflow-hidden shadow-lg">
          <div className="flex items-center justify-between gap-2 pb-2 border-b border-[#222222] shrink-0">
            <span className="text-[11px] font-bold uppercase tracking-wider text-[#9CA3AF]">
              ЖИВЕ ПРЕВ’Ю АНКЕТИ ГЕРОЯ
            </span>
            <span className="text-[11px] text-[#6B7280]">
              {demoState && Object.keys(demoState).length > 0
                ? 'Із демо-даними ШІ'
                : 'Структура шаблону'}
            </span>
          </div>

          {!hasTemplate ? (
            <div className="flex-1 flex flex-col items-center justify-center text-center px-6 text-[#6B7280]">
              <LayoutTemplate size={28} className="mb-2 text-[#4B5563]" />
              <span className="text-sm font-medium text-[#9CA3AF]">
                Шаблон анкети ще не сформовано
              </span>
              <span className="text-xs mt-1 max-w-md">
                Натисніть «Згенерувати шаблон і демо-дані з ШІ» або додайте секції вручну у конструкторі праворуч.
              </span>
            </div>
          ) : (
            <div className="flex-1 overflow-y-auto pr-1 space-y-3 min-h-0">
              {/* Прев'ю верхньої шапки з header_badge */}
              <div className="bg-[#181818] border border-[#2C2C2C] rounded-xl p-3 flex flex-wrap items-center justify-between gap-2.5">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="w-8 h-8 rounded-lg bg-[#222222] border border-[#323232] flex items-center justify-center shrink-0">
                    <User size={15} className="text-[#9CA3AF]" />
                  </div>
                  <div className="flex flex-col min-w-0">
                    <span className="text-sm font-bold text-[#F3F4F6] truncate">
                      {parsedPreview.headers.name || 'Ім’я демо-героя'}
                    </span>
                    <span className="inline-flex items-center gap-1 text-[11px] text-[#9CA3AF] truncate">
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
                      <span className="text-[#D1D5DB]">
                        {badge.label}:{' '}
                        <strong className="text-white font-semibold">{badge.value}</strong>
                      </span>
                    </div>
                  ))}

                  {parsedPreview.headers.overallState && (
                    <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[#2A1414]/70 border border-[#4A1818] text-[11px] text-[#FCA5A5] font-semibold">
                      <Heart size={11} className="text-[#EF4444] shrink-0" />
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
                      className="bg-[#161616] border border-[#262626] rounded-xl p-3 flex flex-col min-h-[140px]"
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
                <div className="bg-[#161616] border border-[#262626] rounded-xl p-3 space-y-3">
                  <div className="text-[10px] font-bold uppercase tracking-wider text-[#6B7280]">
                    ДЕТАЛІ ЛИСТА (СПОЙЛЕР)
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {parsedPreview.detailSections.map((section) => (
                      <div
                        key={section.path}
                        className="bg-[#121212] border border-[#242424] rounded-lg p-2.5"
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
        <div className="w-[410px] lg:w-[440px] shrink-0 h-full bg-[#111111] border border-[#262626] rounded-xl p-4 flex flex-col gap-3 overflow-hidden shadow-lg">
          <div className="flex items-center justify-between gap-2 pb-2 border-b border-[#222222] shrink-0">
            <span className="text-[11px] font-bold uppercase tracking-wider text-[#9CA3AF]">
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
              <textarea
                value={rawJsonText}
                disabled={isBusy}
                onChange={(e) => {
                  setRawJsonText(e.target.value);
                  setJsonError(null);
                }}
                spellCheck={false}
                className="flex-1 w-full bg-[#161616] text-[#E5E7EB] text-xs font-mono leading-relaxed rounded-lg p-3 border border-[#303030] focus:outline-none focus:border-[#7E0018] resize-none overflow-y-auto disabled:opacity-60"
              />

              {jsonError && (
                <div className="text-xs text-[#FCA5A5] bg-[#2A1215] border border-[#7F1D1D] rounded-lg px-3 py-2 break-words shrink-0">
                  Помилка JSON: {jsonError}
                </div>
              )}

              {!jsonError && isJsonDirty && (
                <div className="text-[11px] text-[#FCD34D] bg-[#291D0B] border border-[#78350F] rounded-lg px-3 py-1.5 shrink-0">
                  Є незастосовані зміни JSON — натисніть «Застосувати JSON».
                </div>
              )}

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
                  <div className="text-xs text-[#6B7280] italic text-center py-8 px-3 border border-dashed border-[#262626] rounded-lg">
                    У шаблоні поки немає секцій. Згенеруйте шаблон з ШІ або додайте секцію вручну.
                  </div>
                ) : (
                  parsedTemplateSections.map((sec) => (
                    <div
                      key={sec.path}
                      className="flex items-center justify-between gap-2 bg-[#161616] border border-[#262626] rounded-lg p-2.5"
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
                          <span className="text-xs font-semibold text-[#F3F4F6] truncate">
                            {sec.title}
                          </span>
                          <div className="flex flex-wrap items-center gap-1 mt-0.5">
                            <span className="text-[10px] font-mono text-[#6B7280] truncate">
                              {sec.path}
                            </span>
                            <span className="px-1.5 py-0.2 rounded bg-[#202020] border border-[#2F2F2F] text-[10px] text-[#9CA3AF]">
                              {sec.archetype}
                            </span>
                            <span className="px-1.5 py-0.2 rounded bg-[#202020] border border-[#2F2F2F] text-[10px] text-[#9CA3AF]">
                              {PLACEMENT_LABELS[sec.placement] || sec.placement}
                            </span>
                          </div>
                        </div>
                      </div>

                      <button
                        type="button"
                        disabled={isBusy}
                        onClick={() => removeTemplateSection(sec.path)}
                        title={`Видалити секцію «${sec.title}»`}
                        className="w-7 h-7 rounded flex items-center justify-center text-[#9CA3AF] shrink-0 enabled:hover:text-[#EF4444] enabled:hover:bg-[#2A1418] transition-colors enabled:cursor-pointer disabled:opacity-35 disabled:cursor-default"
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
