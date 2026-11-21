import type { WorldLoreDraftItem } from '../../types/api';
import type { ChatMessage } from '../../types/game';
import { formatSystemTime } from '../../utils/formatTime';
import { sanitizeLoreFilename } from '../../utils/loreFileUtils';
import { useGameStore } from '../useGameStore';
import type { PersistedWorldStudioDraft, WorldStudioStoreState } from './types';

const STUDIO_DRAFT_STORAGE_KEY = 'nova_world_studio_draft';

export function createInitialPassportMessage(): ChatMessage {
  return {
    id: `ws-init-${Date.now()}`,
    sender: 'Архітектор Світів:',
    senderColor: '#C084FC',
    text: 'Вітаю у майстерні всесвітів! Опишіть ідею вашого світу — жанр, епоху, магію або технології, ключовий конфлікт — або скористайтеся швидкою генерацією з одного опису.',
    timeText: formatSystemTime(),
    isPlayer: false,
  };
}

function saveCreateDraftToStorage(draft: PersistedWorldStudioDraft): void {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(STUDIO_DRAFT_STORAGE_KEY, JSON.stringify(draft));
    }
  } catch {
    // ignore quota errors
  }
}

export function loadCreateDraftFromStorage(): PersistedWorldStudioDraft | null {
  try {
    if (typeof localStorage !== 'undefined') {
      const raw = localStorage.getItem(STUDIO_DRAFT_STORAGE_KEY);
      if (!raw) return null;
      const parsed: unknown = JSON.parse(raw);
      if (parsed && typeof parsed === 'object' && 'passport' in parsed) {
        return parsed as PersistedWorldStudioDraft;
      }
    }
  } catch {
    // ignore corrupt draft
  }
  return null;
}

export function clearWorldStudioDraftStorage(): void {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem(STUDIO_DRAFT_STORAGE_KEY);
    }
  } catch {
    // ignore storage errors
  }
}

export function persistDraftIfCreate(state: WorldStudioStoreState): void {
  if (state.mode !== 'create' || !state.isOpen) return;
  saveCreateDraftToStorage({
    currentStep: state.currentStep,
    passport: state.passport,
    aiPrompts: state.aiPrompts,
    aiGeneratedPromptsSnapshot: state.aiGeneratedPromptsSnapshot,
    selectedToneChips: state.selectedToneChips,
    promptsCustomInstruction: state.promptsCustomInstruction,
    loreArticles: state.loreArticles,
    templateDraft: state.templateDraft,
    demoState: state.demoState,
  });
}

export function isWorldActionBlockedOffline(actionLabel: string): boolean {
  if (!useGameStore.getState().backendOffline) return false;
  useGameStore
    .getState()
    .setSystemAlert(`Сервер офлайн — ${actionLabel} тимчасово недоступна.`, 'warning');
  return true;
}

export function makeUniqueLoreFilename(
  rawName: string,
  existingArticles: WorldLoreDraftItem[],
  fallbackExt: '.md' | '.txt' = '.md'
): string {
  const sanitized = sanitizeLoreFilename(rawName, fallbackExt);
  const existingSet = new Set(existingArticles.map((a) => a.filename.toLowerCase()));
  if (!existingSet.has(sanitized.toLowerCase())) {
    return sanitized;
  }

  const extMatch = sanitized.match(/\.(md|txt)$/i);
  const ext = extMatch ? extMatch[0] : fallbackExt;
  const stem = extMatch ? sanitized.slice(0, -ext.length) : sanitized;
  let counter = 2;
  let candidate = `${stem}_${counter}${ext}`;
  while (existingSet.has(candidate.toLowerCase())) {
    counter += 1;
    candidate = `${stem}_${counter}${ext}`;
  }
  return candidate;
}

export function buildLoreDigest(articles: WorldLoreDraftItem[]): string | undefined {
  if (!articles || articles.length === 0) return undefined;
  const chunks: string[] = [];
  let totalLen = 0;

  for (const article of articles) {
    const snippet = (article.content || '').replace(/\s+/g, ' ').trim().slice(0, 320);
    const line = `- ${article.title}: ${snippet}`;
    if (totalLen + line.length > 2600) break;
    chunks.push(line);
    totalLen += line.length;
  }

  return chunks.length > 0 ? chunks.join('\n') : undefined;
}

export function syncLoreHeadingWithTitle(title: string, content: string): string {
  const cleanTitle = title.trim();
  if (!cleanTitle) return content;

  if (/^\s*#\s+.*(\r?\n|$)/.test(content)) {
    return content.replace(/^\s*#\s+.*(\r?\n|$)/, `# ${cleanTitle}$1`);
  }
  const trimmedBody = content.trimStart();
  return trimmedBody ? `# ${cleanTitle}\n\n${trimmedBody}` : `# ${cleanTitle}\n\n`;
}
