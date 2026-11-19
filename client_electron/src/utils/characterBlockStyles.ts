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
  // Здоров'я та життєві ресурси
  hp: 'ОЗ (HP)',
  health: 'Здоров’я',
  max_hp: 'Макс. ОЗ',
  mp: 'ОМ (MP)',
  mana: 'Мана',
  max_mp: 'Макс. Мана',
  stamina: 'Витривалість',
  energy: 'Енергія',
  ap: 'Очки дій',
  action_points: 'Очки дій',
  sanity: 'Розсудок',
  stress: 'Стрес',
  fatigue: 'Втома',
  hunger: 'Голод',
  thirst: 'Спрага',
  radiation: 'Радіація',
  corruption: 'Скверна',
  demonic_corruption: 'Демонічна скверна',
  humanity: 'Людяність',
  shield: 'Щит',
  barrier: 'Бар’єр',
  morale: 'Мораль',
  poison: 'Отруєння',

  // Бойові показники
  ac: 'Клас броні',
  armor: 'Броня',
  armor_class: 'Клас броні',
  defense: 'Захист',
  evasion: 'Ухилення',
  dodge: 'Ухилення',
  block: 'Блок',
  parry: 'Парирування',
  initiative: 'Ініціатива',
  speed: 'Швидкість',
  movement: 'Переміщення',
  damage: 'Шкода',
  attack: 'Атака',
  accuracy: 'Влучність',
  crit: 'Крит',
  crit_chance: 'Шанс криту',
  range: 'Дальність',
  ammo: 'Набої',
  ammunition: 'Боєзапас',
  magazine: 'Магазин',
  reload: 'Перезарядка',
  style_rank: 'Ранг стилю',
  resistance: 'Опір',

  // Базові атрибути (RPG / Cyberpunk / Dark Fantasy)
  str: 'Сила',
  strength: 'Сила',
  dex: 'Спритність',
  dexterity: 'Спритність',
  agi: 'Спритність',
  agility: 'Спритність',
  con: 'Тілобудова',
  constitution: 'Тілобудова',
  endurance: 'Витривалість',
  body: 'Статура',
  int: 'Інтелект',
  intelligence: 'Інтелект',
  wis: 'Мудрість',
  wisdom: 'Мудрість',
  cha: 'Харизма',
  charisma: 'Харизма',
  per: 'Сприйняття',
  perception: 'Сприйняття',
  luck: 'Удача',
  willpower: 'Сила волі',
  resolve: 'Рішучість',
  focus: 'Фокус',
  reflexes: 'Рефлекси',
  cool: 'Холоднокровність',
  tech: 'Техніка',
  empathy: 'Емпатія',
  stealth: 'Непомітність',
  athletics: 'Атлетика',
  persuasion: 'Переконання',
  intimidation: 'Залякування',

  // Магія та технології
  magic_circle: 'Магічне коло',
  magic_power: 'Магічна міць',
  spell_slots: 'Комірки заклять',
  mana_regen: 'Відновлення мани',
  cyberware: 'Кіберімпланти',
  ram: 'ОЗП (RAM)',
  heat: 'Перегрів',
  overheat: 'Перегрів',
  resonance: 'Резонанс',
  ether: 'Ефір',
  mana_core: 'Ядро мани',

  // Соціальні поля та прогресія
  faction: 'Фракція',
  patron: 'Покровитель',
  rank: 'Ранг',
  tier: 'Рівень сили',
  title: 'Титул',
  titles: 'Титули',
  reputation: 'Репутація',
  notoriety: 'Слава / Розшук',
  karma: 'Карма',
  honor: 'Честь',
  influence: 'Вплив',
  religion: 'Віра',
  faith: 'Віра',
  deity: 'Божество',
  notes: 'Нотатки',
  guild: 'Гільдія',
  order: 'Орден',
  clan: 'Клан',
  status: 'Статус',
  condition: 'Стан',
  state: 'Стан',
  origin: 'Походження',
  race: 'Раса',
  species: 'Вид',
  ancestry: 'Походження',
  class: 'Клас',
  subclass: 'Підклас',
  archetype: 'Архетип',
  profession: 'Професія',
  occupation: 'Рід занять',
  level: 'Рівень',
  xp: 'Досвід (XP)',
  experience: 'Досвід',
  specialty: 'Спеціалізація',
  role: 'Роль',
  alignment: 'Світогляд',
  allegiance: 'Вірність',

  // Зовнішність і біографія
  age: 'Вік',
  gender: 'Стать',
  physique: 'Статура',
  build: 'Статура',
  height: 'Зріст',
  eyes: 'Очі',
  hair: 'Волосся',
  skin: 'Шкіра',
  scars: 'Шрами',
  marks: 'Особливі прикмети',
  race_traits: 'Расові риси',
  traits: 'Риси',
  flaws: 'Недоліки',
  perks: 'Перки',
  skills: 'Навички',
  talents: 'Таланти',
  languages: 'Мови',
  bonds: 'Прив’язаності',
  ideals: 'Ідеали',
  goals: 'Цілі',

  // Інвентар, економіка та властивості карток
  gold: 'Золото',
  coins: 'Монети',
  silver: 'Срібло',
  copper: 'Мідь',
  credits: 'Кредити',
  money: 'Гроші',
  currency: 'Валюта',
  wealth: 'Статки',
  quantity: 'Кількість',
  qty: 'Кількість',
  count: 'Кількість',
  amount: 'Кількість',
  weight: 'Вага',
  encumbrance: 'Навантаження',
  capacity: 'Місткість',
  charges: 'Заряди',
  uses: 'Використань',
  durability: 'Міцність',
  rarity: 'Рідкість',
  quality: 'Якість',
  value: 'Цінність',
  price: 'Ціна',
  cost: 'Вартість',
  slot: 'Слот',
  slots: 'Слоти',
  type: 'Тип',
  category: 'Категорія',
  effect: 'Ефект',
  duration: 'Тривалість',
  cooldown: 'Відкат',
  location: 'Локація',
};

