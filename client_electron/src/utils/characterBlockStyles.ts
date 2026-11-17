import { Globe, type LucideIcon } from 'lucide-react';
import { getLucideIcon } from './lucideIconMap';

export interface CharacterBlockStyle {
  title: string;
  color: string;
  iconKey: string;
  Icon: LucideIcon;
}

export const KNOWN_BLOCK_STYLES: Record<string, CharacterBlockStyle> = {
  reputation: {
    title: 'ФРАКЦІЇ ТА РЕПУТАЦІЯ',
    color: '#F59E0B',
    iconKey: 'landmark',
    Icon: getLucideIcon('landmark'),
  },
  magic_schools: {
    title: 'МАГІЧНІ ШКОЛИ',
    color: '#C084FC',
    iconKey: 'sparkles',
    Icon: getLucideIcon('sparkles'),
  },
  afflictions: {
    title: 'ПРОКЛЯТТЯ ТА ХВОРОБИ',
    color: '#EF4444',
    iconKey: 'skull',
    Icon: getLucideIcon('skull'),
  },
  blessings: {
    title: 'БЛАГОСЛОВЕННЯ ТА АУРИ',
    color: '#34D399',
    iconKey: 'sun',
    Icon: getLucideIcon('sun'),
  },
  status_effects: {
    title: 'СТАТУСИ ТА ЕФЕКТИ',
    color: '#38BDF8',
    iconKey: 'zap',
    Icon: getLucideIcon('zap'),
  },
  lore: {
    title: 'ЗНАННЯ СВІТУ ТА ТАЄМНИЦІ',
    color: '#A78BFA',
    iconKey: 'scroll-text',
    Icon: getLucideIcon('scroll-text'),
  },
  titles_and_ranks: {
    title: 'ТИТУЛИ ТА ЗВАННЯ',
    color: '#FBBF24',
    iconKey: 'crown',
    Icon: getLucideIcon('crown'),
  },
};

export const KNOWN_FIELD_LABELS: Record<string, string> = {
  magic_circle: 'Магічне коло',
  faction: 'Фракція',
  patron: 'Покровитель',
  rank: 'Ранг',
  title: 'Титул',
  titles: 'Титули',
  reputation: 'Репутація',
  religion: 'Віра',
  faith: 'Віра',
  notes: 'Нотатки',
  guild: 'Гільдія',
  order: 'Орден',
  clan: 'Клан',
  status: 'Статус',
  origin: 'Походження',
  race: 'Раса',
  class: 'Клас',
  level: 'Рівень',
  specialty: 'Спеціалізація',
  alignment: 'Світогляд',
  allegiance: 'Вірність',
  physique: 'Статура',
  height: 'Зріст',
  eyes: 'Очі',
  hair: 'Волосся',
  race_traits: 'Расові риси',
};

export function formatBlockTitle(raw: string): string {
  if (!raw) return '';
  const cleaned = raw.replace(/[_-]+/g, ' ').trim();
  return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
}

/** Локалізує ключ поля для read-відображення, залишаючи JSON-ключі незмінними у mode="edit" */
export function localizeFieldKey(rawKey: string): string {
  if (!rawKey) return '';
  const normalized = rawKey.trim().toLowerCase().replace(/[\s-]+/g, '_');
  return KNOWN_FIELD_LABELS[normalized] ?? formatBlockTitle(rawKey);
}

export function getCharacterBlockStyle(rawKey: string, uppercaseFallback = true): CharacterBlockStyle {
  const normalized = rawKey.toLowerCase();
  const known = KNOWN_BLOCK_STYLES[normalized];
  if (known) return known;

  const formatted = localizeFieldKey(rawKey);
  return {
    title: uppercaseFallback ? formatted.toUpperCase() : formatted,
    color: uppercaseFallback ? '#E5E7EB' : '#9CA3AF',
    iconKey: 'globe',
    Icon: Globe,
  };
}
