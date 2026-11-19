import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  Crop,
  Download,
  ImagePlus,
  Loader2,
  Plus,
  RefreshCw,
  RotateCcw,
  Save,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import { worldsApi } from '../../api/worldsApi';
import { useGameStore } from '../../store/useGameStore';
import { RUBY_BUTTON_SURFACE_CLASS } from '../ui/Button';
import type { PlayerState, TemplatePlacement, WorldDetailResponse } from '../../types/api';
import { readAvatarFileAsDataUrl } from '../../utils/avatarUtils';
import {
  parseDynamicSheet,
  serializeDynamicSheet,
  setByPath,
} from '../../utils/dynamicSheetParser';
import {
  addCustomSectionToState,
  exportCharacterJson,
  parseAndValidateCharacterJson,
  pullMissingSectionsFromTemplate,
  removeSectionFromState,
  type AddSectionInput,
} from '../../utils/schemaMergeUtils';
import {
  applyFieldLabelUpdate,
  mergeFieldLabelsIntoState,
  resolveMissingFieldKeyLabels,
} from '../../utils/templateKeyTranslator';
import { ConfirmModal } from '../modals/ConfirmModal';
import { DynamicSectionRenderer } from '../dynamic-sheet';
import { Button } from '../ui/Button';
import { HeroAvatar } from '../ui/HeroAvatar';
import { STANDARD_FIELD_CLASS } from '../ui/Input';
import { Modal } from '../ui/Modal';
import { AddSectionDialog } from './AddSectionDialog';
import { AvatarCropModal } from './AvatarCropModal';
import { IconPicker } from './IconPicker';

export type CharacterEditorMode = 'blueprint' | 'live_state';

export interface CharacterEditorModalProps {
  isOpen: boolean;
  mode: CharacterEditorMode;
  targetId: string | null;
  initialState: PlayerState | Record<string, any> | null;
  onClose: () => void;
  onSave: (targetId: string, updatedState: PlayerState) => Promise<void>;
}

const PROTECTED_ROOT_SECTIONS = new Set([
  'meta.name',
  'meta.location',
  'meta.overall_state',
  'anatomy_and_health.overall_state',
]);

const PLACEMENT_LABELS: Record<string, string> = {
  drawer_column: 'Колонка шторки',
  details: 'Деталі',
  header_badge: 'Бейдж шапки',
};

function cloneStateSafe(raw: PlayerState | Record<string, any> | null): Record<string, any> {
  if (!raw || typeof raw !== 'object') {
    return { meta: { world_id: 'default_dark_fantasy', name: '' } };
  }
  try {
    return JSON.parse(JSON.stringify(raw)) as Record<string, any>;
  } catch {
    return { ...raw };
  }
}

function getPlacementBadge(placement: TemplatePlacement): string {
  return PLACEMENT_LABELS[placement] || String(placement);
}

type ConfirmAction =
  | { kind: 'discard_close' }
  | { kind: 'import_json'; importedState: PlayerState }
  | { kind: 'delete_section'; path: string; title: string };

