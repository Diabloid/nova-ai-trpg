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

export function formatBlockTitle(raw: string): string {
  if (!raw) return '';
  const cleaned = raw.replace(/[_-]+/g, ' ').trim();
  return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
}

export function getCharacterBlockStyle(rawKey: string, uppercaseFallback = true): CharacterBlockStyle {
  const normalized = rawKey.toLowerCase();
  const known = KNOWN_BLOCK_STYLES[normalized];
  if (known) return known;

  const formatted = formatBlockTitle(rawKey);
  return {
    title: uppercaseFallback ? formatted.toUpperCase() : formatted,
    color: uppercaseFallback ? '#E5E7EB' : '#9CA3AF',
    iconKey: 'globe',
    Icon: Globe,
  };
}
