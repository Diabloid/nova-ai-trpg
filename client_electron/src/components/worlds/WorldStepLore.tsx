import React, { useMemo, useRef, useState } from 'react';
import {
  BookOpen,
  FileText,
  Loader2,
  Plus,
  Save,
  Sparkles,
  Trash2,
  Upload,
  Wand2,
  X,
} from 'lucide-react';
import { useGameStore } from '../../store/useGameStore';
import { useWorldStudioStore } from '../../store/useWorldStudioStore';
import { estimateLoreStats } from '../../utils/loreFileUtils';
import { Button } from '../ui/Button';
import { COMPACT_FIELD_CLASS, STANDARD_FIELD_CLASS } from '../ui/Input';

export const WorldStepLore: React.FC = () => {
  const {
    mode,
    loreArticles,
    selectedLoreFilename,
    dirtyLoreFilenames,
    loreGenProgress,
    isMutatingLore,
    isLoadingWorld,
    setSelectedLoreFilename,
    updateLoreArticleLocal,
    saveLoreArticleRemote,
    createManualLoreArticle,
    createAiLoreArticle,
    generateStarterLore,
    expandLoreArticle,
    importLoreFile,
    deleteLoreArticleItem,
  } = useWorldStudioStore();

  const [isNewFormOpen, setIsNewFormOpen] = useState(false);
  const [newArticleTopic, setNewArticleTopic] = useState('');
  const [expandInstruction, setExpandInstruction] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const stats = useMemo(() => estimateLoreStats(loreArticles), [loreArticles]);

  const selectedArticle = useMemo(
    () =>
      loreArticles.find((art) => art.filename === selectedLoreFilename) ||
      loreArticles[0] ||
      null,
    [loreArticles, selectedLoreFilename]
  );

  const backendOffline = useGameStore((s) => s.backendOffline);
  const isBusy = Boolean(loreGenProgress?.active) || isMutatingLore || isLoadingWorld;
  const isRemoteLocked = mode === 'edit' && backendOffline;
  const isSelectedDirty =
    Boolean(selectedArticle) &&
    dirtyLoreFilenames.includes(selectedArticle?.filename || '');

  // Світлофор бюджету лору (< 80 КБ зелений, 80–120 КБ жовтий, > 120 КБ червоний)
  const budgetConfig =
    stats.totalKb > 120
      ? {
          barClass: 'bg-[#EF4444]',
          textClass: 'text-[#FCA5A5]',
          badgeClass: 'bg-[#2A1215] border-[#7F1D1D] text-[#FCA5A5]',
          label: 'Перевищено рекомендований обсяг',
        }
      : stats.totalKb >= 80
        ? {
            barClass: 'bg-[#F59E0B]',
            textClass: 'text-[#FCD34D]',
            badgeClass: 'bg-[#291D0B] border-[#78350F] text-[#FCD34D]',
            label: 'Помітне навантаження на контекст',
          }
        : {
            barClass: 'bg-[#10B981]',
            textClass: 'text-[#6EE7B7]',
            badgeClass: 'bg-[#0F241D] border-[#065F46] text-[#6EE7B7]',
            label: 'Оптимальний бюджет',
          };

  const progressWidth = `${Math.min(100, Math.round((stats.totalKb / 120) * 100))}%`;

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    for (const file of Array.from(files)) {
      await importLoreFile(file);
    }
    e.target.value = '';
  };

  const handleCreateManual = async () => {
    if (!newArticleTopic.trim()) return;
    await createManualLoreArticle(newArticleTopic);
    setNewArticleTopic('');
    setIsNewFormOpen(false);
  };

  const handleCreateAi = async () => {
    if (!newArticleTopic.trim()) return;
    await createAiLoreArticle(newArticleTopic);
    setNewArticleTopic('');
    setIsNewFormOpen(false);
  };

  const handleExpand = async () => {
    if (!selectedArticle || !expandInstruction.trim()) return;
    await expandLoreArticle(selectedArticle.filename, expandInstruction);
    setExpandInstruction('');
  };

  return (
    <div className="flex-1 flex flex-col gap-3 min-h-0 overflow-hidden">
      {/* 1. Верхня панель: Бюджет лору + кнопка генерації 5 статей + живий прогрес */}
      <div className="bg-[#111111] border border-[#262626] rounded-xl p-3.5 flex flex-col gap-2.5 shrink-0 shadow-md">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2.5 min-w-0">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-[#F3F4F6]">
              <BookOpen size={14} className="text-[#C084FC] shrink-0" />
              <span>
                Лор: {stats.totalKb.toFixed(1)} / 120 КБ (~{stats.estTokens.toLocaleString('uk-UA')} токенів)
              </span>
            </div>

            <span
              className={`px-2 py-0.5 rounded-full border text-[11px] font-medium ${budgetConfig.badgeClass}`}
            >
              {budgetConfig.label}
            </span>
          </div>

          <Button
            type="button"
            variant="primary"
            size="sm"
            disabled={isBusy || backendOffline}
            isLoading={Boolean(loreGenProgress?.active)}
            onClick={() => {
              void generateStarterLore();
            }}
          >
            <Sparkles size={13} />
            <span>Згенерувати 5 стартових статей</span>
          </Button>
        </div>

        {/* Шкала бюджету */}
        <div className="w-full h-1.5 rounded-full bg-[#1C1C1C] overflow-hidden">
          <div
            className={`h-full transition-all duration-300 ${budgetConfig.barClass}`}
            style={{ width: progressWidth }}
          />
        </div>

        {/* Живий прогрес покрокової генерації 1/5..5/5 */}
        {loreGenProgress?.active && (
          <div className="flex items-center justify-between gap-3 px-3 py-2 rounded-lg bg-[#1A1221] border border-[#581C87]/60 text-xs text-[#E9D5FF]">
            <div className="flex items-center gap-2 min-w-0">
              <Loader2 size={14} className="animate-spin text-[#C084FC] shrink-0" />
              <span className="truncate font-medium">
                {loreGenProgress.current > 0
                  ? `Генерація статті ${loreGenProgress.current} з ${loreGenProgress.total}: ${loreGenProgress.currentTitle}`
                  : loreGenProgress.currentTitle}
              </span>
            </div>
            <span className="text-[11px] font-mono text-[#C084FC] shrink-0">
              {loreGenProgress.current}/{loreGenProgress.total}
            </span>
          </div>
        )}
      </div>

      {/* 2. Двоколонковий редактор: зліва список статей, справа редактор + AI-розширення */}
      <div className="flex-1 flex gap-4 min-h-0 overflow-hidden">
        {/* ЛІВА КОЛОНКА: Список статей та завантаження .md / .txt */}
        <div className="w-[320px] shrink-0 h-full bg-[#111111] border border-[#262626] rounded-xl p-3 flex flex-col gap-2.5 overflow-hidden shadow-lg">
          <div className="grid grid-cols-2 gap-2 shrink-0">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              disabled={isBusy}
              onClick={() => setIsNewFormOpen((prev) => !prev)}
              className="justify-center text-[11px] py-1.5"
            >
              <Plus size={12} />
              <span>Нова стаття</span>
            </Button>

            <Button
              type="button"
              variant="secondary"
              size="sm"
              disabled={isBusy || isRemoteLocked}
              onClick={() => fileInputRef.current?.click()}
              className="justify-center text-[11px] py-1.5"
            >
              <Upload size={12} />
              <span>Завантажити .md/.txt</span>
            </Button>

            <input
              ref={fileInputRef}
              type="file"
              accept=".md,.txt"
              multiple
              onChange={(e) => {
                void handleFileChange(e);
              }}
              className="hidden"
            />
          </div>

          {/* Інлайн-форма створення нової статті (двосторонній плавний CSS-перехід) */}
          <div
            aria-hidden={!isNewFormOpen}
            className={`grid transition-all duration-200 ease-out shrink-0 ${
              isNewFormOpen
                ? 'grid-rows-[1fr] opacity-100 visible'
                : 'grid-rows-[0fr] opacity-0 -mt-2.5 invisible pointer-events-none'
            }`}
          >
            <div className="min-h-0 overflow-hidden">
              <div className="bg-[#161616] border border-[#2E2E2E] rounded-lg p-2.5 flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-semibold text-[#D1D5DB]">
                    Тема або назва статті
                  </span>
                  <button
                    type="button"
                    onClick={() => setIsNewFormOpen(false)}
                    aria-label="Закрити форму нової статті"
                    className="w-5 h-5 rounded flex items-center justify-center text-[#9CA3AF] enabled:hover:text-[#EF4444] enabled:hover:bg-[#2A1418] transition-colors enabled:cursor-pointer"
                  >
                    <X size={12} />
                  </button>
                </div>
                <input
                  type="text"
                  value={newArticleTopic}
                  disabled={isBusy}
                  onChange={(e) => setNewArticleTopic(e.target.value)}
                  placeholder="Напр.: Підпільні кібер-клініки та валюта"
                  className={`w-full text-xs px-2.5 py-1.5 ${COMPACT_FIELD_CLASS}`}
                />
                <div className="grid grid-cols-2 gap-1.5">
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    disabled={isBusy || isRemoteLocked || !newArticleTopic.trim()}
                    onClick={() => {
                      void handleCreateManual();
                    }}
                    className="justify-center text-[11px]"
                  >
                    Вручну
                  </Button>
                  <Button
                    type="button"
                    variant="primary"
                    size="sm"
                    disabled={isBusy || backendOffline || !newArticleTopic.trim()}
                    onClick={() => {
                      void handleCreateAi();
                    }}
                    className="justify-center text-[11px]"
                  >
                    <Wand2 size={11} />
                    <span>З ШІ</span>
                  </Button>
                </div>
              </div>
            </div>
          </div>

          {/* Список статей */}
          <div className="flex-1 overflow-y-auto space-y-1.5 pr-1 min-h-0">
            {loreArticles.length === 0 ? (
              <div className="text-xs text-[#6B7280] italic text-center py-8 px-3 border border-dashed border-[#262626] rounded-lg">
                База лору порожня. Натисніть «Згенерувати 5 стартових статей» або завантажте власні .md / .txt файли.
              </div>
            ) : (
              loreArticles.map((art) => {
                const isActive = selectedArticle?.filename === art.filename;
                const isArtDirty = dirtyLoreFilenames.includes(art.filename);
                const sizeKb = (new TextEncoder().encode(art.content || '').byteLength / 1024).toFixed(1);

                return (
                  <div
                    key={art.filename}
                    className={`flex items-center gap-1.5 rounded-lg border px-2 py-1.5 transition-colors ${
                      isActive
                        ? 'bg-[#211216] border-[#7E0018]/70 text-white'
                        : 'bg-[#161616] border-[#262626] hover:bg-[#1C1C1C] text-[#E5E7EB]'
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => setSelectedLoreFilename(art.filename)}
                      className="flex items-center gap-2 min-w-0 flex-1 text-left enabled:cursor-pointer"
                    >
                      <FileText
                        size={13}
                        className={isActive ? 'text-[#FCA5A5] shrink-0' : 'text-[#9CA3AF] shrink-0'}
                      />
                      <div className="flex flex-col min-w-0 flex-1">
                        <span className="text-xs font-semibold truncate flex items-center gap-1.5">
                          <span className="truncate">{art.title || art.filename}</span>
                          <span
                            data-tooltip={isArtDirty ? 'Незбережені зміни статті' : undefined}
                            className={`h-1.5 rounded-full bg-[#F59E0B] shrink-0 transition-all duration-200 ${
                              isArtDirty
                                ? 'w-1.5 opacity-100 scale-100'
                                : 'w-0 opacity-0 scale-0 pointer-events-none'
                            }`}
                          />
                        </span>
                        <span className="text-[10px] text-[#9CA3AF] truncate">
                          {art.filename} • {sizeKb} КБ
                        </span>
                      </div>
                    </button>

                    <button
                      type="button"
                      disabled={isBusy || isRemoteLocked}
                      onClick={() => {
                        void deleteLoreArticleItem(art.filename);
                      }}
                      aria-label={`Видалити статтю «${art.title}»`}
                      className="w-6 h-6 rounded flex items-center justify-center text-[#9CA3AF] shrink-0 enabled:hover:text-[#EF4444] enabled:hover:bg-[#2A1418] transition-colors enabled:cursor-pointer disabled:opacity-35 disabled:cursor-default"
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* ПРАВА КОЛОНКА: Редактор вибраної статті та AI expand_article */}
        <div className="flex-1 min-w-0 h-full bg-[#111111] border border-[#262626] rounded-xl p-4 flex flex-col gap-3 overflow-hidden shadow-lg">
          {!selectedArticle ? (
            <div className="flex-1 flex flex-col items-center justify-center text-center text-[#6B7280] px-6">
              <FileText size={28} className="mb-2 text-[#4B5563]" />
              <span className="text-sm font-medium text-[#9CA3AF]">
                Оберіть або створіть статтю лору
              </span>
              <span className="text-xs mt-1 max-w-md">
                Статті лору формують канон вашого світу й автоматично підтягуються до контексту ШІ Оповідача.
              </span>
            </div>
          ) : (
            <>
              {/* Шапка редактора: Заголовок + Ім'я файлу + Кнопка зберегти (у режимі edit) */}
              <div className="flex flex-wrap items-center justify-between gap-2.5 pb-2.5 border-b border-[#222222] shrink-0">
                <div className="flex items-center gap-2 min-w-0 flex-1">
                  <input
                    type="text"
                    value={selectedArticle.title}
                    disabled={isBusy}
                    onChange={(e) =>
                      updateLoreArticleLocal(selectedArticle.filename, {
                        title: e.target.value,
                      })
                    }
                    placeholder="Заголовок статті"
                    className={`flex-1 min-w-[180px] text-sm font-bold text-[#F3F4F6] px-3 py-1.5 ${STANDARD_FIELD_CLASS}`}
                  />
                  <span className="px-2 py-1 rounded bg-[#181818] border border-[#2A2A2A] text-[11px] font-mono text-[#9CA3AF] shrink-0">
                    {selectedArticle.filename}
                  </span>
                </div>

                {mode === 'edit' && (
                  <Button
                    type="button"
                    variant={isSelectedDirty ? 'primary' : 'secondary'}
                    size="sm"
                    disabled={isBusy || backendOffline || !isSelectedDirty}
                    onClick={() => {
                      void saveLoreArticleRemote(selectedArticle.filename);
                    }}
                    className="shrink-0"
                  >
                    <Save size={12} />
                    <span>{isSelectedDirty ? 'Зберегти статтю' : 'Збережено'}</span>
                  </Button>
                )}
              </div>

              {/* Рядок AI-інструкції expand_article */}
              <div className="flex items-center gap-2 shrink-0">
                <input
                  type="text"
                  value={expandInstruction}
                  disabled={isBusy || backendOffline}
                  onChange={(e) => setExpandInstruction(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      void handleExpand();
                    }
                  }}
                  placeholder={
                    backendOffline
                      ? 'Сервер офлайн — ШІ-редагування недоступне...'
                      : 'Інструкція для ШІ: напр. «Допиши розділ про місцеві фракції, валюту й заборонені технології»...'
                  }
                  className={`flex-1 text-xs px-3 py-2 ${STANDARD_FIELD_CLASS}`}
                />
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  disabled={isBusy || backendOffline || !expandInstruction.trim()}
                  isLoading={isMutatingLore}
                  onClick={() => {
                    void handleExpand();
                  }}
                  className="shrink-0"
                >
                  <Wand2 size={12} className="text-[#C084FC]" />
                  <span>Доповнити / переписати статтю</span>
                </Button>
              </div>

              {/* Markdown-редактор тексту */}
              <textarea
                value={selectedArticle.content}
                disabled={isBusy}
                onChange={(e) =>
                  updateLoreArticleLocal(selectedArticle.filename, {
                    content: e.target.value,
                  })
                }
                placeholder="Вміст статті у форматі Markdown або звичайного тексту..."
                className={`flex-1 min-h-[200px] w-full text-xs leading-relaxed font-mono p-3.5 resize-none overflow-y-auto ${STANDARD_FIELD_CLASS}`}
              />
            </>
          )}
        </div>
      </div>
    </div>
  );
};
