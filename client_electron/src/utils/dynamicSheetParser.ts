import type {
  CampaignSummary,
  PlayerState,
  SchemaSectionMeta,
  TemplateArchetype,
  TemplateSchemaMeta,
} from '../types/api';
import type {
  HeaderAnchors,
  HeaderBadgeItem,
  ParsedDynamicSheet,
  ParsedSheetSection,
} from '../types/game';
import {
  formatBlockTitle,
  getCharacterBlockStyle,
  isTechnicalFieldKey,
  localizeFieldKey,
} from './characterBlockStyles';

function extractMergedFieldLabels(
  state: Record<string, any> | null | undefined,
  fallbackSchema?: TemplateSchemaMeta | null
): Record<string, string> {
  const fromFallback = isPlainObject(fallbackSchema?.field_labels)
    ? fallbackSchema.field_labels
    : {};
  const fromState = isPlainObject(state?._schema_meta?.field_labels)
    ? state._schema_meta.field_labels
    : {};

  const merged: Record<string, string> = {};
  for (const [k, v] of Object.entries({ ...fromFallback, ...fromState })) {
    if (typeof v === 'string' && v.trim()) {
      merged[k] = v.trim();
    }
  }
  return merged;
}
import { normalizeLucideIconKey } from './lucideIconMap';

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

const TAG_KEY_HINTS = new Set(['tags', 'skills', 'perks', 'traits', 'languages']);

function isPlainObject(value: unknown): value is Record<string, any> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function cloneJsonSafe<T>(value: T): T {
  try {
    return JSON.parse(JSON.stringify(value)) as T;
  } catch {
    return value;
  }
}

/** Безпечне читання значення за dot-шляхом (`meta.biography`, `storage_and_equipment.worn`) */
export function getByPath(obj: unknown, path: string): any {
  if (!obj || typeof obj !== 'object' || !path) return undefined;
  const parts = path.split('.');
  let current: any = obj;

  for (const part of parts) {
    if (current === null || current === undefined || typeof current !== 'object') {
      return undefined;
    }
    if (part === '__proto__' || part === 'constructor' || part === 'prototype') {
      return undefined;
    }
    current = (current as Record<string, any>)[part];
  }

  return current;
}

/** Безпечний запис значення за dot-шляхом без мутації сусідніх гілок */
export function setByPath(target: Record<string, any>, path: string, value: any): void {
  if (!target || typeof target !== 'object' || !path) return;
  const parts = path.split('.');
  let current: Record<string, any> = target;

  for (let i = 0; i < parts.length - 1; i++) {
    const part = parts[i];
    if (part === '__proto__' || part === 'constructor' || part === 'prototype') {
      return;
    }
    if (!isPlainObject(current[part])) {
      current[part] = {};
    }
    current = current[part];
  }

  const leaf = parts[parts.length - 1];
  if (leaf === '__proto__' || leaf === 'constructor' || leaf === 'prototype') {
    return;
  }
  current[leaf] = value;
}

/** Авто-визначення архетипу секції за формою даних у JSON */
export function inferArchetype(value: unknown, keyHint = ''): TemplateArchetype {
  if (Array.isArray(value)) {
    if (value.length === 0) {
      return TAG_KEY_HINTS.has(keyHint.toLowerCase()) ? 'tag_list' : 'card_list';
    }
    const allStrings = value.every((item) => typeof item === 'string');
    return allStrings ? 'tag_list' : 'card_list';
  }

  if (isPlainObject(value)) {
    const entries = Object.values(value);
    if (entries.length > 0 && entries.every((entry) => Array.isArray(entry))) {
      return 'container_map';
    }
    return 'stat_grid';
  }

  return 'long_text';
}

function getDefaultValueForArchetype(archetype: TemplateArchetype): any {
  switch (archetype) {
    case 'card_list':
    case 'tag_list':
      return [];
    case 'container_map':
    case 'stat_grid':
      return {};
    case 'long_text':
    default:
      return '';
  }
}

function findFirstNameFallback(state: Record<string, any>): string {
  if (typeof state.name === 'string' && state.name.trim()) {
    return state.name.trim();
  }
  const meta = isPlainObject(state.meta) ? state.meta : null;
  if (meta) {
    if (typeof meta.first_name === 'string' && meta.first_name.trim()) {
      return meta.first_name.trim();
    }
    for (const [key, val] of Object.entries(meta)) {
      if (key.toLowerCase().includes('name') && typeof val === 'string' && val.trim()) {
        return val.trim();
      }
    }
  }
  for (const [key, val] of Object.entries(state)) {
    if (key.toLowerCase().includes('name') && typeof val === 'string' && val.trim()) {
      return val.trim();
    }
  }
  return '';
}

