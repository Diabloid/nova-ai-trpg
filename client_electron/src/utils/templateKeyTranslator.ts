import { worldsApi } from '../api/worldsApi';
import { useGameStore } from '../store/useGameStore';
import type { TemplateSchemaMeta } from '../types/api';
import {
  isFieldKeyResolvedLocally,
  normalizeFieldKey,
} from './characterBlockStyles';

const sessionTranslatedLabels = new Map<string, string>();
const sessionAttemptedKeys = new Set<string>();

/**
 * Одноразово запитує переклад лише для невідомих не-кириличних ключів анкети
 * через `POST /api/v1/templates/translate-keys` і кешує результат на сесію.
 */
export async function resolveMissingFieldKeyLabels(
  rawKeys: string[],
  existingFieldLabels?: Record<string, string> | null
): Promise<Record<string, string>> {
  const immediate: Record<string, string> = {};
  const keysToFetch: string[] = [];
  const seenFetchNorm = new Set<string>();

  for (const raw of rawKeys) {
    const trimmed = typeof raw === 'string' ? raw.trim() : '';
    if (!trimmed) continue;
    if (isFieldKeyResolvedLocally(trimmed, existingFieldLabels)) continue;

    const norm = normalizeFieldKey(trimmed);
    const cached = sessionTranslatedLabels.get(trimmed) ?? sessionTranslatedLabels.get(norm);
    if (cached) {
      immediate[trimmed] = cached;
      continue;
    }

    if (sessionAttemptedKeys.has(norm) || seenFetchNorm.has(norm)) {
      continue;
    }

    seenFetchNorm.add(norm);
    keysToFetch.push(trimmed);
  }

  if (keysToFetch.length === 0 || useGameStore.getState().backendOffline) {
    return immediate;
  }

  for (const k of keysToFetch) {
    sessionAttemptedKeys.add(normalizeFieldKey(k));
  }

  try {
    const res = await worldsApi.translateTemplateKeys(keysToFetch);
    const labels = res?.labels && typeof res.labels === 'object' ? res.labels : {};
    for (const [k, labelVal] of Object.entries(labels)) {
      if (typeof labelVal !== 'string') continue;
      const cleanLabel = labelVal.trim();
      if (!cleanLabel) continue;

      sessionTranslatedLabels.set(k, cleanLabel);
      sessionTranslatedLabels.set(normalizeFieldKey(k), cleanLabel);
      immediate[k] = cleanLabel;
    }
  } catch {
    // Тихий fallback: якщо мережа чи перекладач тимчасово недоступні, редактор продовжує працювати
  }

  return immediate;
}

function ensureSchemaMetaContainer(
  base: Record<string, any>,
  fallbackSchema?: TemplateSchemaMeta | null
): TemplateSchemaMeta {
  const prevMeta =
    base._schema_meta && typeof base._schema_meta === 'object' ? base._schema_meta : null;
  const fallbackLabels =
    fallbackSchema?.field_labels && typeof fallbackSchema.field_labels === 'object'
      ? fallbackSchema.field_labels
      : {};
  const prevLabels =
    prevMeta?.field_labels && typeof prevMeta.field_labels === 'object'
      ? prevMeta.field_labels
      : {};

  return {
    version: prevMeta?.version ?? fallbackSchema?.version ?? 1,
    sections: {
      ...(fallbackSchema?.sections || {}),
      ...(prevMeta?.sections || {}),
    },
    field_labels: {
      ...fallbackLabels,
      ...prevLabels,
    },
  };
}

/**
 * Повертає новий стан із оновленим або видаленим підписом у `_schema_meta.field_labels`.
 */
export function applyFieldLabelUpdate(
  state: Record<string, any>,
  rawKey: string,
  nextLabel: string,
  fallbackSchema?: TemplateSchemaMeta | null
): Record<string, any> {
  const cleanKey = rawKey.trim();
  if (!cleanKey) return state;

  const nextState = JSON.parse(JSON.stringify(state)) as Record<string, any>;
  const schemaMeta = ensureSchemaMetaContainer(nextState, fallbackSchema);
  const labels = { ...(schemaMeta.field_labels || {}) };

  if (nextLabel.trim().length > 0) {
    labels[cleanKey] = nextLabel;
  } else {
    delete labels[cleanKey];
    delete labels[normalizeFieldKey(cleanKey)];
  }

  schemaMeta.field_labels = labels;
  nextState._schema_meta = schemaMeta;
  return nextState;
}

/**
 * Додає нові перекладені підписи до `_schema_meta.field_labels`, не перетираючи вже наявні.
 */
export function mergeFieldLabelsIntoState(
  state: Record<string, any>,
  newLabels: Record<string, string>,
  fallbackSchema?: TemplateSchemaMeta | null
): Record<string, any> {
  const entries = Object.entries(newLabels).filter(
    ([, val]) => typeof val === 'string' && val.trim().length > 0
  );
  if (entries.length === 0) return state;

  const nextState = JSON.parse(JSON.stringify(state)) as Record<string, any>;
  const schemaMeta = ensureSchemaMetaContainer(nextState, fallbackSchema);
  const merged = { ...(schemaMeta.field_labels || {}) };
  let changed = false;

  for (const [k, label] of entries) {
    const cleanKey = k.trim();
    if (!cleanKey || merged[cleanKey]) continue;
    merged[cleanKey] = label.trim();
    changed = true;
  }

  if (!changed) return state;
  schemaMeta.field_labels = merged;
  nextState._schema_meta = schemaMeta;
  return nextState;
}
