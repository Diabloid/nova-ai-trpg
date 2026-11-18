/**
 * NOVA AI TRPG — API & DTO Contract (v2.0.0)
 * Strictly matches Backend_Python/schemas/game_dto.py and docs/API_CONTRACT.md
 */

export type TemplateArchetype =
  | 'card_list'
  | 'container_map'
  | 'stat_grid'
  | 'long_text'
  | 'tag_list'
  | string;

export type TemplatePlacement = 'drawer_column' | 'details' | 'header_badge' | string;

export interface SchemaSectionMeta {
  title: string;
  icon?: string;
  color?: string;
  archetype: TemplateArchetype;
  placement: TemplatePlacement;
  order?: number;
}

export interface TemplateSchemaMeta {
  version: number;
  sections: Record<string, SchemaSectionMeta>;
}

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
  world_id?: string;
  name: string;
  first_name?: string;
  last_name?: string;
  patronymic?: string;
  titles?: string | string[];
  age?: string | number;
  background?: string;
  location?: string;
  overall_state?: string;
  avatar?: string;
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
  anatomy_and_health?: AnatomyAndHealth;
  storage_and_equipment?: StorageAndEquipment;
  abilities?: Array<AbilityItem | Record<string, any> | string>;
  custom_blocks?: Record<string, any>;
  _schema_meta?: TemplateSchemaMeta;
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
  world_id: string;
  name: string;
  background: string;
  appearance?: string;
  avatar?: string;
  created_at: string;
  updated_at?: string;
}

export interface CampaignSummary {
  campaign_id: string;
  char_id: string;
  world_id: string;
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
  world_id?: string;
  template_override?: Record<string, any> | null;
}

export interface CharacterDialogResponse {
  reply: string;
  draft_state?: PlayerState | null;
}

export interface CharacterSyncRequest {
  draft_state: Record<string, any>;
  world_id?: string;
  template_override?: Record<string, any> | null;
}

export interface CharacterFinalizeRequest {
  dialog_summary?: string;
  history?: CharacterDialogHistoryItem[];
  char_id?: string;
  draft_state?: PlayerState | Record<string, any> | null;
  world_id?: string;
  template_override?: Record<string, any> | null;
}

export interface VoiceTranscriptionResponse {
  text: string;
}

export interface WorldAiPrompts {
  narrator_rules: string;
  analyzer_rules: string;
  creator_rules: string;
  world_tone: string;
}

export interface WorldSummary {
  world_id: string;
  title: string;
  genre: string;
  description: string;
  icon: string;
  accent_color: string;
  character_count: number;
  is_default: boolean;
  created_at: string;
  updated_at: string;
}

export interface WorldLoreArticleInfo {
  filename: string;
  title: string;
  size_bytes: number;
  est_tokens: number;
}

export interface WorldDetailResponse extends WorldSummary {
  author: string;
  starting_locations: string[];
  ai_prompts: WorldAiPrompts;
  character_template: Record<string, any>;
  lore_articles: WorldLoreArticleInfo[];
  total_lore_bytes: number;
  total_lore_tokens: number;
}

export interface TemplatePreset {
  id: string;
  title: string;
  genre: string;
  description: string;
  icon: string;
  template: Record<string, any>;
}

export interface WorldCreateRequest {
  world_id?: string;
  title: string;
  genre?: string;
  description?: string;
  author?: string;
  icon?: string;
  accent_color?: string;
  starting_locations?: string[];
  ai_prompts?: WorldAiPrompts;
  character_template?: Record<string, any>;
}

export interface WorldUpdateRequest {
  title?: string;
  genre?: string;
  description?: string;
  author?: string;
  icon?: string;
  accent_color?: string;
  starting_locations?: string[];
  ai_prompts?: WorldAiPrompts;
  character_template?: Record<string, any>;
}

export interface WorldCloneRequest {
  new_title: string;
  new_world_id?: string;
  include_lore?: boolean;
}

export interface WorldDeleteConflict {
  detail: string;
  world_id: string;
  dependent_characters: number;
  dependent_campaigns: number;
}

export interface LoreArticleResponse {
  world_id: string;
  filename: string;
  title: string;
  content: string;
  size_bytes: number;
  est_tokens: number;
}

export interface WorldPassportDraft {
  title: string;
  genre: string;
  description: string;
  icon: string;
  accent_color: string;
  starting_locations: string[];
}

export interface WorldWizardStepRequest {
  mode: 'dialog' | 'one_shot' | string;
  message: string;
  history?: CharacterDialogHistoryItem[];
  current_passport?: WorldPassportDraft | null;
}

export interface WorldPassportDraftResponse {
  reply: string;
  passport_draft: WorldPassportDraft;
}

export interface WorldPromptsGenRequest {
  passport: WorldPassportDraft;
  tone_chips?: string[];
  custom_instruction?: string;
  current_prompts?: WorldAiPrompts | null;
}

export interface WorldLoreDraftItem {
  filename: string;
  title: string;
  content: string;
}

export interface WorldLoreGenRequest {
  mode: 'plan_topics' | 'generate_article' | 'expand_article' | string;
  passport: WorldPassportDraft;
  ai_prompts?: WorldAiPrompts | null;
  topic?: string;
  filename?: string;
  existing_content?: string;
  instruction?: string;
  existing_titles?: string[];
}

export interface WorldLoreTopicItem {
  filename: string;
  title: string;
  brief: string;
}

export interface WorldLoreGenResponse {
  topics?: WorldLoreTopicItem[];
  article?: WorldLoreDraftItem | null;
}

export interface WorldTemplateGenRequest {
  passport: WorldPassportDraft;
  ai_prompts?: WorldAiPrompts | null;
  lore_digest?: string;
  custom_instruction?: string;
  current_template?: Record<string, any> | null;
}

export interface CharacterTemplateDraftResponse {
  character_template: Record<string, any>;
  demo_state: Record<string, any>;
  summary_note?: string;
}

export interface WorldFinalizeRequest {
  world_id?: string;
  passport: WorldPassportDraft;
  ai_prompts: WorldAiPrompts;
  character_template: Record<string, any>;
  lore_articles: WorldLoreDraftItem[];
}
