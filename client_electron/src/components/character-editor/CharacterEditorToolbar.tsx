import React, { useRef } from 'react';
import { Download, RefreshCw, Upload } from 'lucide-react';

interface ToolbarActionButtonProps {
  disabled: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}

const ToolbarActionButton: React.FC<ToolbarActionButtonProps> = ({
  disabled,
  onClick,
  icon,
  label,
}) => (
  <button
    type="button"
    disabled={disabled}
    onClick={onClick}
    className="h-[34px] px-3 rounded-[8px] bg-bg-panel border border-border-strong text-xs font-medium text-text-primary inline-flex items-center gap-1.5 transition-all duration-150 enabled:hover:bg-bg-control enabled:hover:border-border-hover enabled:active:scale-[0.985] enabled:cursor-pointer disabled:opacity-50 disabled:cursor-default"
  >
    {icon}
    <span>{label}</span>
  </button>
);

interface CharacterEditorToolbarProps {
  isBusy: boolean;
  isPullingSchema: boolean;
  onPullWorldSchema: () => void;
  onExportJson: () => void;
  onImportJsonSelected: (e: React.ChangeEvent<HTMLInputElement>) => void;
}

/**
 * Верхній тулбар швидких дій редактора анкети: синхронізація схеми світу, експорт та імпорт JSON.
 */
export const CharacterEditorToolbar: React.FC<CharacterEditorToolbarProps> = ({
  isBusy,
  isPullingSchema,
  onPullWorldSchema,
  onExportJson,
  onImportJsonSelected,
}) => {
  const jsonImportRef = useRef<HTMLInputElement>(null);

  return (
    <div className="shrink-0 px-6 py-2.5 border-b border-border-subtle bg-[#151515] flex flex-wrap items-center gap-2">
      <ToolbarActionButton
        disabled={isBusy}
        onClick={onPullWorldSchema}
        icon={
          <RefreshCw
            size={13}
            className={`text-[#60A5FA] shrink-0 ${isPullingSchema ? 'animate-spin' : ''}`}
          />
        }
        label={isPullingSchema ? 'Перевірка...' : 'Підтягнути схему світу'}
      />

      <div className="ml-auto flex items-center gap-2">
        <ToolbarActionButton
          disabled={isBusy}
          onClick={onExportJson}
          icon={<Download size={13} className="text-text-muted shrink-0" />}
          label="Експорт JSON"
        />

        <ToolbarActionButton
          disabled={isBusy}
          onClick={() => jsonImportRef.current?.click()}
          icon={<Upload size={13} className="text-text-muted shrink-0" />}
          label="Імпорт JSON"
        />

        <input
          ref={jsonImportRef}
          type="file"
          accept=".json,application/json"
          onChange={onImportJsonSelected}
          className="hidden"
        />
      </div>
    </div>
  );
};
