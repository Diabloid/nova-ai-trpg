import type {
  CampaignSummary,
  PlayerState,
  SchemaSectionMeta,
  TemplateSchemaMeta,
} from '../../types/api';
import type { ParsedDynamicSheet, ParsedSheetSection } from '../../types/game';
import { formatBlockTitle, getCharacterBlockStyle } from '../characterBlockStyles';
import { normalizeLucideIconKey } from '../lucideIconMap';
import {
  extractMergedFieldLabels,
  getDefaultValueForArchetype,
  inferArchetype,
} from './archetypes';
import { extractHeaderAnchors } from './header';
import { cloneJsonSafe, getByPath, isPathCovered, isPlainObject } from './paths';

const IGNORED_TOP_KEYS = new Set([
  '_schema_meta',
  'created_at',
  'updated_at',
  'name',
  'location',
  'overall_state',
]);

const IGNORED_META_KEYS = new Set([
  'world_id',
  'name',
  'location',
  'avatar',
  'overall_state',
  'background',
]);

export const CLASSIC_SECTION_FALLBACKS: Record<string, SchemaSectionMeta & { order: number }> = {
  'anatomy_and_health.injuries': {
    title: 'АНАТОМІЯ ТА ТРАВМИ',
    icon: 'heart-pulse',
    color: '#EF4444',
    archetype: 'card_list',
    placement: 'drawer_column',
    order: 1,
  },
  'storage_and_equipment.worn': {
    title: 'ЕКІПІРУВАННЯ (WORN)',
    icon: 'shield',
    color: '#60A5FA',
    archetype: 'card_list',
    placement: 'drawer_column',
    order: 2,
  },
  abilities: {
    title: 'ЗДІБНОСТІ ТА ЗАКЛЯТТЯ',
    icon: 'zap',
    color: '#C084FC',
    archetype: 'card_list',
    placement: 'drawer_column',
    order: 3,
  },
  'storage_and_equipment.containers': {
    title: 'КОНТЕЙНЕРИ ТА РЮКЗАК',
    icon: 'backpack',
    color: '#34D399',
    archetype: 'container_map',
    placement: 'drawer_column',
    order: 4,
  },
};

const META_DETAIL_LABELS: Record<string, { title: string; icon: string; color: string }> = {
  first_name: { title: "ІМ'Я", icon: 'user', color: '#E5E7EB' },
  last_name: { title: 'ПРІЗВИЩЕ', icon: 'user', color: '#E5E7EB' },
  patronymic: { title: 'ПО БАТЬКОВІ', icon: 'user', color: '#E5E7EB' },
  titles: { title: 'ТИТУЛИ ТА ЗВАННЯ', icon: 'crown', color: '#FBBF24' },
  age: { title: 'ВІК', icon: 'user', color: '#E5E7EB' },
  appearance: { title: 'ЗОВНІШНІСТЬ', icon: 'eye', color: '#9CA3AF' },
  appearance_details: { title: 'РИСИ ЗОВНІШНОСТІ', icon: 'user', color: '#9CA3AF' },
  biography: { title: 'ХРОНІКА ТА БІОГРАФІЯ', icon: 'scroll-text', color: '#F59E0B' },
};

interface ParseContext {
  state: Record<string, any>;
  fieldLabels: Record<string, string>;
  coveredPaths: Set<string>;
  drawerColumns: ParsedSheetSection[];
  detailSections: ParsedSheetSection[];
  allSections: ParsedSheetSection[];
  autoOrder: number;
}

function pushSection(ctx: ParseContext, section: ParsedSheetSection): void {
  const withLabels: ParsedSheetSection = {
    ...section,
    fieldLabels: ctx.fieldLabels,
  };
  ctx.allSections.push(withLabels);
  if (withLabels.placement === 'drawer_column') {
    ctx.drawerColumns.push(withLabels);
  } else if (withLabels.placement === 'details') {
    ctx.detailSections.push(withLabels);
  }
}