function findOverallStateFallback(state: Record<string, any>): string | undefined {
  const candidates = [
    state?.meta?.overall_state,
    state?.anatomy_and_health?.overall_state,
    state?.overall_state,
    state?.status,
    state?.health_status,
    state?.condition,
  ];
  for (const candidate of candidates) {
    if (typeof candidate === 'string' && candidate.trim()) {
      return candidate.trim();
    }
  }
  return undefined;
}

function buildHeaderBadges(
  state: Record<string, any>,
  schemaSections: Record<string, SchemaSectionMeta>,
  fieldLabels: Record<string, string>
): HeaderBadgeItem[] {
  const badges: HeaderBadgeItem[] = [];
  const entries = Object.entries(schemaSections)
    .filter(([, meta]) => meta.placement === 'header_badge')
    .sort((a, b) => (a[1].order ?? 999) - (b[1].order ?? 999));

  for (const [path, meta] of entries) {
    const rawVal = getByPath(state, path);
    if (rawVal === undefined || rawVal === null) continue;

    const color = meta.color || '#EF4444';
    const icon = normalizeLucideIconKey(meta.icon, 'activity');

    if (isPlainObject(rawVal)) {
      for (const [subKey, subVal] of Object.entries(rawVal)) {
        if (isTechnicalFieldKey(subKey)) continue;
        if (subVal === null || subVal === undefined || typeof subVal === 'object') continue;
        const textVal = String(subVal).trim();
        if (!textVal) continue;
        badges.push({
          key: `${path}.${subKey}`,
          path: `${path}.${subKey}`,
          label: localizeFieldKey(subKey, fieldLabels),
          value: textVal,
          color,
          icon,
        });
      }
      continue;
    }

    if (Array.isArray(rawVal)) {
      const itemsText = rawVal
        .map((item) =>
          typeof item === 'object' && item !== null
            ? String(item.name || item.title || item.label || '').trim()
            : String(item ?? '').trim()
        )
        .filter(Boolean)
        .join(', ');
      if (itemsText) {
        const shortKey = path.split('.').pop() || path;
        badges.push({
          key: path,
          path,
          label: meta.title || formatBlockTitle(shortKey),
          value: itemsText,
          color,
          icon,
        });
      }
      continue;
    }

    const textVal = String(rawVal).trim();
    if (!textVal) continue;
    const shortKey = path.split('.').pop() || path;
    badges.push({
      key: path,
      path,
      label: meta.title || formatBlockTitle(shortKey),
      value: textVal,
      color,
      icon,
    });
  }

  return badges;
}

/**
 * Витягує м'які якорі для `HeaderStatusBar` та бейджі зі схемою `placement: 'header_badge'`.
 */
export function extractHeaderAnchors(
  state: PlayerState | Record<string, any> | null | undefined,
  activeCampaign?: CampaignSummary | null,
  fallbackSchema?: TemplateSchemaMeta | null
): HeaderAnchors {
  if (!state || typeof state !== 'object') {
    return {
      name: '',
      location: activeCampaign?.current_location || '',
      overallState: undefined,
      avatar: undefined,
      headerBadges: [],
    };
  }

  const meta = isPlainObject(state.meta) ? state.meta : {};
  const rawName = typeof meta.name === 'string' && meta.name.trim()
    ? meta.name.trim()
    : findFirstNameFallback(state);

  const location =
    (activeCampaign?.current_location && activeCampaign.current_location.trim()) ||
    (typeof meta.location === 'string' && meta.location.trim()) ||
    (typeof state.location === 'string' && state.location.trim()) ||
    '';

  const avatar =
    typeof meta.avatar === 'string' && meta.avatar.trim()
      ? meta.avatar.trim()
      : undefined;

  const overallState = findOverallStateFallback(state);

  const schemaSections =
    state._schema_meta?.sections ||
    fallbackSchema?.sections ||
    {};
  const fieldLabels = extractMergedFieldLabels(state, fallbackSchema);

  return {
    name: rawName,
    location,
    overallState,
    avatar,
    headerBadges: buildHeaderBadges(state, schemaSections, fieldLabels),
  };
}

