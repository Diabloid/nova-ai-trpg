import type { TemplateArchetype, TemplateSchemaMeta } from '../../types/api';
import { isPlainObject } from './paths';

const TAG_KEY_HINTS = new Set(['tags', 'skills', 'perks', 'traits', 'languages']);

export function extractMergedFieldLabels(
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
