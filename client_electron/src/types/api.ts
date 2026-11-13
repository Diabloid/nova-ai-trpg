/**
 * NOVA AI TRPG — API & DTO Contract (v1.5.2)
 * Strictly matches Backend_Python/schemas/game_dto.py and docs/API_CONTRACT.md
 */

export interface IntentItem {
  type: 'action' | 'speech' | 'thought' | 'ooc' | string;
  content: string;
}

export interface ActionRequest {
  raw_text: string;
  intents?: IntentItem[];
  session_id?: string;
}

export interface ItemObject {
  name: string;
  desc?: string;
}

export interface InjuryItem {
  location: string;
  type?: string;
  description?: string;
}

export interface AbilityItem {
  name: string;
  desc?: string;
}

export interface PlayerMeta {
  name: string;
  first_name?: string;
  last_name?: string;
  patronymic?: string;
  titles?: string | string[];
  age?: string | number;
  background?: string;
  location?: string;
  appearance?: string;
  appearance_details?: {
    physique?: string;
    height?: string;
    eyes?: string;
    hair?: string;
    race_traits?: string;
    [key: string]: any;
  } | null;
  biography?: string;
  [key: string]: any;
}

export interface AnatomyAndHealth {
  overall_state: string;
  injuries: Array<InjuryItem | Record<string, any> | string>;
  [key: string]: any;
}

export interface StorageAndEquipment {
  worn: Array<ItemObject | Record<string, any> | string>;
  containers: Record<string, Array<ItemObject | Record<string, any> | string>>;
  [key: string]: any;
}

export interface PlayerState {
  meta: PlayerMeta;
  anatomy_and_health: AnatomyAndHealth;
  storage_and_equipment: StorageAndEquipment;
  abilities: Array<AbilityItem | Record<string, any> | string>;
  custom_blocks?: Record<string, any>;
  [key: string]: any;
}

export interface ActionResponse {
  status: 'success' | 'error' | string;
  story: string;
  raw_llm_state?: string | null;
  player_state?: PlayerState | Record<string, any> | null;
  error_message?: string | null;
}

export interface CharacterSummary {
  char_id: string;
  name: string;
  background: string;
  appearance?: string;
  created_at: string;
}

export interface CampaignSummary {
  campaign_id: string;
  char_id: string;
  title: string;
  current_location: string;
  is_pinned: boolean;
  created_at: string;
  last_played: string;
}

export interface CampaignCreateRequest {
  title?: string;
}

export interface CampaignPinRequest {
  is_pinned: boolean;
}

export interface HistoryMessage {
  role: 'player' | 'narrator' | 'system' | string;
  text: string;
  timestamp: string;
}

export interface RollbackResponse {
  previous_user_input: string;
  current_state: PlayerState;
  message: string;
}

export interface CharacterDialogHistoryItem {
  role: 'player' | 'narrator' | 'user' | 'assistant' | string;
  content: string;
}

export interface CharacterDialogRequest {
  message: string;
  history?: CharacterDialogHistoryItem[];
  include_draft?: boolean;
}

export interface CharacterDialogResponse {
  reply: string;
  draft_state?: PlayerState | null;
}

export interface CharacterFinalizeRequest {
  dialog_summary?: string;
  history?: CharacterDialogHistoryItem[];
  char_id?: string;
  draft_state?: PlayerState | null;
}

export interface VoiceTranscriptionResponse {
  text: string;
}
