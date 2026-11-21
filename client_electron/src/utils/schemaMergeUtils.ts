import type {
  PlayerState,
  SchemaSectionMeta,
  TemplateArchetype,
  TemplatePlacement,
  TemplateSchemaMeta,
} from '../types/api';
import {
  CLASSIC_SECTION_FALLBACKS,
  getByPath,
  inferArchetype,
  setByPath,
} from './dynamicSheet';
import { normalizeLucideIconKey } from './lucideIconMap';

const CYRILLIC_TRANSLIT_MAP: Record<string, string> = {
  а: 'a',
  б: 'b',
  в: 'v',
  г: 'h',
  ґ: 'g',
  д: 'd',
  е: 'e',
  є: 'ye',
  ж: 'zh',
  з: 'z',
  и: 'y',
  і: 'i',
  ї: 'yi',
  й: 'y',
  к: 'k',
  л: 'l',
  м: 'm',
  н: 'n',
  о: 'o',
  п: 'p',
  р: 'r',
  с: 's',
  т: 't',
  у: 'u',
  ф: 'f',
  х: 'kh',
  ц: 'ts',
  ч: 'ch',
  ш: 'sh',
  щ: 'shch',
  ь: '',
  ю: 'yu',
  я: 'ya',
  ё: 'yo',
  ы: 'y',
  э: 'e',
  ъ: '',
};

const IGNORED_TEMPLATE_KEYS = new Set([
  '_schema_meta',
  'created_at',
  'updated_at',
  'meta',
]);

function isPlainRecord(val: unknown): val is Record<string, any> {
  return typeof val === 'object' && val !== null && !Array.isArray(val);
}

function cloneJson<T>(val: T): T {
  try {
    return JSON.parse(JSON.stringify(val)) as T;
  } catch {
    return val;
  }
}

