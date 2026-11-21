import type { StateCreator } from 'zustand';
import type {
  TemplatePreset,
  TemplateSchemaMeta,
  WorldDetailResponse,
  WorldSummary,
} from '../../types/api';
import type { ChatMessage } from '../../types/game';
import type { HeaderPatch } from '../../utils/dynamicSheet';

export type { HeaderPatch };

export interface SessionSlice {
  isWizardOpen: boolean;
  availableWorlds: WorldSummary[];
  activeWorldDetail: WorldDetailResponse | null;
  availablePresets: TemplatePreset[];
  selectedWorldId: string;
  selectedPresetId: string | null;
  templateOverride: Record<string, any> | null;
  isLoadingWorldSchema: boolean;

  openWizard: (initialWorldId?: string) => Promise<void>;
  closeWizard: () => void;
  abortWizard: () => void;
  selectWizardWorld: (worldId: string) => Promise<void>;
  selectWizardPreset: (presetId: string | null) => void;
  importCustomTemplate: (templateJson: Record<string, any>) => void;
  getActiveSchemaFallback: () => TemplateSchemaMeta | null;
}

export interface DraftSlice {
  wizardRawState: Record<string, any>;
  initialDraftSnapshot: string;
  lastSyncedSnapshot: string;
  hasUnsyncedEdits: boolean;
  lockedFields: string[];
  isSyncingDraft: boolean;

  updateWizardHeaderField: (patch: HeaderPatch) => void;
  updateWizardSectionValue: (sectionPath: string, nextValue: any) => void;
  updateWizardFieldLabel: (rawKey: string, nextLabel: string) => void;
  translateWizardKeys: (keys: string[]) => Promise<void>;
  setWizardRawState: (nextState: Record<string, any>) => void;
  syncWizardDraft: () => Promise<void>;
}

export interface DialogSlice {
  wizardMessages: ChatMessage[];
  wizardInput: string;
  isWizardThinking: boolean;
  isWizardTyping: boolean;
  wizardStatusText: string;

  setWizardInput: (text: string) => void;
  sendWizardMessage: (rawText: string) => Promise<void>;
  finalizeWizardCharacter: () => Promise<void>;
  finalizeWizard: () => Promise<void>;
}

export type WizardState = SessionSlice & DraftSlice & DialogSlice;

export type WizardSliceCreator<TSlice> = StateCreator<WizardState, [], [], TSlice>;
