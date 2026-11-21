import type { IntentItem } from '../../types/api';
import { parseNovaSyntax } from './parser';
import { unescapeNovaText } from './suppressedSpans';
import type { NovaToken, SyntaxSelectionRange } from './types';

/**
 * Розбиває текст гравця на візуальні токени підсвітки синтаксису з урахуванням приглушених діапазонів.
 */
export function tokenizeNovaSyntax(
  text: string,
  suppressedSpans: readonly SyntaxSelectionRange[] = []
): NovaToken[] {
  return parseNovaSyntax(text, suppressedSpans).tokens;
}

/**
 * Очищує текст гравця для відображення в баблі чату:
 * прибирає `**` лише у активних (не приглушених) action-спанів, коректно
 * розекрановує `\**` / `\"` / `\-` / `\\` та гарантує відсутність `\u200B`.
 */
export function cleanDisplayAction(
  rawAction: string,
  suppressedSpans: readonly SyntaxSelectionRange[] = []
): string {
  const parsed = parseNovaSyntax(rawAction, suppressedSpans);
  const { cleanText, actionDelimiterRanges } = parsed;
  if (!cleanText) return '';

  if (actionDelimiterRanges.length === 0) {
    return unescapeNovaText(cleanText).trim();
  }

  const sorted = [...actionDelimiterRanges].sort((a, b) => a.start - b.start);
  let stripped = '';
  let cursor = 0;

  for (const delim of sorted) {
    if (delim.start > cursor) {
      stripped += cleanText.slice(cursor, delim.start);
    }
    cursor = Math.max(cursor, delim.end);
  }
  if (cursor < cleanText.length) {
    stripped += cleanText.slice(cursor);
  }

  return unescapeNovaText(stripped).trim();
}

/**
 * Парсить текст гравця у впорядкований масив інтентів для бекенда.
 * Приглушені через `suppressedSpans` конструкції не потрапляють у власний спеціалізований тип інтента.
 */
export function parseIntents(
  rawAction: string,
  suppressedSpans: readonly SyntaxSelectionRange[] = []
): IntentItem[] {
  const parsed = parseNovaSyntax(rawAction, suppressedSpans);
  if (parsed.intents.length > 0) {
    return parsed.intents;
  }

  const fallback = cleanDisplayAction(parsed.cleanText, parsed.suppressedSpans);
  if (fallback.length > 0) {
    return [{ type: 'action', content: fallback }];
  }

  return [];
}

/**
 * Будує візуальні токени репліки гравця для відображення в чаті:
 * вирізає зовнішні `**` у активних `action`-спанів, розекрановує `\\**`/`\"`/`\-`/`\\`
 * і обрізає крайні пробіли так, щоб об'єднання токенів збігалося з `cleanDisplayAction`.
 */
export function buildDisplayTokens(
  rawAction: string,
  suppressedSpans: readonly SyntaxSelectionRange[] = []
): NovaToken[] {
  const parsed = parseNovaSyntax(rawAction, suppressedSpans);
  if (!parsed.cleanText) return [];

  const sortedDelims = [...parsed.actionDelimiterRanges].sort((a, b) => a.start - b.start);
  const result: NovaToken[] = [];

  for (const token of parsed.tokens) {
    let cursor = token.start;
    for (const delim of sortedDelims) {
      if (delim.end <= cursor) continue;
      if (delim.start >= token.end) break;

      if (delim.start > cursor) {
        const piece = unescapeNovaText(parsed.cleanText.slice(cursor, delim.start));
        if (piece.length > 0) {
          result.push({ ...token, text: piece, start: cursor, end: delim.start });
        }
      }
      cursor = Math.max(cursor, delim.end);
    }

    if (cursor < token.end) {
      const piece = unescapeNovaText(parsed.cleanText.slice(cursor, token.end));
      if (piece.length > 0) {
        result.push({ ...token, text: piece, start: cursor, end: token.end });
      }
    }
  }

  // Синхронне .trim() по краях послідовності токенів (як у cleanDisplayAction)
  while (result.length > 0) {
    const trimmed = result[0].text.trimStart();
    if (trimmed.length === 0) {
      result.shift();
    } else {
      result[0] = { ...result[0], text: trimmed };
      break;
    }
  }

  while (result.length > 0) {
    const lastIdx = result.length - 1;
    const trimmed = result[lastIdx].text.trimEnd();
    if (trimmed.length === 0) {
      result.pop();
    } else {
      result[lastIdx] = { ...result[lastIdx], text: trimmed };
      break;
    }
  }

  return result;
}
