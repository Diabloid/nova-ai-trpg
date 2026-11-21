import React from 'react';
import { Save, X } from 'lucide-react';
import type { PlayerState } from '../../types/api';
import { ConfirmModal } from '../ui/ConfirmModal';
import { Button } from '../ui/Button';
import { Modal } from '../ui/Modal';
import { AddSectionDialog } from './AddSectionDialog';
import { AvatarCropModal } from './AvatarCropModal';
import { CharacterEditorToolbar } from './CharacterEditorToolbar';
import { CharacterHeaderEditor } from './CharacterHeaderEditor';
import { CharacterSectionsPanel } from './CharacterSectionsPanel';
import { getConfirmModalConfig, useCharacterEditorDraft } from './useCharacterEditorDraft';

export type CharacterEditorMode = 'blueprint' | 'live_state';

export interface CharacterEditorModalProps {
  isOpen: boolean;
  mode: CharacterEditorMode;
  targetId: string | null;
  initialState: PlayerState | Record<string, any> | null;
  onClose: () => void;
  onSave: (targetId: string, updatedState: PlayerState) => Promise<void>;
}

const CharacterEditorContent: React.FC<{
  mode: CharacterEditorMode;
  targetId: string;
  initialState: PlayerState | Record<string, any>;
  onClose: () => void;
  onSave: (targetId: string, updatedState: PlayerState) => Promise<void>;
}> = ({ mode, targetId, initialState, onClose, onSave }) => {
  const {
    anchors,
    parsedSheet,
    worldLabel,
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
  } = useCharacterEditorDraft({ targetId, initialState, onClose, onSave });

  const isBlueprint = mode === 'blueprint';
  const confirmConfig = getConfirmModalConfig(confirmAction);

  return (
    <>
      <Modal
        isOpen
        onClose={handleCloseRequest}
        closeDisabled={isBusy || !!confirmAction || isAddSectionOpen || !!cropModalSrc}
        className="w-[820px] max-w-[95vw] h-[86vh] max-h-[820px] border-border-input gap-0 p-0 overflow-hidden"
      >
        <div className="shrink-0 px-6 py-4 border-b border-bg-hover bg-bg-card flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-accent-ruby shrink-0" />
              <h2 className="text-sm font-bold text-text-bright tracking-wider uppercase truncate">
                {isBlueprint ? 'РЕДАГУВАННЯ ЗАГОТОВКИ ГЕРОЯ' : 'РЕДАГУВАННЯ ЖИВОГО ЛИСТА КАМПАНІЇ'}
              </h2>
            </div>
            <p className="text-xs text-text-muted mt-1">
              {isBlueprint
                ? 'Зміни застосовуються до нових кампаній цього героя'
                : 'Зміни зберігаються лише в поточній пригоді (створюється snapshot)'}
            </p>
          </div>

          <button
            type="button"
            disabled={isBusy}
            onClick={handleCloseRequest}
            aria-label="Закрити студію"
            className="w-7 h-7 rounded-lg flex items-center justify-center text-text-muted border border-transparent enabled:hover:text-danger enabled:hover:bg-accent-ruby-soft enabled:hover:border-accent-ruby/60 enabled:cursor-pointer disabled:opacity-40 disabled:cursor-default transition-all shrink-0"
          >
            <X size={15} />
          </button>
        </div>

        <CharacterEditorToolbar
          isBusy={isBusy}
          isPullingSchema={isPullingSchema}
          onPullWorldSchema={() => {
            void handlePullWorldSchema();
          }}
          onExportJson={handleExportJson}
          onImportJsonSelected={(e) => {
            void handleImportJsonSelected(e);
          }}
        />

        <div className="flex-1 min-h-0 overflow-y-auto px-6 py-4 flex flex-col gap-4">
          <CharacterHeaderEditor
            anchors={anchors}
            isBusy={isBusy}
            isCompressingAvatar={isCompressingAvatar}
            isNameValid={isNameValid}
            worldLabel={worldLabel}
            sectionsCount={parsedSheet.allEditableSections.length}
            onHeaderPatch={handleHeaderPatch}
            onAvatarFileSelected={(e) => {
              void handleAvatarFileSelected(e);
            }}
            onOpenAvatarCrop={handleOpenAvatarCrop}
            onClearOriginalAvatarSrc={() => setOriginalAvatarSrc(null)}
          />

          <CharacterSectionsPanel
            sections={parsedSheet.allEditableSections}
            isBusy={isBusy}
            onOpenAddSection={() => setIsAddSectionOpen(true)}
            onRemoveSection={(path, title) =>
              setConfirmAction({ kind: 'delete_section', path, title })
            }
            onSectionValueChange={handleSectionValueChange}
            onFieldLabelChange={handleFieldLabelChange}
            onTranslateKeys={(keys) => {
              void handleTranslateKeys(keys);
            }}
          />
        </div>

        <div className="shrink-0 px-6 py-3.5 border-t border-bg-hover bg-bg-card flex items-center justify-between gap-3">
          <div className="relative flex items-center text-xs leading-4 font-medium">
            {isDirty ? (
              <>
                <span aria-hidden="true" className="absolute -left-2.5 text-danger font-bold">
                  *
                </span>
                <span className="text-danger-soft drop-shadow-[0_0_8px_rgba(239,68,68,0.28)]">
                  Є незбережені зміни
                </span>
              </>
            ) : (
              <span className="text-text-dim">Усі зміни збережено</span>
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
              disabled={isBusy || !isDirty || !isNameValid}
              isLoading={isSaving}
              onClick={() => {
                void handleSave();
              }}
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
          onConfirm={handleConfirm}
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
