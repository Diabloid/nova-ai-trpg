import type { PlayerState, TemplateArchetype, TemplatePlacement } from './api';
import type { NovaToken, SyntaxSelectionRange } from '../utils/novaSyntax';

export interface ChatMessage {
  id: string;
  sender: 'Ти:' | 'Оповідач:' | 'Творець Долі:' | string;
  text: string;
  tokens?: NovaToken[];
  senderColor?: string;
  timeText?: string;
  isPlayer?: boolean;
  role?: 'player' | 'narrator' | 'system';
  canRollback?: boolean;
  isStreaming?: boolean;
  isRollingBack?: boolean;
  isFailed?: boolean;
  retryPayload?: {
    rawText: string;
    suppressedSpans: SyntaxSelectionRange[];
  };
  createdAt?: string;
}

export interface SystemAlert {
  id: string;
  message: string;
  type?: 'info' | 'error' | 'success';
  expiresAt: number;
}

export interface DynamicCustomBlock {
  key: string;
  title: string;
  icon: string;
  accentColor: string;
  fields?: Array<{ key: string; label: string; value: string }>;
  tags?: string[];
  items?: string[];
}

export type DrawerTab = 'injuries' | 'worn' | 'abilities' | 'containers' | 'details';

export interface CharacterWizardDraft {
  world_id?: string;
  charName: string;
  charTitles: string;
  charAge: string;
  charBackground: string;
  charAppearance: string;
  charLocation: string;
  physique: string;
  height: string;
  eyes: string;
  hair: string;
  raceTraits: string;
  biography: string;
  overallHealth: string;
  injuries: Array<any>;
  abilities: Array<any>;
  equipment: Array<any>;
  customBlocks: Record<string, any>;
  rawState?: PlayerState | null;
}

export interface ParsedSheetSection {
  key: string;
  path: string;
  title: string;
  icon: string;
  color: string;
  archetype: TemplateArchetype;
  placement: TemplatePlacement;
  order: number;
  value: any;
  isAutoInferred?: boolean;
}

export interface HeaderBadgeItem {
  key: string;
  path: string;
  label: string;
  value: string;
  color: string;
  icon: string;
}

export interface HeaderAnchors {
  name: string;
  location: string;
  overallState?: string;
  avatar?: string;
  headerBadges: HeaderBadgeItem[];
}

export interface ParsedDynamicSheet {
  headers: HeaderAnchors;
  drawerColumns: ParsedSheetSection[];
  detailSections: ParsedSheetSection[];
  headerBadges: HeaderBadgeItem[];
  allSections: ParsedSheetSection[];
  allEditableSections: ParsedSheetSection[];
}
