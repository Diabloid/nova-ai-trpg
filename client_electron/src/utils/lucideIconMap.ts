import {
  Activity,
  Backpack,
  BookOpen,
  Box,
  Brain,
  Briefcase,
  Coins,
  Compass,
  Cpu,
  Crosshair,
  Crown,
  Droplet,
  Eye,
  Feather,
  Flame,
  FlaskConical,
  Ghost,
  Gem,
  Globe,
  Heart,
  HeartPulse,
  Key,
  Landmark,
  MapPin,
  Moon,
  Package,
  Radiation,
  Radio,
  Rocket,
  ScrollText,
  Search,
  Shield,
  ShieldAlert,
  Skull,
  Sparkles,
  Star,
  Sun,
  Sword,
  Swords,
  Terminal,
  User,
  Users,
  Wand2,
  Wrench,
  Zap,
  type LucideIcon,
} from 'lucide-react';

/**
 * Централізований словник векторних іконок `lucide-react` для ключів із `_schema_meta` та `world.json`.
 * Жодних Unicode-емоджі: невідомі ключі безпечно фолбечаться на `Box` / `Globe`.
 */
export const LUCIDE_ICON_MAP: Record<string, LucideIcon> = {
  activity: Activity,
  backpack: Backpack,
  'book-open': BookOpen,
  book: BookOpen,
  box: Box,
  brain: Brain,
  briefcase: Briefcase,
  coins: Coins,
  compass: Compass,
  cpu: Cpu,
  crosshair: Crosshair,
  crown: Crown,
  droplet: Droplet,
  eye: Eye,
  feather: Feather,
  flame: Flame,
  'flask-conical': FlaskConical,
  flask: FlaskConical,
  gem: Gem,
  ghost: Ghost,
  globe: Globe,
  heart: Heart,
  'heart-pulse': HeartPulse,
  key: Key,
  landmark: Landmark,
  'map-pin': MapPin,
  moon: Moon,
  package: Package,
  radiation: Radiation,
  radio: Radio,
  rocket: Rocket,
  'scroll-text': ScrollText,
  scroll: ScrollText,
  search: Search,
  shield: Shield,
  'shield-alert': ShieldAlert,
  skull: Skull,
  sparkles: Sparkles,
  star: Star,
  sun: Sun,
  sword: Sword,
  swords: Swords,
  terminal: Terminal,
  user: User,
  users: Users,
  'wand-2': Wand2,
  wand: Wand2,
  wrench: Wrench,
  zap: Zap,
};

export const SUPPORTED_LUCIDE_ICON_KEYS = Object.keys(LUCIDE_ICON_MAP);

/** Нормалізує строковий ключ іконки і повертає відповідний Lucide-компонент із безпечним fallback */
export function getLucideIcon(
  iconKey?: string | null,
  fallback: LucideIcon = Box
): LucideIcon {
  if (!iconKey || typeof iconKey !== 'string') {
    return fallback;
  }
  const normalized = iconKey
    .trim()
    .toLowerCase()
    .replace(/[_\s]+/g, '-');
  return LUCIDE_ICON_MAP[normalized] ?? fallback;
}

/** Нормалізує ключ іконки до валідного ключа словника або повертає fallback-ключ */
export function normalizeLucideIconKey(
  iconKey?: string | null,
  fallbackKey: string = 'box'
): string {
  if (!iconKey || typeof iconKey !== 'string') {
    return fallbackKey;
  }
  const normalized = iconKey
    .trim()
    .toLowerCase()
    .replace(/[_\s]+/g, '-');
  return LUCIDE_ICON_MAP[normalized] ? normalized : fallbackKey;
}

/**
 * Конвертує hex-колір (#RRGGBB або #RGB) у `rgba(...)` для м'яких динамічних тінтів секцій.
 */
export function hexToRgba(hexColor: string | undefined, alpha: number, fallbackHex = '#9CA3AF'): string {
  const raw = (hexColor || fallbackHex).trim();
  const match = raw.match(/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/);
  const hex = match ? match[1] : fallbackHex.replace('#', '');

  const fullHex =
    hex.length === 3
      ? hex
          .split('')
          .map((ch) => `${ch}${ch}`)
          .join('')
      : hex;

  const r = Number.parseInt(fullHex.slice(0, 2), 16);
  const g = Number.parseInt(fullHex.slice(2, 4), 16);
  const b = Number.parseInt(fullHex.slice(4, 6), 16);

  if (Number.isNaN(r) || Number.isNaN(g) || Number.isNaN(b)) {
    return `rgba(156, 163, 175, ${alpha})`;
  }
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
