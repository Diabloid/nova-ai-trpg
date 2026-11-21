import type {
  CampaignSummary,
  PlayerState,
  SchemaSectionMeta,
  TemplateSchemaMeta,
} from '../../types/api';
import type { HeaderAnchors, HeaderBadgeItem } from '../../types/game';
import {
  formatBlockTitle,
  isTechnicalFieldKey,
  localizeFieldKey,
} from '../characterBlockStyles';
import { normalizeLucideIconKey } from '../lucideIconMap';
import { extractMergedFieldLabels } from './archetypes';
import { getByPath, isPlainObject } from './paths';

export function findFirstNameFallback(state: Record<string, any>): string {
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

export function findOverallStateFallback(state: Record<string, any>): string | undefined {
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

export function buildHeaderBadges(
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
  const rawName =
    typeof meta.name === 'string' && meta.name.trim()
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
