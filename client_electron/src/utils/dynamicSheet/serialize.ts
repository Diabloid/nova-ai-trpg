import type { PlayerState } from '../../types/api';
import type { ParsedSheetSection } from '../../types/game';
import { cloneJsonSafe, isPlainObject, setByPath } from './paths';

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