const TECHNICAL_FIELD_KEYS = new Set(['id', 'uid', 'uuid']);

export function isTechnicalFieldKey(rawKey: string): boolean {
  if (!rawKey) return false;
  return TECHNICAL_FIELD_KEYS.has(rawKey.trim().toLowerCase());
}

export function containsCyrillic(text: string): boolean {
  return /[а-яА-ЯіїєґІЇЄҐ]/u.test(text);
}

export function normalizeFieldKey(rawKey: string): string {
  return rawKey.trim().toLowerCase().replace(/[\s-]+/g, '_');
}

export function formatBlockTitle(raw: string): string {
  if (!raw) return '';
  const cleaned = raw.replace(/[_-]+/g, ' ').trim();
  return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
}

function resolveCustomFieldLabel(
  rawKey: string,
  trimmed: string,
  norm: string,
  fieldLabels?: Record<string, string> | null
): string | null {
  const candidate =
    fieldLabels?.[rawKey] ?? fieldLabels?.[trimmed] ?? fieldLabels?.[norm];
  if (typeof candidate !== 'string') return null;
  const clean = candidate.trim();
  return clean.length > 0 ? clean : null;
}

/**
 * Повертає true, якщо ключ вже не потребує запиту до LLM-перекладача
 * (містить кирилицю, є технічним або має локальний словниковий / кириличний підпис).
 */
export function isFieldKeyResolvedLocally(
  rawKey: string,
  fieldLabels?: Record<string, string> | null
): boolean {
  const trimmed = rawKey.trim();
  if (!trimmed) return true;
  if (isTechnicalFieldKey(trimmed) || containsCyrillic(trimmed)) return true;

  const norm = normalizeFieldKey(trimmed);
  if (KNOWN_FIELD_LABELS[norm]) return true;

  const customLabel = resolveCustomFieldLabel(rawKey, trimmed, norm, fieldLabels);
  return Boolean(customLabel && containsCyrillic(customLabel));
}

/**
 * Локалізує ключ поля для read-відображення:
 * не-кириличний `customLabel` зі старого сейву не перекриває `KNOWN_FIELD_LABELS[norm]`.
 */
export function localizeFieldKey(
  rawKey: string,
  fieldLabels?: Record<string, string> | null
): string {
  if (!rawKey) return '';
  const trimmed = rawKey.trim();
  const norm = normalizeFieldKey(trimmed);

  const customLabel = resolveCustomFieldLabel(rawKey, trimmed, norm, fieldLabels);
  const knownLabel = KNOWN_FIELD_LABELS[norm];

  if (customLabel && (containsCyrillic(customLabel) || !knownLabel)) {
    return customLabel;
  }

  return knownLabel ?? formatBlockTitle(rawKey);
}

export function getCharacterBlockStyle(
  rawKey: string,
  uppercaseFallback = true,
  fieldLabels?: Record<string, string> | null
): CharacterBlockStyle {
  const normalized = rawKey.toLowerCase();
  const known = KNOWN_BLOCK_STYLES[normalized];
  if (known) return known;

  const formatted = localizeFieldKey(rawKey, fieldLabels);
  return {
    title: uppercaseFallback ? formatted.toUpperCase() : formatted,
    color: uppercaseFallback ? '#E5E7EB' : '#9CA3AF',
    iconKey: 'globe',
    Icon: Globe,
  };
}
