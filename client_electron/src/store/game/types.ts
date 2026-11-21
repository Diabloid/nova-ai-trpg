import type {
  CharacterSummary,
  CampaignSummary,
  PlayerState,
  WorldDetailResponse,
  WorldSummary,
} from '../../types/api';
import type { ChatMessage, SystemAlert, SystemAlertType, DrawerTab } from '../../types/game';
import type { SyntaxSelectionRange } from '../../utils/novaSyntax';

export interface UiSlice {
  isLoading: boolean;
  isStreaming: boolean;
  backendOffline: boolean;
  statusText: string;

  isCharacterDrawerOpen: boolean;
  isSidebarOpen: boolean;
  isHeroSelectorOpen: boolean;
  activeDrawerTab: DrawerTab;
  expandedContainers: Record<string, boolean>;

  systemAlert: SystemAlert | null;
  isSystemAlertVisible: boolean;

  setSystemAlert: (message: string, type?: SystemAlertType) => void;
  clearSystemAlert: () => void;
  setBackendOffline: (offline: boolean) => void;

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
  updateCampaignState: (campaignId: string, data: PlayerState) => Promise<void>;
  loadCampaigns: (charId: string, autoSelectFirst?: boolean) => Promise<void>;
  selectCampaign: (campaignId: string) => Promise<void>;
  createCampaign: (title?: string) => Promise<CampaignSummary | null>;
  togglePinCampaign: (campaignId: string) => Promise<void>;
  deleteCampaign: (campaignId: string) => Promise<void>;
  deleteCharacter: (charId: string) => Promise<void>;
}

export interface RollbackGhostRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface RollbackGhostState {
  text: string;
  fromRect: RollbackGhostRect;
  toRect: RollbackGhostRect;
}

export interface GameplaySlice {
  playerState: PlayerState | null;
  messages: ChatMessage[];
  userInput: string;
  suppressedSpans: SyntaxSelectionRange[];
  isRollingBack: boolean;
  activeCampaignRollbackDepth: number;
  rollbackInputSignal: number;
  rollbackGhost: RollbackGhostState | null;

  sendPlayerAction: (rawText: string) => Promise<void>;
  retryFailedAction: (messageId: string) => Promise<void>;
  rollbackLastTurn: () => Promise<void>;

  setUserInput: (text: string) => void;
  setSuppressedSpans: (spans: SyntaxSelectionRange[]) => void;
}

export interface WorldSlice {
  worlds: WorldSummary[];
  activeWorldId: string;
  activeWorldDetail: WorldDetailResponse | null;
  isWorldSelectorOpen: boolean;

  toggleWorldSelector: () => void;
  setWorldSelectorOpen: (open: boolean) => void;
  loadWorlds: () => Promise<void>;
  selectWorld: (worldId: string) => Promise<void>;
}

export type GameState = UiSlice & EntitySlice & GameplaySlice & WorldSlice;