const CharacterEditorContent: React.FC<{
  mode: CharacterEditorMode;
  targetId: string;
  initialState: PlayerState | Record<string, any>;
  onClose: () => void;
  onSave: (targetId: string, updatedState: PlayerState) => Promise<void>;
}> = ({ mode, targetId, initialState, onClose, onSave }) => {
  const setSystemAlert = useGameStore((s) => s.setSystemAlert);

  const [draftState, setDraftState] = useState<Record<string, any>>(() =>
    cloneStateSafe(initialState)
  );
  const [initialSnapshot] = useState<string>(() =>
    JSON.stringify(cloneStateSafe(initialState))
  );
  const [worldDetail, setWorldDetail] = useState<WorldDetailResponse | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isPullingSchema, setIsPullingSchema] = useState(false);
  const [isCompressingAvatar, setIsCompressingAvatar] = useState(false);
  const [originalAvatarSrc, setOriginalAvatarSrc] = useState<string | null>(null);
  const [cropModalSrc, setCropModalSrc] = useState<string | null>(null);
  const [isAddSectionOpen, setIsAddSectionOpen] = useState(false);
  const [confirmAction, setConfirmAction] = useState<ConfirmAction | null>(null);

  const avatarInputRef = useRef<HTMLInputElement>(null);
  const jsonImportRef = useRef<HTMLInputElement>(null);

  const worldId =
    (typeof draftState?.meta?.world_id === 'string' && draftState.meta.world_id.trim()) ||
    'default_dark_fantasy';

  // Підвантаження схеми світу у фоні для fallback/_schema_meta та швидкого pullMissingSectionsFromTemplate
  useEffect(() => {
    const controller = new AbortController();
    worldsApi
      .getWorld(worldId, { signal: controller.signal })
      .then((detail) => {
        setWorldDetail(detail);
      })
      .catch(() => {
        // Якщо бекенд недоступний або світ не знайдено, працюємо з локальною схемою драфту
      });
    return () => controller.abort();
  }, [worldId]);

  const parsedSheet = useMemo(
    () =>
      parseDynamicSheet(
        draftState,
        worldDetail?.character_template?._schema_meta || null
      ),
    [draftState, worldDetail]
  );

  const anchors = parsedSheet.headers;
  const isDirty = JSON.stringify(draftState) !== initialSnapshot;
  const isBusy = isSaving || isPullingSchema || isCompressingAvatar;
  const isNameValid = anchors.name.trim().length > 0;
  const isImageAvatar =
    typeof anchors.avatar === 'string' && anchors.avatar.trim().startsWith('data:image/');

  const isBlueprint = mode === 'blueprint';
  const modalTitle = isBlueprint
    ? 'РЕДАГУВАННЯ ЗАГОТОВКИ ГЕРОЯ'
    : 'РЕДАГУВАННЯ ЖИВОГО ЛИСТА КАМПАНІЇ';
  const modalSubtitle = isBlueprint
    ? 'Зміни застосовуються до нових кампаній цього героя'
    : 'Зміни зберігаються лише в поточній пригоді (створюється snapshot)';

  const handleCloseRequest = () => {
    if (isBusy) return;
    if (isDirty) {
      setConfirmAction({ kind: 'discard_close' });
      return;
    }
    onClose();
  };

  const handleHeaderPatch = (patch: {
    name?: string;
    location?: string;
    overallState?: string;
    avatar?: string;
  }) => {
    setDraftState((prev) => serializeDynamicSheet(prev, [], patch));
  };

  const handleSectionValueChange = (sectionPath: string, nextValue: any) => {
    setDraftState((prev) => {
      const next = cloneStateSafe(prev);
      setByPath(next, sectionPath, nextValue);
      return next;
    });
  };

  const handleFieldLabelChange = (rawKey: string, nextLabel: string) => {
    const schemaFallback = worldDetail?.character_template?._schema_meta || null;
    setDraftState((prev) => applyFieldLabelUpdate(prev, rawKey, nextLabel, schemaFallback));
  };

  const handleTranslateKeys = async (keys: string[]) => {
    const schemaFallback = worldDetail?.character_template?._schema_meta || null;
    const existingLabels = {
      ...(schemaFallback?.field_labels || {}),
      ...(draftState?._schema_meta?.field_labels || {}),
    };
    const translated = await resolveMissingFieldKeyLabels(keys, existingLabels);
    if (Object.keys(translated).length > 0) {
      setDraftState((prev) => mergeFieldLabelsIntoState(prev, translated, schemaFallback));
    }
  };

  const handleAddSection = (input: AddSectionInput) => {
    const schemaFallback = worldDetail?.character_template?._schema_meta || null;
    setDraftState((prev) => {
      const { nextState } = addCustomSectionToState(prev, input, schemaFallback);
      return nextState;
    });
    setSystemAlert(`Секцію «${input.title}» додано до анкети`, 'success');
  };

  const handleRemoveSection = (path: string, title: string) => {
    setConfirmAction({ kind: 'delete_section', path, title });
  };

  const handleAvatarFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    try {
      setIsCompressingAvatar(true);
      const rawDataUrl = await readAvatarFileAsDataUrl(file);
      setOriginalAvatarSrc(rawDataUrl);
      setCropModalSrc(rawDataUrl);
    } catch (err: any) {
      setSystemAlert(err?.message || 'Не вдалося прочитати зображення аватара', 'error');
    } finally {
      setIsCompressingAvatar(false);
    }
  };

  const handleOpenAvatarCrop = () => {
    const rawAvatar = typeof anchors.avatar === 'string' ? anchors.avatar.trim() : '';
    if (isBusy || !rawAvatar.startsWith('data:image/')) return;
    setCropModalSrc(originalAvatarSrc || rawAvatar);
  };

  const handlePullWorldSchema = async () => {
    if (isBusy) return;
    try {
      setIsPullingSchema(true);
      const detail = worldDetail || (await worldsApi.getWorld(worldId));
      setWorldDetail(detail);

      const { nextState, addedTitles } = pullMissingSectionsFromTemplate(
        draftState,
        detail.character_template
      );

      if (addedTitles.length > 0) {
        setDraftState(nextState);
        setSystemAlert(
          `Додано ${addedTitles.length} нові секції: ${addedTitles.join(', ')}`,
          'success'
        );
      } else {
        setSystemAlert('Усі секції схеми вже присутні', 'info');
      }
    } catch (err: any) {
      setSystemAlert(`Не вдалося підтягнути схему світу: ${err?.message || 'Помилка'}`, 'error');
    } finally {
      setIsPullingSchema(false);
    }
  };

  const handleExportJson = () => {
    const cleanState = serializeDynamicSheet(
      draftState,
      parsedSheet.allEditableSections,
      {
        name: anchors.name,
        location: anchors.location,
        overallState: anchors.overallState,
        avatar: anchors.avatar,
      }
    );
    exportCharacterJson(cleanState, anchors.name || targetId);
  };

  const handleImportJsonSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    try {
      const content = await file.text();
      const validated = parseAndValidateCharacterJson(content);
      setConfirmAction({ kind: 'import_json', importedState: validated });
    } catch (err: any) {
      setSystemAlert(err?.message || 'Помилка читання JSON-файлу', 'error');
    }
  };

  const handleSave = async () => {
    if (isBusy || !isNameValid) return;
    try {
      setIsSaving(true);
      const finalState = serializeDynamicSheet(
        draftState,
        parsedSheet.allEditableSections,
        {
          name: anchors.name.trim(),
          location: anchors.location,
          overallState: anchors.overallState,
          avatar: anchors.avatar,
        }
      );
      await onSave(targetId, finalState);
      onClose();
    } catch {
      // Алерт помилки показує екшен стору; модалка лишається відкритою
    } finally {
      setIsSaving(false);
    }
  };

  const currentAvatarIcon =
    anchors.avatar && !anchors.avatar.startsWith('data:image/')
      ? anchors.avatar
      : 'user';

  const confirmConfig = (() => {
    if (!confirmAction) return null;
    if (confirmAction.kind === 'discard_close') {
      return {
        title: 'СКАСУВАТИ НЕЗБЕРЕЖЕНІ ЗМІНИ?',
        message: 'Ви внесли зміни в лист персонажа. Закрити студію без збереження?',
        confirmText: 'Так, закрити',
        cancelText: 'Залишитися',
      };
    }
    if (confirmAction.kind === 'import_json') {
      return {
        title: 'ЗАМІНИТИ ДРАФТ З JSON?',
        message:
          'Поточний стан анкети в редакторі буде замінено даними з імпортованого JSON-файлу. Продовжити?',
        confirmText: 'Так, імпортувати',
        cancelText: 'Скасувати',
      };
    }
    return {
      title: 'ВИДАЛИТИ СЕКЦІЮ?',
      message: `Видалити секцію «${confirmAction.title}» та всі її дані з цієї анкети?`,
      confirmText: 'Так, видалити',
      cancelText: 'Залишити',
    };
  })();

  return (
    <>
      <Modal
        isOpen
        onClose={handleCloseRequest}
        closeDisabled={isBusy || !!confirmAction || isAddSectionOpen || !!cropModalSrc}
        className="w-[820px] max-w-[95vw] h-[86vh] max-h-[820px] border-[#333333] gap-0 p-0 overflow-hidden"
      >
        {/* 1. Шапка студії */}
        <div className="shrink-0 px-6 py-4 border-b border-[#242424] bg-[#141414] flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-[#7E0018] shrink-0" />
              <h2 className="text-sm font-bold text-[#F3F4F6] tracking-wider uppercase truncate">
                {modalTitle}
              </h2>
            </div>
            <p className="text-xs text-[#9CA3AF] mt-1">{modalSubtitle}</p>
          </div>

          <button
            type="button"
            disabled={isBusy}
            onClick={handleCloseRequest}
            aria-label="Закрити студію"
            className="w-7 h-7 rounded-lg flex items-center justify-center text-[#9CA3AF] border border-transparent enabled:hover:text-[#EF4444] enabled:hover:bg-[#2A1418] enabled:hover:border-[#7E0018]/60 enabled:cursor-pointer disabled:opacity-40 disabled:cursor-default transition-all shrink-0"
          >
            <X size={15} />
          </button>
        </div>

        {/* 2. Панель швидких дій (єдина висота h-[34px]) */}
        <div className="shrink-0 px-6 py-2.5 border-b border-[#222222] bg-[#151515] flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={isBusy}
            onClick={handlePullWorldSchema}
            className="h-[34px] px-3 rounded-[8px] bg-[#161616] border border-[#2A2A2A] text-xs font-medium text-[#E5E7EB] inline-flex items-center gap-1.5 transition-all duration-150 enabled:hover:bg-[#1E1E1E] enabled:hover:border-[#3E3E3E] enabled:active:scale-[0.985] enabled:cursor-pointer disabled:opacity-50 disabled:cursor-default"
          >
            <RefreshCw
              size={13}
              className={`text-[#60A5FA] shrink-0 ${isPullingSchema ? 'animate-spin' : ''}`}
            />
            <span>{isPullingSchema ? 'Перевірка...' : 'Підтягнути схему світу'}</span>
          </button>

          <div className="ml-auto flex items-center gap-2">
            <button
              type="button"
              disabled={isBusy}
              onClick={handleExportJson}
              className="h-[34px] px-3 rounded-[8px] bg-[#161616] border border-[#2A2A2A] text-xs font-medium text-[#E5E7EB] inline-flex items-center gap-1.5 transition-all duration-150 enabled:hover:bg-[#1E1E1E] enabled:hover:border-[#3E3E3E] enabled:active:scale-[0.985] enabled:cursor-pointer disabled:opacity-50 disabled:cursor-default"
            >
              <Download size={13} className="text-[#9CA3AF] shrink-0" />
              <span>Експорт JSON</span>
            </button>

            <button
              type="button"
              disabled={isBusy}
              onClick={() => jsonImportRef.current?.click()}
              className="h-[34px] px-3 rounded-[8px] bg-[#161616] border border-[#2A2A2A] text-xs font-medium text-[#E5E7EB] inline-flex items-center gap-1.5 transition-all duration-150 enabled:hover:bg-[#1E1E1E] enabled:hover:border-[#3E3E3E] enabled:active:scale-[0.985] enabled:cursor-pointer disabled:opacity-50 disabled:cursor-default"
            >
              <Upload size={13} className="text-[#9CA3AF] shrink-0" />
              <span>Імпорт JSON</span>
            </button>

            <input
              ref={jsonImportRef}
              type="file"
              accept=".json,application/json"
              onChange={handleImportJsonSelected}
              className="hidden"
            />
          </div>
        </div>

        {/* 3. Прокручуване тіло редактора */}
        <div className="flex-1 min-h-0 overflow-y-auto px-6 py-4 flex flex-col gap-4">
          {/* Блок Аватара та Якорів шапки */}
          <div className="shrink-0 bg-[#141414] border border-[#262626] rounded-xl p-4 flex flex-col sm:flex-row gap-4">
            {/* Ліва колонка: прев'ю + керування аватаром */}
            <div className="flex sm:flex-col items-center gap-3 shrink-0 sm:w-[176px]">
              {isImageAvatar ? (
                <button
                  type="button"
                  disabled={isBusy}
                  onClick={handleOpenAvatarCrop}
                  aria-label="Кадрувати аватар"
                  className="group relative rounded-xl outline-none enabled:cursor-pointer disabled:cursor-default shrink-0"
                >
                  <HeroAvatar
                    avatar={anchors.avatar}
                    name={anchors.name || 'Герой'}
                    iconSize={28}
                    iconClassName="text-[#9CA3AF]"
                    containerClassName="w-[76px] h-[76px] rounded-xl bg-[#111111] border-2 border-[#3A3A3A] group-enabled:group-hover:border-[#7E0018] shadow-inner transition-colors"
                  />
                  <div className="absolute inset-0 rounded-xl bg-black/65 opacity-0 group-enabled:group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center gap-0.5 text-white pointer-events-none">
                    <Crop size={14} className="text-[#60A5FA]" />
                    <span className="text-[10px] font-medium tracking-wide">Кадрувати</span>
                  </div>
                </button>
              ) : (
                <HeroAvatar
                  avatar={anchors.avatar}
                  name={anchors.name || 'Герой'}
                  iconSize={28}
                  iconClassName="text-[#9CA3AF]"
                  containerClassName="w-[76px] h-[76px] rounded-xl bg-[#111111] border-2 border-[#3A3A3A] shadow-inner"
                />
              )}

              <div className="flex flex-col gap-1.5 w-full">
                <button
                  type="button"
                  disabled={isBusy}
                  onClick={() => avatarInputRef.current?.click()}
                  className="h-[32px] w-full px-2.5 rounded-[7px] bg-[#1B1B1B] border border-[#2E2E2E] text-[11px] font-medium text-[#E5E7EB] inline-flex items-center justify-center gap-1.5 transition-all enabled:hover:bg-[#242424] enabled:hover:border-[#444444] enabled:active:scale-[0.98] enabled:cursor-pointer disabled:opacity-50 disabled:cursor-default"
                >
                  {isCompressingAvatar ? (
                    <Loader2 size={12} className="animate-spin shrink-0" />
                  ) : (
                    <ImagePlus size={12} className="text-[#60A5FA] shrink-0" />
                  )}
                  <span>Завантажити фото</span>
                </button>

                <IconPicker
                  value={currentAvatarIcon}
                  onChange={(iconKey) => {
                    setOriginalAvatarSrc(null);
                    handleHeaderPatch({ avatar: iconKey });
                  }}
                  label="Обрати іконку"
                  disabled={isBusy}
                />

                <button
                  type="button"
                  disabled={isBusy || !anchors.avatar}
                  onClick={() => {
                    setOriginalAvatarSrc(null);
                    handleHeaderPatch({ avatar: '' });
                  }}
                  className="h-[30px] w-full px-2.5 rounded-[7px] bg-[#161616] border border-[#262626] text-[11px] font-medium text-[#9CA3AF] inline-flex items-center justify-center gap-1.5 transition-all enabled:hover:text-[#EF4444] enabled:hover:bg-[#2A1418] enabled:hover:border-[#7E0018]/60 enabled:active:scale-[0.98] enabled:cursor-pointer disabled:opacity-40 disabled:cursor-default"
                >
                  <RotateCcw size={11} className="shrink-0" />
                  <span>Скинути</span>
                </button>

                <input
                  ref={avatarInputRef}
                  type="file"
                  accept=".png,.jpg,.jpeg,.webp,image/png,image/jpeg,image/webp"
                  onChange={handleAvatarFileSelected}
                  className="hidden"
                />
              </div>
            </div>

            {/* Права колонка: Ім'я, Локація, Загальний стан */}
            <div className="flex-1 min-w-0 grid grid-cols-1 gap-3">
              <div className="space-y-1">
                <label className="block text-xs text-[#9CA3AF]">
                  Ім&apos;я персонажа: <span className="text-[#EF4444]">*</span>
                </label>
                <input
                  type="text"
                  value={anchors.name}
                  onChange={(e) => handleHeaderPatch({ name: e.target.value })}
                  placeholder="Введіть ім'я героя..."
                  className={`w-full px-3 py-2 text-xs ${STANDARD_FIELD_CLASS}`}
                />
                <div
                  className={`grid transition-all duration-200 ease-out ${
                    !isNameValid
                      ? 'grid-rows-[1fr] opacity-100'
                      : 'grid-rows-[0fr] opacity-0 -mt-1 pointer-events-none'
                  }`}
                >
                  <div className="min-h-0 overflow-hidden">
                    <div className="flex items-center gap-1 text-[11px] text-[#EF4444]">
                      <AlertCircle size={11} className="shrink-0" />
                      <span>Ім&apos;я персонажа не може бути порожнім</span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="block text-xs text-[#9CA3AF]">Поточна локація:</label>
                  <input
                    type="text"
                    value={anchors.location}
                    onChange={(e) => handleHeaderPatch({ location: e.target.value })}
                    placeholder="Наприклад: Таверна на краю лісу"
                    className={`w-full px-3 py-2 text-xs ${STANDARD_FIELD_CLASS}`}
                  />
                </div>

                <div className="space-y-1">
                  <label className="block text-xs text-[#9CA3AF]">Загальний стан:</label>
                  <input
                    type="text"
                    value={anchors.overallState ?? ''}
                    onChange={(e) => handleHeaderPatch({ overallState: e.target.value })}
                    placeholder="Наприклад: Повний сил / Виснажений"
                    className={`w-full px-3 py-2 text-xs ${STANDARD_FIELD_CLASS}`}
                  />
                </div>
              </div>

              <div className="text-[11px] text-[#9CA3AF] flex flex-wrap items-center gap-2 pt-0.5">
                <span className="inline-flex items-center gap-1">
                  <span>Світ:</span>
                  <strong className="font-semibold text-[#E5E7EB]">
                    {worldDetail?.title || worldId}
                  </strong>
                </span>
                <span className="text-[#4B5563]">•</span>
                <span className="inline-flex items-center gap-1">
                  <span>Секцій у листі:</span>
                  <strong className="font-semibold text-[#E5E7EB]">
                    {parsedSheet.allEditableSections.length}
                  </strong>
                </span>
              </div>
            </div>
          </div>

          {/* Заголовок секцій + кнопка + Додати секцію / параметр */}
          <div className="shrink-0 flex items-center justify-between gap-2 pt-1">
            <span className="text-[11px] font-bold tracking-wider uppercase text-[#9CA3AF]">
              СЕКЦІЇ АНКЕТИ ({parsedSheet.allEditableSections.length})
            </span>

            <button
              type="button"
              disabled={isBusy}
              onClick={() => setIsAddSectionOpen(true)}
              className={`h-[34px] px-3 rounded-[8px] text-xs font-semibold inline-flex items-center gap-1.5 transition-all duration-150 enabled:active:scale-[0.985] enabled:cursor-pointer disabled:opacity-50 disabled:cursor-default ${RUBY_BUTTON_SURFACE_CLASS}`}
            >
              <Plus size={13} className="shrink-0" />
              <span>Додати секцію / параметр</span>
            </button>
          </div>

          {/* Динамічні секції */}
          <div className="shrink-0 flex flex-col gap-3 pb-2">
            {parsedSheet.allEditableSections.length === 0 ? (
              <div className="bg-[#141414] border border-[#262626] rounded-lg p-6 text-center text-xs text-[#6B7280] italic">
                Секції відсутні. Натисніть «Додати секцію / параметр» або «Підтягнути схему світу».
              </div>
            ) : (
              parsedSheet.allEditableSections.map((section) => {
                const isProtected = PROTECTED_ROOT_SECTIONS.has(section.path);
                return (
                  <div key={section.path} className="flex flex-col gap-1">
                    <div className="flex items-center justify-between gap-2 px-1">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="text-[10px] font-mono text-[#6B7280] truncate">
                          {section.path}
                        </span>
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-[#1B1B1B] border border-[#2B2B2B] text-[#9CA3AF] shrink-0">
                          {getPlacementBadge(section.placement)}
                        </span>
                      </div>

                      {!isProtected && (
                        <button
                          type="button"
                          disabled={isBusy}
                          onClick={() => handleRemoveSection(section.path, section.title)}
                          data-tooltip={`Видалити секцію «${section.title}»`}
                          className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] text-[#9CA3AF] enabled:hover:text-[#EF4444] enabled:hover:bg-[#2A1418] enabled:cursor-pointer disabled:opacity-40 disabled:cursor-default transition-colors shrink-0"
                        >
                          <Trash2 size={11} />
                          <span>Видалити секцію</span>
                        </button>
                      )}
                    </div>

                    <DynamicSectionRenderer
                      section={section}
                      mode="edit"
                      variant="compact"
                      onChange={(nextValue) =>
                        handleSectionValueChange(section.path, nextValue)
                      }
                      onFieldLabelChange={handleFieldLabelChange}
                      onTranslateKeys={(keys) => {
                        void handleTranslateKeys(keys);
                      }}
                    />
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* 4. Футер збереження */}
        <div className="shrink-0 px-6 py-3.5 border-t border-[#242424] bg-[#141414] flex items-center justify-between gap-3">
          <div className="relative flex items-center text-xs leading-4 font-medium">
            {isDirty ? (
              <>
                <span aria-hidden="true" className="absolute -left-2.5 text-[#EF4444] font-bold">
                  *
                </span>
                <span className="text-[#FCA5A5] drop-shadow-[0_0_8px_rgba(239,68,68,0.28)]">
                  Є незбережені зміни
                </span>
              </>
            ) : (
              <span className="text-[#6B7280]">Усі зміни збережено</span>
            )}
          </div>

          <div className="flex items-center gap-2.5">
            <Button
              type="button"
              variant="secondary"
              disabled={isBusy}
              onClick={handleCloseRequest}
              className="h-[34px] text-xs px-4"
            >
              Скасувати
            </Button>
            <Button
              type="button"
              variant="primary"
              disabled={isBusy || !isNameValid}
              isLoading={isSaving}
              onClick={handleSave}
              className="h-[34px] text-xs px-4 font-semibold"
            >
              {!isSaving && <Save size={13} />}
              <span>Зберегти</span>
            </Button>
          </div>
        </div>
      </Modal>

      <AddSectionDialog
        isOpen={isAddSectionOpen}
        onClose={() => setIsAddSectionOpen(false)}
        onAdd={handleAddSection}
      />

      <AvatarCropModal
        isOpen={Boolean(cropModalSrc)}
        imageSrc={cropModalSrc}
        onClose={() => setCropModalSrc(null)}
        onApply={(croppedDataUri) => {
          handleHeaderPatch({ avatar: croppedDataUri });
          setSystemAlert('Портрет кадрувано (256×256 WebP) і прикріплено', 'success');
        }}
      />

      {confirmConfig && (
        <ConfirmModal
          isOpen
          onClose={() => setConfirmAction(null)}
          onConfirm={() => {
            if (!confirmAction) return;
            if (confirmAction.kind === 'discard_close') {
              setConfirmAction(null);
              onClose();
            } else if (confirmAction.kind === 'import_json') {
              const imported = cloneStateSafe(confirmAction.importedState);
              if (!imported.meta || typeof imported.meta !== 'object') {
                imported.meta = {};
              }
              if (!imported.meta.world_id) {
                imported.meta.world_id = worldId;
              }
              setDraftState(imported);
              setConfirmAction(null);
              setSystemAlert('Дані з JSON-файлу завантажено в редактор', 'success');
            } else if (confirmAction.kind === 'delete_section') {
              const schemaFallback = worldDetail?.character_template?._schema_meta || null;
              setDraftState((prev) =>
                removeSectionFromState(prev, confirmAction.path, schemaFallback)
              );
              setConfirmAction(null);
            }
          }}
          title={confirmConfig.title}
          message={confirmConfig.message}
          confirmText={confirmConfig.confirmText}
          cancelText={confirmConfig.cancelText}
        />
      )}
    </>
  );
};

export const CharacterEditorModal: React.FC<CharacterEditorModalProps> = ({
  isOpen,
  mode,
  targetId,
  initialState,
  onClose,
  onSave,
}) => {
  if (!isOpen || !targetId || !initialState) return null;

  return (
    <CharacterEditorContent
      key={`${mode}:${targetId}`}
      mode={mode}
      targetId={targetId}
      initialState={initialState}
      onClose={onClose}
      onSave={onSave}
    />
  );
};