function isPathCovered(candidatePath: string, coveredPaths: Set<string>): boolean {
  if (coveredPaths.has(candidatePath)) return true;
  for (const covered of coveredPaths) {
    if (covered.startsWith(`${candidatePath}.`) || candidatePath.startsWith(`${covered}.`)) {
      return true;
    }
  }
  return false;
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

  const drawerColumns: ParsedSheetSection[] = [];
  const detailSections: ParsedSheetSection[] = [];
  const allSections: ParsedSheetSection[] = [];
  const coveredPaths = new Set<string>();

  const pushSection = (section: ParsedSheetSection) => {
    const withLabels: ParsedSheetSection = {
      ...section,
      fieldLabels,
    };
    allSections.push(withLabels);
    if (withLabels.placement === 'drawer_column') {
      drawerColumns.push(withLabels);
    } else if (withLabels.placement === 'details') {
      detailSections.push(withLabels);
    }
  };

  // 1. Явно описані секції в _schema_meta / fallbackSchema
  const sortedSchemaEntries = Object.entries(explicitSchemaSections).sort(
    (a, b) => (a[1].order ?? 999) - (b[1].order ?? 999)
  );

  sortedSchemaEntries.forEach(([path, meta], index) => {
    let rawValue = getByPath(state, path);
    if (
      path === 'meta.biography' &&
      (rawValue === undefined ||
        rawValue === null ||
        (typeof rawValue === 'string' && !rawValue.trim())) &&
      typeof state.meta?.background === 'string' &&
      state.meta.background.trim()
    ) {
      rawValue = state.meta.background;
    }
    const shortKey = path.split('.').pop() || path;
    const archetype = meta.archetype || inferArchetype(rawValue, shortKey);
    const value =
      rawValue !== undefined ? cloneJsonSafe(rawValue) : getDefaultValueForArchetype(archetype);

    coveredPaths.add(path);

    pushSection({
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

  // 2. Зворотна сумісність для класичних сейвів без _schema_meta
  const hasExplicitSchema = sortedSchemaEntries.length > 0;
  if (!hasExplicitSchema) {
    Object.entries(CLASSIC_SECTION_FALLBACKS).forEach(([path, meta]) => {
      const val = getByPath(state, path);
      if (val === undefined) return;

      const shortKey = path.split('.').pop() || path;
      coveredPaths.add(path);
      if (path.startsWith('anatomy_and_health.')) coveredPaths.add('anatomy_and_health');
      if (path.startsWith('storage_and_equipment.')) coveredPaths.add('storage_and_equipment');

      pushSection({
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

  // 3. Авто-інференс нерозмічених полів у meta.*
  let autoOrder = 1000;
  if (isPlainObject(state.meta)) {
    const fullNameNorm = typeof state.meta.name === 'string' ? state.meta.name.trim() : '';
    const hasLastName =
      typeof state.meta.last_name === 'string' && state.meta.last_name.trim() !== '';
    const hasPatronymic =
      typeof state.meta.patronymic === 'string' && state.meta.patronymic.trim() !== '';

    for (const [metaKey, metaVal] of Object.entries(state.meta)) {
      if (IGNORED_META_KEYS.has(metaKey)) continue;
      const metaPath = `meta.${metaKey}`;
      if (isPathCovered(metaPath, coveredPaths)) continue;
      if (metaVal === undefined || metaVal === null) continue;

      if (metaKey === 'first_name') {
        const firstNameNorm = typeof metaVal === 'string' ? metaVal.trim() : '';
        if (firstNameNorm === fullNameNorm && !hasLastName && !hasPatronymic) {
          coveredPaths.add(metaPath);
          continue;
        }
      }

      coveredPaths.add(metaPath);
      const labelInfo = META_DETAIL_LABELS[metaKey];
      const archetype = inferArchetype(metaVal, metaKey);

      pushSection({
        key: metaKey,
        path: metaPath,
        title: labelInfo?.title || formatBlockTitle(metaKey).toUpperCase(),
        icon: labelInfo?.icon || (archetype === 'stat_grid' ? 'user' : 'scroll-text'),
        color: labelInfo?.color || '#9CA3AF',
        archetype,
        placement: 'details',
        order: autoOrder++,
        value: cloneJsonSafe(metaVal),
        isAutoInferred: true,
      });
    }

    // Тихий fallback для старих/імпортованих JSON, де є лише meta.background без meta.biography
    if (
      !isPathCovered('meta.biography', coveredPaths) &&
      (state.meta.biography === undefined ||
        state.meta.biography === null ||
        (typeof state.meta.biography === 'string' && !state.meta.biography.trim())) &&
      typeof state.meta.background === 'string' &&
      state.meta.background.trim()
    ) {
      coveredPaths.add('meta.biography');
      const bioInfo = META_DETAIL_LABELS.biography;
      pushSection({
        key: 'biography',
        path: 'meta.biography',
        title: bioInfo.title,
        icon: bioInfo.icon,
        color: bioInfo.color,
        archetype: 'long_text',
        placement: 'details',
        order: autoOrder++,
        value: state.meta.background,
        isAutoInferred: true,
      });
    }
  }

  // 4. Авто-інференс custom_blocks.*
  if (isPlainObject(state.custom_blocks) && !coveredPaths.has('custom_blocks')) {
    for (const [cbKey, cbVal] of Object.entries(state.custom_blocks)) {
      if (cbKey === 'created_at' || cbKey === 'updated_at') continue;
      const cbPath = `custom_blocks.${cbKey}`;
      if (isPathCovered(cbPath, coveredPaths)) continue;
      if (cbVal === undefined || cbVal === null) continue;

      coveredPaths.add(cbPath);
      const blockStyle = getCharacterBlockStyle(cbKey, true);
      const archetype = inferArchetype(cbVal, cbKey);

      pushSection({
        key: cbKey,
        path: cbPath,
        title: blockStyle.title,
        icon: blockStyle.iconKey,
        color: blockStyle.color,
        archetype,
        placement: 'details',
        order: autoOrder++,
        value: cloneJsonSafe(cbVal),
        isAutoInferred: true,
      });
    }
  }

  // 5. Авто-інференс решти верхньорівневих секцій (без meta / _schema_meta / службових)
  for (const [topKey, topVal] of Object.entries(state)) {
    if (IGNORED_TOP_KEYS.has(topKey) || topKey === 'meta' || topKey === 'custom_blocks') {
      continue;
    }
    if (isPathCovered(topKey, coveredPaths)) continue;
    if (topVal === undefined || topVal === null) continue;

    // Для частково покритих legacy-гілок (напр. anatomy_and_health.overall_state)
    if (topKey === 'anatomy_and_health' || topKey === 'storage_and_equipment') {
      continue;
    }

    coveredPaths.add(topKey);
    const blockStyle = getCharacterBlockStyle(topKey, true);
    const archetype = inferArchetype(topVal, topKey);
    const placement = archetype === 'long_text' ? 'details' : 'drawer_column';

    pushSection({
      key: topKey,
      path: topKey,
      title: blockStyle.title,
      icon: blockStyle.iconKey,
      color: blockStyle.color === '#E5E7EB' ? '#9CA3AF' : blockStyle.color,
      archetype,
      placement,
      order: autoOrder++,
      value: cloneJsonSafe(topVal),
      isAutoInferred: true,
    });
  }

  drawerColumns.sort((a, b) => a.order - b.order);
  detailSections.sort((a, b) => a.order - b.order);
  allSections.sort((a, b) => a.order - b.order);

  return {
    headers,
    drawerColumns,
    detailSections,
    headerBadges: headers.headerBadges,
    allSections,
    allEditableSections: allSections,
    fieldLabels,
  };
}

export interface HeaderPatch {
  name?: string;
  location?: string;
  overallState?: string;
  avatar?: string;
}

/**
 * Збирає оновлений JSON персонажа за вихідними dot-шляхами без створення фантомних фентезі-блоків.
 * Гарантовано зберігає `_schema_meta`, `meta.world_id` та `meta.avatar`.
 */
export function serializeDynamicSheet(
  baseState: PlayerState | Record<string, any> | null | undefined,
  sections: ParsedSheetSection[],
  headerPatch?: HeaderPatch
): PlayerState {
  const nextState: Record<string, any> = isPlainObject(baseState)
    ? cloneJsonSafe(baseState)
    : { meta: { world_id: 'default_dark_fantasy', name: '' } };

  if (!isPlainObject(nextState.meta)) {
    nextState.meta = {};
  }

  // Зберігаємо оригінальні службові якорі світу та схеми
  if (isPlainObject(baseState?._schema_meta) && !isPlainObject(nextState._schema_meta)) {
    nextState._schema_meta = cloneJsonSafe(baseState._schema_meta);
  }
  if (baseState?.meta?.world_id && !nextState.meta.world_id) {
    nextState.meta.world_id = baseState.meta.world_id;
  }
  if (baseState?.meta?.avatar && !nextState.meta.avatar && headerPatch?.avatar === undefined) {
    nextState.meta.avatar = baseState.meta.avatar;
  }

  for (const section of sections) {
    setByPath(nextState, section.path, cloneJsonSafe(section.value));
  }

  if (headerPatch) {
    if (headerPatch.name !== undefined) {
      nextState.meta.name = headerPatch.name;
    }
    if (headerPatch.location !== undefined) {
      nextState.meta.location = headerPatch.location;
    }
    if (headerPatch.avatar !== undefined) {
      if (headerPatch.avatar) {
        nextState.meta.avatar = headerPatch.avatar;
      } else {
        delete nextState.meta.avatar;
      }
    }
    if (headerPatch.overallState !== undefined) {
      if (
        isPlainObject(nextState.anatomy_and_health) &&
        nextState.meta.overall_state === undefined
      ) {
        nextState.anatomy_and_health.overall_state = headerPatch.overallState;
      } else {
        nextState.meta.overall_state = headerPatch.overallState;
      }
    }
  }

  return nextState as PlayerState;
}
