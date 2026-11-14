import {
  Crown,
  Globe,
  Landmark,
  ScrollText,
  Skull,
  Sparkles,
  Sun,
  Zap,
  type LucideIcon,
} from 'lucide-react';

export interface CharacterBlockStyle {
  title: string;
  color: string;
  Icon: LucideIcon;
}

export const KNOWN_BLOCK_STYLES: Record<string, CharacterBlockStyle> = {
  reputation: { title: 'ФРАКЦІЇ ТА РЕПУТАЦІЯ', color: '#F59E0B', Icon: Landmark },
  magic_schools: { title: 'МАГІЧНІ ШКОЛИ', color: '#C084FC', Icon: Sparkles },
  afflictions: { title: 'ПРОКЛЯТТЯ ТА ХВОРОБИ', color: '#EF4444', Icon: Skull },
  blessings: { title: 'БЛАГОСЛОВЕННЯ ТА АУРИ', color: '#34D399', Icon: Sun },
  status_effects: { title: 'СТАТУСИ ТА ЕФЕКТИ', color: '#38BDF8', Icon: Zap },
  lore: { title: 'ЗНАННЯ СВІТУ ТА ТАЄМНИЦІ', color: '#A78BFA', Icon: ScrollText },
  titles_and_ranks: { title: 'ТИТУЛИ ТА ЗВАННЯ', color: '#FBBF24', Icon: Crown },
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
    Icon: Globe,
  };
}
