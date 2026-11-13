import type { PlayerState } from './api';

export interface ChatMessage {
  id: string;
  sender: 'Ти:' | 'Оповідач:' | 'Система:' | 'Творець Долі:' | string;
  text: string;
  senderColor?: string;
  timeText?: string;
  isPlayer: boolean;
  isSystem?: boolean;
  canRollback?: boolean;
  isStreaming?: boolean;
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
  rawState?: PlayerState | null;
}
