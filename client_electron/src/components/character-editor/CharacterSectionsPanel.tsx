import React from 'react';
import { Plus, Trash2 } from 'lucide-react';
import type { ParsedSheetSection } from '../../types/game';
import type { TemplatePlacement } from '../../types/api';
import { DynamicSectionRenderer } from '../dynamic-sheet';
import { RUBY_BUTTON_SURFACE_CLASS } from '../ui/Button';

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

function getPlacementBadge(placement: TemplatePlacement): string {
  return PLACEMENT_LABELS[placement] || String(placement);
}

interface CharacterSectionsPanelProps {
  sections: ParsedSheetSection[];
  isBusy: boolean;
  onOpenAddSection: () => void;
  onRemoveSection: (path: string, title: string) => void;
  onSectionValueChange: (sectionPath: string, nextValue: any) => void;
  onFieldLabelChange: (rawKey: string, nextLabel: string) => void;
  onTranslateKeys: (keys: string[]) => void;
}

/**
 * Список динамічних секцій анкети персонажа з можливістю додавання, видалення та редагування.
 */
export const CharacterSectionsPanel: React.FC<CharacterSectionsPanelProps> = ({
  sections,
  isBusy,
  onOpenAddSection,
  onRemoveSection,
  onSectionValueChange,
  onFieldLabelChange,
  onTranslateKeys,
}) => {
  return (
    <>
      <div className="shrink-0 flex items-center justify-between gap-2 pt-1">
        <span className="text-[11px] font-bold tracking-wider uppercase text-text-muted">
          СЕКЦІЇ АНКЕТИ ({sections.length})
        </span>

        <button
          type="button"
          disabled={isBusy}
          onClick={onOpenAddSection}
          className={`h-[34px] px-3 rounded-[8px] text-xs font-semibold inline-flex items-center gap-1.5 transition-all duration-150 enabled:active:scale-[0.985] enabled:cursor-pointer disabled:opacity-50 disabled:cursor-default ${RUBY_BUTTON_SURFACE_CLASS}`}
        >
          <Plus size={13} className="shrink-0" />
          <span>Додати секцію / параметр</span>
        </button>
      </div>

      <div className="shrink-0 flex flex-col gap-3 pb-2">
        {sections.length === 0 ? (
          <div className="bg-bg-card border border-border-default rounded-lg p-6 text-center text-xs text-text-dim italic">
            Секції відсутні. Натисніть «Додати секцію / параметр» або «Підтягнути схему світу».
          </div>
        ) : (
          sections.map((section) => {
            const isProtected = PROTECTED_ROOT_SECTIONS.has(section.path);
            return (
              <div key={section.path} className="flex flex-col gap-1">
                <div className="flex items-center justify-between gap-2 px-1">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-[10px] font-mono text-text-dim truncate">
                      {section.path}
                    </span>
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-[#1B1B1B] border border-border-compact text-text-muted shrink-0">
                      {getPlacementBadge(section.placement)}
                    </span>
                  </div>

                  {!isProtected && (
                    <button
                      type="button"
                      disabled={isBusy}
                      onClick={() => onRemoveSection(section.path, section.title)}
                      data-tooltip={`Видалити секцію «${section.title}»`}
                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] text-text-muted enabled:hover:text-danger enabled:hover:bg-accent-ruby-soft enabled:cursor-pointer disabled:opacity-40 disabled:cursor-default transition-colors shrink-0"
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
                  onChange={(nextValue) => onSectionValueChange(section.path, nextValue)}
                  onFieldLabelChange={onFieldLabelChange}
                  onTranslateKeys={onTranslateKeys}
                />
              </div>
            );
          })
        )}
      </div>
    </>
  );
};