export function getDefaultValueForArchetype(archetype: TemplateArchetype): any {
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

/** Транслітерує назву у безпечний ASCII-slug (`a-z0-9_`) */
export function toAsciiSlug(raw: string, fallback = 'section'): string {
  const lower = (raw || '').trim().toLowerCase();
  let transliterated = '';
  for (const ch of lower) {
    transliterated += CYRILLIC_TRANSLIT_MAP[ch] ?? ch;
  }
  const slug = transliterated
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
  return slug || fallback;
}

/**
 * Додає в копію `currentState` лише відсутні секції та ключі `_schema_meta.sections`
 * із `worldTemplate`, не перезаписуючи жодного вже існуючого поля персонажа.
 */
export function pullMissingSectionsFromTemplate(
  currentState: PlayerState | Record<string, any>,
  worldTemplate: Record<string, any> | null | undefined
): { nextState: PlayerState; addedTitles: string[] } {
  const nextState = cloneJson(
    isPlainRecord(currentState) ? currentState : { meta: { name: '' } }
  );

  if (!isPlainRecord(worldTemplate)) {
    return { nextState: nextState as PlayerState, addedTitles: [] };
  }

  const templateSections = isPlainRecord(worldTemplate._schema_meta?.sections)
    ? (worldTemplate._schema_meta.sections as Record<string, SchemaSectionMeta>)
    : {};

  if (!isPlainRecord(nextState._schema_meta)) {
    nextState._schema_meta = {
      version: worldTemplate._schema_meta?.version ?? 2,
      sections: {},
    };
  } else if (!isPlainRecord(nextState._schema_meta.sections)) {
    nextState._schema_meta.sections = {};
  }

  const addedTitles: string[] = [];

  // 1. Секції з _schema_meta.sections
  const sortedEntries = Object.entries(templateSections).sort(
    (a, b) => (a[1].order ?? 999) - (b[1].order ?? 999)
  );

  for (const [path, sectionMeta] of sortedEntries) {
    let addedHere = false;

    if (!isPlainRecord(nextState._schema_meta.sections[path])) {
      nextState._schema_meta.sections[path] = cloneJson(sectionMeta);
      addedHere = true;
    }

    const existingVal = getByPath(nextState, path);
    if (existingVal === undefined) {
      const templateVal = getByPath(worldTemplate, path);
      const fallbackVal =
        templateVal !== undefined
          ? cloneJson(templateVal)
          : getDefaultValueForArchetype(sectionMeta.archetype);
      setByPath(nextState, path, fallbackVal);
      addedHere = true;
    }

    if (addedHere) {
      addedTitles.push(sectionMeta.title || path);
    }
  }

  // 2. Невідмічені в _schema_meta верхньорівневі ключі шаблону (за потреби)
  for (const [key, val] of Object.entries(worldTemplate)) {
    if (IGNORED_TEMPLATE_KEYS.has(key)) continue;
    if (nextState[key] === undefined && val !== undefined) {
      nextState[key] = cloneJson(val);
      if (!addedTitles.includes(key) && !isPlainRecord(templateSections[key])) {
        addedTitles.push(key);
      }
    }
  }

  return { nextState: nextState as PlayerState, addedTitles };
}

export interface AddSectionInput {
  title: string;
  archetype: TemplateArchetype;
  placement: TemplatePlacement;
  icon: string;
  color: string;
}

function ensureMaterializedSchemaSections(
  nextState: Record<string, any>,
  fallbackSchema?: TemplateSchemaMeta | null
): void {
  if (!isPlainRecord(nextState._schema_meta)) {
    nextState._schema_meta = { version: fallbackSchema?.version ?? 2, sections: {} };
  }
  if (!isPlainRecord(nextState._schema_meta.sections)) {
    nextState._schema_meta.sections = {};
  }

  if (Object.keys(nextState._schema_meta.sections).length === 0) {
    const sourceSections =
      fallbackSchema?.sections && Object.keys(fallbackSchema.sections).length > 0
        ? fallbackSchema.sections
        : CLASSIC_SECTION_FALLBACKS;

    for (const [path, meta] of Object.entries(sourceSections)) {
      if (getByPath(nextState, path) !== undefined) {
        nextState._schema_meta.sections[path] = cloneJson(meta);
      }
    }
  }
}

/**
 * Генерує унікальний шлях секції, додає запис у `_schema_meta.sections` та порожнє значення відповідного типу.
 */
export function addCustomSectionToState(
  currentState: PlayerState | Record<string, any>,
  input: AddSectionInput,
  fallbackSchema?: TemplateSchemaMeta | null
): { nextState: PlayerState; sectionPath: string } {
  const nextState = cloneJson(
    isPlainRecord(currentState) ? currentState : { meta: { name: '' } }
  );

  ensureMaterializedSchemaSections(nextState, fallbackSchema);

  const baseSlug = toAsciiSlug(input.title, 'custom_section');
  const prefix = input.placement === 'details' ? 'custom_blocks.' : '';
  let candidatePath = `${prefix}${baseSlug}`;
  let suffix = 2;

  while (
    candidatePath in nextState._schema_meta.sections ||
    getByPath(nextState, candidatePath) !== undefined
  ) {
    candidatePath = `${prefix}${baseSlug}_${suffix}`;
    suffix += 1;
  }

  const existingOrders = Object.values(
    nextState._schema_meta.sections as Record<string, SchemaSectionMeta>
  ).map((s) => (typeof s.order === 'number' ? s.order : 0));
  const nextOrder = (existingOrders.length > 0 ? Math.max(...existingOrders) : 0) + 1;

  const sectionMeta: SchemaSectionMeta = {
    title: input.title.trim().toUpperCase(),
    icon: normalizeLucideIconKey(input.icon, 'box'),
    color: input.color || '#9CA3AF',
    archetype: input.archetype || inferArchetype(null),
    placement: input.placement || 'drawer_column',
    order: nextOrder,
  };

  nextState._schema_meta.sections[candidatePath] = sectionMeta;
  setByPath(nextState, candidatePath, getDefaultValueForArchetype(sectionMeta.archetype));

  return { nextState: nextState as PlayerState, sectionPath: candidatePath };
}

/**
 * Видаляє секцію з `_schema_meta.sections` та за її dot-шляхом у стані, щоб вона не відновлювалася авто-інференсом.
 */
export function removeSectionFromState(
  currentState: PlayerState | Record<string, any>,
  sectionPath: string,
  fallbackSchema?: TemplateSchemaMeta | null
): PlayerState {
  const nextState = cloneJson(
    isPlainRecord(currentState) ? currentState : { meta: { name: '' } }
  );

  ensureMaterializedSchemaSections(nextState, fallbackSchema);
  delete nextState._schema_meta.sections[sectionPath];

  const parts = sectionPath.split('.');
  let cursor: any = nextState;
  for (let i = 0; i < parts.length - 1; i++) {
    const part = parts[i];
    if (!isPlainRecord(cursor) || !isPlainRecord(cursor[part])) {
      return nextState as PlayerState;
    }
    cursor = cursor[part];
  }

  const leaf = parts[parts.length - 1];
  if (
    isPlainRecord(cursor) &&
    leaf !== '__proto__' &&
    leaf !== 'constructor' &&
    leaf !== 'prototype'
  ) {
    delete cursor[leaf];
  }

  return nextState as PlayerState;
}

/** Експортує анкету/заготовку у форматований `.json` файл */
export function exportCharacterJson(
  state: PlayerState | Record<string, any>,
  filenameBase?: string
): void {
  const rawName = filenameBase || state?.meta?.name || 'character_sheet';
  const slug = toAsciiSlug(String(rawName), 'character_sheet');
  const payload = JSON.stringify(state, null, 2);
  const blob = new Blob([payload], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);

  const link = document.createElement('a');
  link.href = url;
  link.download = `${slug}.json`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/** Читає та валідує імпортований JSON анкети персонажа */
export function parseAndValidateCharacterJson(jsonText: string): PlayerState {
  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonText);
  } catch {
    throw new Error('Файл не є валідним JSON-документом');
  }

  if (!isPlainRecord(parsed)) {
    throw new Error('JSON анкети повинен бути об’єктом');
  }

  const hasMeta = isPlainRecord(parsed.meta);
  const hasSchemaMeta = isPlainRecord(parsed._schema_meta);

  if (!hasMeta && !hasSchemaMeta) {
    throw new Error('У JSON відсутній блок "meta" або "_schema_meta"');
  }

  if (parsed._schema_meta !== undefined) {
    if (!isPlainRecord(parsed._schema_meta) || !isPlainRecord(parsed._schema_meta.sections)) {
      throw new Error('Некоректна структура "_schema_meta.sections" у файлі');
    }
  }

  const normalized = cloneJson(parsed);
  if (!isPlainRecord(normalized.meta)) {
    normalized.meta = { world_id: 'default_dark_fantasy', name: '' };
  }

  return normalized as PlayerState;
}
