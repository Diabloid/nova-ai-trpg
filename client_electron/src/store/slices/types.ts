import type {
  CharacterSummary,
  CampaignSummary,
  PlayerState,
} from '../../types/api';
import type { ChatMessage, SystemAlert, DrawerTab } from '../../types/game';
import type { SyntaxSelectionRange } from '../../utils/novaSyntax';

export interface UiSlice {
  isLoading: boolean;
  isStreaming: boolean;
  statusText: string;

  isCharacterDrawerOpen: boolean;
  isSidebarOpen: boolean;
  isHeroSelectorOpen: boolean;
  activeDrawerTab: DrawerTab;
  expandedContainers: Record<string, boolean>;

  systemAlert: SystemAlert | null;

  setSystemAlert: (message: string, type?: 'info' | 'error' | 'success') => void;
  clearSystemAlert: () => void;

  toggleCharacterDrawer: () => void;
  toggleSidebar: () => void;
  toggleHeroSelector: () => void;
  setActiveDrawerTab: (tab: DrawerTab) => void;
  toggleContainerExpanded: (containerName: string) => void;
}

export interface EntitySlice {
  characters: CharacterSummary[];
  activeCharacterId: string | null;
  activeCharacter: PlayerState | null;

  campaigns: CampaignSummary[];
  activeCampaignId: string | null;
  activeCampaign: CampaignSummary | null;

  loadCharacters: () => Promise<void>;
  selectCharacter: (charId: string) => Promise<void>;
  updateCharacter: (charId: string, data: PlayerState) => Promise<void>;
  loadCampaigns: (charId: string, autoSelectFirst?: boolean) => Promise<void>;
  selectCampaign: (campaignId: string) => Promise<void>;
  createCampaign: (title?: string) => Promise<CampaignSummary | null>;
  togglePinCampaign: (campaignId: string) => Promise<void>;
  deleteCampaign: (campaignId: string) => Promise<void>;
  deleteCharacter: (charId: string) => Promise<void>;
}

export interface GameplaySlice {
  playerState: PlayerState | null;
  messages: ChatMessage[];
  userInput: string;
  suppressedSpans: SyntaxSelectionRange[];

  sendPlayerAction: (rawText: string) => Promise<void>;
  rollbackLastTurn: () => Promise<void>;

  setUserInput: (text: string) => void;
  setSuppressedSpans: (spans: SyntaxSelectionRange[]) => void;
}

export type GameState = UiSlice & EntitySlice & GameplaySlice;
