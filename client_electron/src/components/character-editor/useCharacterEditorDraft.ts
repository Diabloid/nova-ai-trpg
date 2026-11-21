import { useEffect, useMemo, useState } from 'react';
import { worldsApi } from '../../api/worldsApi';
import { useGameStore } from '../../store/useGameStore';
import type { PlayerState, WorldDetailResponse } from '../../types/api';
import { readAvatarFileAsDataUrl } from '../../utils/avatarUtils';
import {
  parseDynamicSheet,
  serializeDynamicSheet,
  setByPath,
} from '../../utils/dynamicSheet';
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
import type { CharacterHeaderAnchors } from './CharacterHeaderEditor';

export type ConfirmAction =
  | { kind: 'discard_close' }
  | { kind: 'import_json'; importedState: PlayerState }
  | { kind: 'delete_section'; path: string; title: string };

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

export function getConfirmModalConfig(action: ConfirmAction | null) {
  if (!action) return null;
  if (action.kind === 'discard_close') {
    return {
      title: 'СКАСУВАТИ НЕЗБЕРЕЖЕНІ ЗМІНИ?',
      message: 'Ви внесли зміни в лист персонажа. Закрити студію без збереження?',
      confirmText: 'Так, закрити',
      cancelText: 'Залишитися',
    };
  }
  if (action.kind === 'import_json') {
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
    message: `Видалити секцію «${action.title}» та всі її дані з цієї анкети?`,
    confirmText: 'Так, видалити',
    cancelText: 'Залишити',
  };
}

interface UseCharacterEditorDraftParams {
  targetId: string;
  initialState: PlayerState | Record<string, any>;
  onClose: () => void;
  onSave: (targetId: string, updatedState: PlayerState) => Promise<void>;
}

export function useCharacterEditorDraft({
  targetId,
  initialState,
  onClose,
  onSave,
}: UseCharacterEditorDraftParams) {
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

  const worldId =
    (typeof draftState?.meta?.world_id === 'string' && draftState.meta.world_id.trim()) ||
    'default_dark_fantasy';

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

  const handleCloseRequest = () => {
    if (isBusy) return;
    if (isDirty) {
      setConfirmAction({ kind: 'discard_close' });
      return;
    }
    onClose();
  };

  const handleHeaderPatch = (patch: Partial<CharacterHeaderAnchors>) => {
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
    setDraftState((prev) => addCustomSectionToState(prev, input, schemaFallback).nextState);
    setSystemAlert(`Секцію «${input.title}» додано до анкети`, 'success');
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
    if (isBusy || !isDirty || !isNameValid) return;
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

  const handleConfirm = () => {
    if (!confirmAction) return;
    if (confirmAction.kind === 'discard_close') {
      setConfirmAction(null);
      onClose();
      return;
    }
    if (confirmAction.kind === 'import_json') {
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
      return;
    }
    const schemaFallback = worldDetail?.character_template?._schema_meta || null;
    setDraftState((prev) =>
      removeSectionFromState(prev, confirmAction.path, schemaFallback)
    );
    setConfirmAction(null);
  };

  return {
    anchors,
    parsedSheet,
    worldLabel: worldDetail?.title || worldId,
    isDirty,
    isBusy,
    isSaving,
    isPullingSchema,
    isCompressingAvatar,
    isNameValid,
    cropModalSrc,
    setCropModalSrc,
    isAddSectionOpen,
    setIsAddSectionOpen,
    confirmAction,
    setConfirmAction,
    setOriginalAvatarSrc,
    setSystemAlert,
    handleCloseRequest,
    handleHeaderPatch,
    handleSectionValueChange,
    handleFieldLabelChange,
    handleTranslateKeys,
    handleAddSection,
    handleAvatarFileSelected,
    handleOpenAvatarCrop,
    handlePullWorldSchema,
    handleExportJson,
    handleImportJsonSelected,
    handleSave,
    handleConfirm,
  };
}
