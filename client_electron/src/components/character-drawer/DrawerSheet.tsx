import React, { useMemo } from 'react';
import { Edit3, Heart } from 'lucide-react';
import { useGameStore } from '../../store/useGameStore';
import type { ParsedSheetSection } from '../../types/game';
import { parseDynamicSheet } from '../../utils/dynamicSheet';
import { DynamicSectionRenderer } from '../dynamic-sheet';
import { DrawerDetails } from './DrawerDetails';

interface DrawerSheetProps {
  onEditLiveSheet?: () => void;
}

function getDrawerGridClass(columns: ParsedSheetSection[]): string {
  const count = columns.length;
  if (count <= 1) return 'grid-cols-1';
  if (count === 2) return 'grid-cols-1 md:grid-cols-2';
  if (count === 3) return 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3';
  if (count === 4) {
    const isClassicLayout =
      columns[0]?.path === 'anatomy_and_health.injuries' &&
      columns[1]?.path === 'storage_and_equipment.worn' &&
      columns[2]?.path === 'abilities' &&
      columns[3]?.path === 'storage_and_equipment.containers';
    return isClassicLayout
      ? 'grid-cols-1 md:grid-cols-2 lg:grid-cols-[0.8fr_0.85fr_1.1fr_1.25fr]'
      : 'grid-cols-1 md:grid-cols-2 lg:grid-cols-4';
  }
  return 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3';
}

function getColumnEmptyText(section: ParsedSheetSection): string | undefined {
  switch (section.path) {
    case 'anatomy_and_health.injuries':
      return 'Травми відсутні';
    case 'storage_and_equipment.worn':
      return 'Нічого не одягнено';
    case 'abilities':
      return 'Здібності відсутні';
    case 'storage_and_equipment.containers':
      return 'Контейнери порожні';
    default:
      return undefined;
  }
}

export const DrawerSheet: React.FC<DrawerSheetProps> = ({ onEditLiveSheet }) => {
  const {
    playerState,
    activeCharacter,
    activeCampaign,
    activeCampaignId,
    isLoading,
    isStreaming,
    isCharacterDrawerOpen,
  } = useGameStore();
  const state = playerState || activeCharacter;

  const parsedSheet = useMemo(
    () => parseDynamicSheet(state, undefined, activeCampaign),
    [state, activeCampaign]
  );

  const { headers, drawerColumns, detailSections } = parsedSheet;
  const overallState = headers.overallState?.trim() || '';
  const gridClass = getDrawerGridClass(drawerColumns);
  const hasLiveSheetEditor = !!activeCampaignId && !!onEditLiveSheet;
  const canEditLiveSheet = hasLiveSheetEditor && !isLoading && !isStreaming;

  return (
    <div
      aria-hidden={!isCharacterDrawerOpen}
      className={`grid transition-all duration-300 ease-out ${
        isCharacterDrawerOpen
          ? 'grid-rows-[1fr] opacity-100 mt-1 visible'
          : 'grid-rows-[0fr] opacity-0 mt-0 invisible pointer-events-none'
      }`}
    >
      <div className="min-h-0 overflow-hidden">
        <div className="w-full bg-[#181818] border border-[#2A2A2A] rounded-[10px] p-4 pb-3 flex flex-col gap-2.5 shadow-2xl max-h-[70vh] overflow-y-auto">
          {hasLiveSheetEditor && (
            <div className="shrink-0 flex items-center justify-start gap-3 pb-2.5 border-b border-[#242424]">
              <span className="inline-flex items-center h-[28px] text-[11px] font-bold tracking-wider uppercase leading-none text-[#9CA3AF]">
                ЛИСТ ПЕРСОНАЖА
              </span>
              <button
                type="button"
                disabled={!canEditLiveSheet}
                onClick={onEditLiveSheet}
                className="h-[28px] px-2.5 rounded-[7px] bg-[#161616] border border-[#2A2A2A] text-[11px] font-medium leading-none text-[#E5E7EB] inline-flex items-center gap-1.5 transition-all duration-150 enabled:hover:bg-[#1E1E1E] enabled:hover:border-[#444444] enabled:active:scale-[0.985] enabled:cursor-pointer disabled:opacity-45 disabled:cursor-default"
              >
                <Edit3 size={12} className="text-[#9CA3AF] shrink-0" />
                <span>Редагувати лист</span>
              </button>
            </div>
          )}

          {overallState && (
            <div className="shrink-0 flex items-start gap-2.5 px-3 py-2 rounded-lg bg-[#2A1414]/45 border border-[#4A1818]/75">
              <Heart size={14} className="text-[#EF4444] fill-[#EF4444]/40 shrink-0 mt-0.5" />
              <div className="min-w-0 flex-1 flex flex-col gap-0.5">
                <span className="text-[10px] font-bold uppercase tracking-wider text-[#FCA5A5]/80">
                  Поточний стан
                </span>
                <p className="text-xs font-medium text-[#FDE8E8] leading-relaxed whitespace-pre-wrap break-words">
                  {overallState}
                </p>
              </div>
            </div>
          )}

          {drawerColumns.length > 0 ? (
            <div className={`grid ${gridClass} gap-2.5 shrink-0`}>
              {drawerColumns.map((section) => (
                <DynamicSectionRenderer
                  key={section.path}
                  section={section}
                  mode="read"
                  variant="column"
                  emptyText={getColumnEmptyText(section)}
                />
              ))}
            </div>
          ) : (
            detailSections.length === 0 && !overallState && (
              <div className="text-xs text-[#6B7280] italic py-4 text-center">
                Дані анкети персонажа відсутні
              </div>
            )
          )}

          {/* Нижній розгортний спойлер деталей персонажа */}
          <DrawerDetails sections={detailSections} />
        </div>
      </div>
    </div>
  );
};