function collectExplicitSchemaSections(
  ctx: ParseContext,
  explicitSchemaSections: Record<string, SchemaSectionMeta>
): boolean {
  const sortedEntries = Object.entries(explicitSchemaSections).sort(
    (a, b) => (a[1].order ?? 999) - (b[1].order ?? 999)
  );

  sortedEntries.forEach(([path, meta], index) => {
    let rawValue = getByPath(ctx.state, path);
    if (
      path === 'meta.biography' &&
      (rawValue === undefined ||
        rawValue === null ||
        (typeof rawValue === 'string' && !rawValue.trim())) &&
      typeof ctx.state.meta?.background === 'string' &&
      ctx.state.meta.background.trim()
    ) {
      rawValue = ctx.state.meta.background;
    }

    const shortKey = path.split('.').pop() || path;
    const archetype = meta.archetype || inferArchetype(rawValue, shortKey);
    const value =
      rawValue !== undefined ? cloneJsonSafe(rawValue) : getDefaultValueForArchetype(archetype);

    ctx.coveredPaths.add(path);
    pushSection(ctx, {
      key: shortKey,
      path,
      title: meta.title || formatBlockTitle(shortKey).toUpperCase(),
      icon: normalizeLucideIconKey(meta.icon, 'box'),
      color: meta.color || '#9CA3AF',
      archetype,
      placement: meta.placement || 'drawer_column',
      order: meta.order ?? index + 1,
      value,
      isAutoInferred: false,
    });
  });

  return sortedEntries.length > 0;
}

function collectClassicFallbackSections(ctx: ParseContext): void {
  Object.entries(CLASSIC_SECTION_FALLBACKS).forEach(([path, meta]) => {
    const val = getByPath(ctx.state, path);
    if (val === undefined) return;

    const shortKey = path.split('.').pop() || path;
    ctx.coveredPaths.add(path);
    if (path.startsWith('anatomy_and_health.')) ctx.coveredPaths.add('anatomy_and_health');
    if (path.startsWith('storage_and_equipment.')) ctx.coveredPaths.add('storage_and_equipment');

    pushSection(ctx, {
      key: shortKey,
      path,
      title: meta.title,
      icon: meta.icon || 'box',
      color: meta.color || '#9CA3AF',
      archetype: meta.archetype,
      placement: meta.placement,
      order: meta.order,
      value: cloneJsonSafe(val),
      isAutoInferred: false,
    });
  });
}

function collectInferredMetaSections(ctx: ParseContext): void {
  const { meta } = ctx.state;
  if (!isPlainObject(meta)) return;

  const fullNameNorm = typeof meta.name === 'string' ? meta.name.trim() : '';
  const hasLastName = typeof meta.last_name === 'string' && meta.last_name.trim() !== '';
  const hasPatronymic = typeof meta.patronymic === 'string' && meta.patronymic.trim() !== '';

  for (const [metaKey, metaVal] of Object.entries(meta)) {
    if (IGNORED_META_KEYS.has(metaKey)) continue;
    const metaPath = `meta.${metaKey}`;
    if (isPathCovered(metaPath, ctx.coveredPaths)) continue;
    if (metaVal === undefined || metaVal === null) continue;

    if (metaKey === 'first_name') {
      const firstNameNorm = typeof metaVal === 'string' ? metaVal.trim() : '';
      if (firstNameNorm === fullNameNorm && !hasLastName && !hasPatronymic) {
        ctx.coveredPaths.add(metaPath);
        continue;
      }
    }

    ctx.coveredPaths.add(metaPath);
    const labelInfo = META_DETAIL_LABELS[metaKey];
    const archetype = inferArchetype(metaVal, metaKey);

    pushSection(ctx, {
      key: metaKey,
      path: metaPath,
      title: labelInfo?.title || formatBlockTitle(metaKey).toUpperCase(),
      icon: labelInfo?.icon || (archetype === 'stat_grid' ? 'user' : 'scroll-text'),
      color: labelInfo?.color || '#9CA3AF',
      archetype,
      placement: 'details',
      order: ctx.autoOrder++,
      value: cloneJsonSafe(metaVal),
      isAutoInferred: true,
    });
  }

  // Тихий fallback для старих/імпортованих JSON, де є лише meta.background без meta.biography
  if (
    !isPathCovered('meta.biography', ctx.coveredPaths) &&
    (meta.biography === undefined ||
      meta.biography === null ||
      (typeof meta.biography === 'string' && !meta.biography.trim())) &&
    typeof meta.background === 'string' &&
    meta.background.trim()
  ) {
    ctx.coveredPaths.add('meta.biography');
    const bioInfo = META_DETAIL_LABELS.biography;
    pushSection(ctx, {
      key: 'biography',
      path: 'meta.biography',
      title: bioInfo.title,
      icon: bioInfo.icon,
      color: bioInfo.color,
      archetype: 'long_text',
      placement: 'details',
      order: ctx.autoOrder++,
      value: meta.background,
      isAutoInferred: true,
    });
  }
}

