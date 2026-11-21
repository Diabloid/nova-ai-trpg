import type { ChatMessage } from '../../types/game';
import { getByPath, setByPath } from '../../utils/dynamicSheetParser';
import { formatSystemTime } from '../../utils/formatTime';
import { useGameStore } from '../useGameStore';

export const DEFAULT_WORLD_ID = 'default_dark_fantasy';

export const DEFAULT_FALLBACK_TEMPLATE: Record<string, any> = {
  _schema_meta: {
    version: 2,
    sections: {
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
      'meta.biography': {
        title: 'ХРОНІКА ТА БІОГРАФІЯ',
        icon: 'scroll-text',
        color: '#F59E0B',
        archetype: 'long_text',
        placement: 'details',
        order: 5,
      },
    },
  },
  meta: {
    world_id: DEFAULT_WORLD_ID,
    name: '',
    location: '',
    appearance: '',
    biography: '',
  },
  anatomy_and_health: {
    overall_state: 'Повний сил',
    injuries: [],
  },
  storage_and_equipment: {
    worn: [],
    containers: {},
  },
  abilities: [],
};

let wizardAbortController: AbortController | null = null;

export function abortActiveWizardRequest(): void {
  if (wizardAbortController) {
    wizardAbortController.abort();
    wizardAbortController = null;
  }
}

export function createWizardAbortSignal(): AbortSignal {
  abortActiveWizardRequest();
  wizardAbortController = new AbortController();
  return wizardAbortController.signal;
}

export function isWizardActionBlockedOffline(actionLabel: string): boolean {
  if (!useGameStore.getState().backendOffline) return false;
  useGameStore
    .getState()
    .setSystemAlert(`Сервер офлайн — ${actionLabel} тимчасово недоступна.`, 'warning');
  return true;
}

export function cloneDeep<T>(value: T): T {
  try {
    return JSON.parse(JSON.stringify(value)) as T;
  } catch {
    return value;
  }
}

function normalizeForSnapshot(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(normalizeForSnapshot);
  }
  if (value && typeof value === 'object') {
    const sorted: Record<string, unknown> = {};
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      sorted[key] = normalizeForSnapshot((value as Record<string, unknown>)[key]);
    }
    return sorted;
  }
  return value;
}

export function serializeStableSnapshot(state: unknown): string {
  try {
    return JSON.stringify(normalizeForSnapshot(state));
  } catch {
    return '';
  }
}

export function isFieldUnlocked(lockedPath: string, unlockedList: string[]): boolean {
  if (!unlockedList || unlockedList.length === 0) return false;
  return unlockedList.some((raw) => {
    const u = typeof raw === 'string' ? raw.trim() : '';
    if (!u) return false;
    return (
      u === lockedPath ||
      lockedPath.startsWith(`${u}.`) ||
      u.startsWith(`${lockedPath}.`)
    );
  });
}

export function addLockedPaths(existing: string[], additions: string[]): string[] {
  if (additions.length === 0) return existing;
  const next = new Set(existing);
  for (const path of additions) {
    if (path) next.add(path);
  }
  return Array.from(next);
}

export function buildInitialRawState(
  template: Record<string, any> | null | undefined,
  worldId: string
): Record<string, any> {
  const base =
    template && typeof template === 'object' && !Array.isArray(template)
      ? cloneDeep(template)
      : cloneDeep(DEFAULT_FALLBACK_TEMPLATE);

  if (!base.meta || typeof base.meta !== 'object' || Array.isArray(base.meta)) {
    base.meta = {};
  }
  base.meta.world_id = worldId;
  return base;
}

export function mergeServerDraftWithSchema(
  prevRaw: Record<string, any>,
  serverDraft: Record<string, any>,
  worldId: string,
  fallbackTemplate: Record<string, any> | null,
  lockedFields: string[] = [],
  unlockedFields: string[] = []
): Record<string, any> {
  const next = cloneDeep(serverDraft);
  if (!next.meta || typeof next.meta !== 'object' || Array.isArray(next.meta)) {
    next.meta = {};
  }
  next.meta.world_id = next.meta.world_id || worldId;

  const fallbackSchema =
    prevRaw._schema_meta || fallbackTemplate?._schema_meta;
  if (!next._schema_meta && fallbackSchema) {
    next._schema_meta = cloneDeep(fallbackSchema);
  } else if (prevRaw._schema_meta?.field_labels) {
    next._schema_meta = {
      ...(next._schema_meta || { version: 1, sections: {} }),
      field_labels: {
        ...(prevRaw._schema_meta.field_labels || {}),
        ...(next._schema_meta?.field_labels || {}),
      },
    };
  }
  if (prevRaw.meta?.avatar && !next.meta.avatar) {
    next.meta.avatar = prevRaw.meta.avatar;
  }

  for (const lockedPath of lockedFields) {
    const lockedVal = getByPath(prevRaw, lockedPath);
    if (lockedVal !== undefined) {
      setByPath(next, lockedPath, cloneDeep(lockedVal));
    }
  }

  if (
    typeof prevRaw.meta?.name === 'string' &&
    prevRaw.meta.name.trim() &&
    (!next.meta.name || !String(next.meta.name).trim()) &&
    !lockedFields.includes('meta.name') &&
    !isFieldUnlocked('meta.name', unlockedFields)
  ) {
    next.meta.name = prevRaw.meta.name;
  }
  return next;
}

export function createStarterGreeting(worldTitle?: string): ChatMessage {
  const worldMention = worldTitle ? ` (світ «${worldTitle}»)` : '';
  return {
    id: `wizard-starter-${Date.now()}`,
    sender: 'Творець Долі:',
    text: `Вітаю у чертогах буття, Мандрівнику${worldMention}. Я — Творець Долі. Розкажи, ким ти бачиш свого героя? Яке його ім'я, фах або походження? Які таємниці чи випробування несе його минуле?`,
    senderColor: '#C084FC',
    timeText: formatSystemTime(),
    isPlayer: false,
  };
}
