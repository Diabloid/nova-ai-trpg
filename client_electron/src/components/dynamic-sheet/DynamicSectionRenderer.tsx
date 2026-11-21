import React from 'react';
import type { ParsedSheetSection } from '../../types/game';
import { inferArchetype } from '../../utils/dynamicSheet';
import { CardListSection } from './CardListSection';
import { ContainerMapSection } from './ContainerMapSection';
import { LongTextSection } from './LongTextSection';
import { StatGridSection } from './StatGridSection';
import { TagListSection } from './TagListSection';
import type { DynamicSectionMode, DynamicSectionVariant } from './types';

interface DynamicSectionRendererProps {
  section: ParsedSheetSection;
  mode: DynamicSectionMode;
  variant?: DynamicSectionVariant;
  emptyText?: string;
  onChange?: (nextValue: any) => void;
  onFieldLabelChange?: (rawKey: string, nextLabel: string) => void;
  onTranslateKeys?: (keys: string[]) => void;
}

/**
 * Тонкий світч-рендерер над 5 візуальними архетипами динамічної анкети.
 */
export const DynamicSectionRenderer: React.FC<DynamicSectionRendererProps> = ({
  section,
  mode,
  variant = 'column',
  emptyText,
  onChange,
  onFieldLabelChange,
  onTranslateKeys,
}) => {
  const knownArchetypes = new Set([
    'card_list',
    'container_map',
    'stat_grid',
    'long_text',
    'tag_list',
  ]);
  const resolvedArchetype = knownArchetypes.has(section.archetype)
    ? section.archetype
    : inferArchetype(section.value, section.key);

  switch (resolvedArchetype) {
    case 'card_list':
      return (
        <CardListSection
          title={section.title}
          icon={section.icon}
          color={section.color}
          value={Array.isArray(section.value) ? section.value : []}
          mode={mode}
          variant={variant}
          emptyText={emptyText}
          fieldLabels={section.fieldLabels}
          onChange={onChange}
        />
      );

    case 'container_map':
      return (
        <ContainerMapSection
          title={section.title}
          icon={section.icon}
          color={section.color}
          value={section.value}
          mode={mode}
          variant={variant}
          emptyText={emptyText}
          fieldLabels={section.fieldLabels}
          onChange={onChange}
        />
      );

    case 'stat_grid':
      return (
        <StatGridSection
          title={section.title}
          icon={section.icon}
          color={section.color}
          value={section.value}
          mode={mode}
          variant={variant}
          emptyText={emptyText}
          fieldLabels={section.fieldLabels}
          onChange={onChange}
          onFieldLabelChange={onFieldLabelChange}
          onTranslateKeys={onTranslateKeys}
        />
      );

    case 'tag_list':
      return (
        <TagListSection
          title={section.title}
          icon={section.icon}
          color={section.color}
          value={Array.isArray(section.value) ? section.value : []}
          mode={mode}
          variant={variant}
          emptyText={emptyText}
          onChange={onChange}
        />
      );

    case 'long_text':
    default:
      return (
        <LongTextSection
          title={section.title}
          icon={section.icon}
          color={section.color}
          value={section.value}
          mode={mode}
          variant={variant}
          emptyText={emptyText}
          onChange={onChange}
        />
      );
  }
};