function collectInferredCustomBlockSections(ctx: ParseContext): void {
  const { custom_blocks: customBlocks } = ctx.state;
  if (!isPlainObject(customBlocks) || ctx.coveredPaths.has('custom_blocks')) return;

  for (const [cbKey, cbVal] of Object.entries(customBlocks)) {
    if (cbKey === 'created_at' || cbKey === 'updated_at') continue;
    const cbPath = `custom_blocks.${cbKey}`;
    if (isPathCovered(cbPath, ctx.coveredPaths)) continue;
    if (cbVal === undefined || cbVal === null) continue;

    ctx.coveredPaths.add(cbPath);
    const blockStyle = getCharacterBlockStyle(cbKey, true);
    const archetype = inferArchetype(cbVal, cbKey);

    pushSection(ctx, {
      key: cbKey,
      path: cbPath,
      title: blockStyle.title,
      icon: blockStyle.iconKey,
      color: blockStyle.color,
      archetype,
      placement: 'details',
      order: ctx.autoOrder++,
      value: cloneJsonSafe(cbVal),
      isAutoInferred: true,
    });
  }
}

function collectInferredTopLevelSections(ctx: ParseContext): void {
  for (const [topKey, topVal] of Object.entries(ctx.state)) {
    if (IGNORED_TOP_KEYS.has(topKey) || topKey === 'meta' || topKey === 'custom_blocks') {
      continue;
    }
    if (isPathCovered(topKey, ctx.coveredPaths)) continue;
    if (topVal === undefined || topVal === null) continue;

    // Для частково покритих legacy-гілок (напр. anatomy_and_health.overall_state)
    if (topKey === 'anatomy_and_health' || topKey === 'storage_and_equipment') {
      continue;
    }

    ctx.coveredPaths.add(topKey);
    const blockStyle = getCharacterBlockStyle(topKey, true);
    const archetype = inferArchetype(topVal, topKey);
    const placement = archetype === 'long_text' ? 'details' : 'drawer_column';

    pushSection(ctx, {
      key: topKey,
      path: topKey,
      title: blockStyle.title,
      icon: blockStyle.iconKey,
      color: blockStyle.color === '#E5E7EB' ? '#9CA3AF' : blockStyle.color,
      archetype,
      placement,
      order: ctx.autoOrder++,
      value: cloneJsonSafe(topVal),
      isAutoInferred: true,
    });
  }
}

/**
 * Повністю парсить динамічний лист персонажа за `_schema_meta` (та fallbackSchema / авто-інференсом).
 */
export function parseDynamicSheet(
  state: PlayerState | Record<string, any> | null | undefined,
  fallbackSchema?: TemplateSchemaMeta | null,
  activeCampaign?: CampaignSummary | null
): ParsedDynamicSheet {
  const headers = extractHeaderAnchors(state, activeCampaign, fallbackSchema);
  const fieldLabels = extractMergedFieldLabels(state, fallbackSchema);

  if (!state || typeof state !== 'object') {
    return {
      headers,
      drawerColumns: [],
      detailSections: [],
      headerBadges: headers.headerBadges,
      allSections: [],
      allEditableSections: [],
      fieldLabels,
    };
  }

  const explicitSchemaSections: Record<string, SchemaSectionMeta> =
    state._schema_meta?.sections && Object.keys(state._schema_meta.sections).length > 0
      ? state._schema_meta.sections
      : fallbackSchema?.sections ?? {};

  const ctx: ParseContext = {
    state,
    fieldLabels,
    coveredPaths: new Set<string>(),
    drawerColumns: [],
    detailSections: [],
    allSections: [],
    autoOrder: 1000,
  };

  const hasExplicitSchema = collectExplicitSchemaSections(ctx, explicitSchemaSections);
  if (!hasExplicitSchema) {
    collectClassicFallbackSections(ctx);
  }
  collectInferredMetaSections(ctx);
  collectInferredCustomBlockSections(ctx);
  collectInferredTopLevelSections(ctx);

  ctx.drawerColumns.sort((a, b) => a.order - b.order);
  ctx.detailSections.sort((a, b) => a.order - b.order);
  ctx.allSections.sort((a, b) => a.order - b.order);

  return {
    headers,
    drawerColumns: ctx.drawerColumns,
    detailSections: ctx.detailSections,
    headerBadges: headers.headerBadges,
    allSections: ctx.allSections,
    allEditableSections: ctx.allSections,
    fieldLabels,
  };
}
