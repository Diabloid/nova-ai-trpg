import type { IntentItem } from '../../types/api';
import type {
  NovaSpan,
  NovaToken,
  NovaTokenType,
  SyntaxSelectionRange,
} from './types';
import {
  isPositionSuppressed,
  isSpanSuppressed,
  normalizeSuppressedSpans,
  stripZeroWidth,
  unescapeNovaText,
} from './suppressedSpans';

function isHorizontalSpace(ch: string | undefined): boolean {
  return ch === ' ' || ch === '\t';
}

function isSpeechDash(ch: string | undefined): boolean {
  return ch === '-' || ch === '\u2013' || ch === '\u2014';
}

function isOnlyHorizontalWhitespace(text: string, from: number, to: number): boolean {
  for (let idx = from; idx < to; idx++) {
    if (!isHorizontalSpace(text[idx])) {
      return false;
    }
  }
  return true;
}

function isEscapedAt(text: string, index: number): boolean {
  let backslashes = 0;
  let pos = index - 1;
  while (pos >= 0 && text[pos] === '\\') {
    backslashes++;
    pos--;
  }
  return backslashes % 2 === 1;
}

/** Шукає парне неекрановане закриття `**` в межах [from, limit) */
function findClosingAction(text: string, from: number, limit: number): number {
  for (let i = from; i + 1 < limit; i++) {
    if (text[i] === '\\') {
      i++;
      continue;
    }
    if (text[i] === '*' && text[i + 1] === '*') {
      return i;
    }
  }
  return -1;
}

/** Шукає парну неекрановану `"` в межах [from, limit) */
function findClosingThought(text: string, from: number, limit: number): number {
  for (let i = from; i < limit; i++) {
    if (text[i] === '\\') {
      i++;
      continue;
    }
    if (text[i] === '"') {
      return i;
    }
  }
  return -1;
}

/** Шукає парну неекрановану `)` із балансом вкладених дужок в межах [from, limit) */
function findClosingOoc(text: string, from: number, limit: number): number {
  let depth = 1;
  for (let i = from; i < limit; i++) {
    if (text[i] === '\\') {
      i++;
      continue;
    }
    if (text[i] === '(') {
      depth++;
    } else if (text[i] === ')') {
      depth--;
      if (depth === 0) {
        return i;
      }
    }
  }
  return -1;
}

/**
 * Шукає першу валідну закриту (і не приглушену) конструкцію форматування
 * (`**...**`, `"..."`, `(...)`) усередині рядка після початку прямої мови.
 */
function findNextFormattingInSpeech(
  text: string,
  from: number,
  lineEnd: number,
  suppressedSpans: readonly SyntaxSelectionRange[]
): number {
  for (let j = from; j < lineEnd; j++) {
    const ch = text[j];
    if (ch === '\\' && j + 1 < lineEnd) {
      j++;
      continue;
    }

    if (ch === '*' && j + 1 < lineEnd && text[j + 1] === '*') {
      const close = findClosingAction(text, j + 2, lineEnd);
      if (close !== -1 && !isSpanSuppressed(j, close + 2, suppressedSpans)) {
        return j;
      }
    }

    if (ch === '"') {
      const close = findClosingThought(text, j + 1, lineEnd);
      if (close !== -1 && !isSpanSuppressed(j, close + 1, suppressedSpans)) {
        return j;
      }
    }

    if (ch === '(') {
      const close = findClosingOoc(text, j + 1, lineEnd);
      if (close !== -1 && !isSpanSuppressed(j, close + 1, suppressedSpans)) {
        return j;
      }
    }
  }
  return -1;
}

export interface ParsedSyntaxData {
  cleanText: string;
  suppressedSpans: SyntaxSelectionRange[];
  tokens: NovaToken[];
  spans: NovaSpan[];
  intents: IntentItem[];
  /** Позиції відкриваючих і закриваючих `**` валідних action-спанів (для cleanDisplayAction) */
  actionDelimiterRanges: Array<{ start: number; end: number }>;
}

function pushToken(
  tokens: NovaToken[],
  type: NovaTokenType,
  text: string,
  start: number,
  end: number,
  isSuppressed = false
): void {
  if (end <= start) return;
  const slice = text.slice(start, end);
  const last = tokens[tokens.length - 1];
  if (
    last &&
    last.type === type &&
    Boolean(last.isSuppressed) === isSuppressed &&
    last.end === start
  ) {
    last.text += slice;
    last.end = end;
    return;
  }
  tokens.push(
    isSuppressed
      ? { type, text: slice, start, end, isSuppressed: true }
      : { type, text: slice, start, end }
  );
}

/** Додає normal-діапазон, розбиваючи приглушені частини для <span data-nova-plain="true"> */
function pushNormalRange(
  tokens: NovaToken[],
  text: string,
  from: number,
  to: number,
  suppressedSpans: readonly SyntaxSelectionRange[]
): void {
  if (to <= from) return;
  if (suppressedSpans.length === 0) {
    pushToken(tokens, 'normal', text, from, to, false);
    return;
  }

  let cursor = from;
  for (const sup of suppressedSpans) {
    if (sup.end <= cursor) continue;
    if (sup.start >= to) break;

    if (sup.start > cursor) {
      pushToken(tokens, 'normal', text, cursor, sup.start, false);
    }
    const segStart = Math.max(cursor, sup.start);
    const segEnd = Math.min(to, sup.end);
    if (segEnd > segStart) {
      pushToken(tokens, 'normal', text, segStart, segEnd, true);
      cursor = segEnd;
    }
  }

  if (cursor < to) {
    pushToken(tokens, 'normal', text, cursor, to, false);
  }
}

function pushIntent(intents: IntentItem[], type: Exclude<NovaTokenType, 'normal'>, rawSlice: string): void {
  const content = unescapeNovaText(rawSlice).trim();
  if (content.length > 0) {
    intents.push({ type, content });
  }
}

interface ScanInlineOptions {
  allowNestedAction: boolean;
  allowNestedThought: boolean;
  fallbackType: NovaTokenType;
  emitFallbackIntent: boolean;
}

/**
 * Сканує вміст усередині валідного `action` або `thought` спану:
 * виділяє вкладені не-приглушені `"думки"` або `**дії**` без дублювання в інтентах
 * і зі збереженням точного порядку появи в тексті.
 */
function scanEnclosedRange(
  text: string,
  rangeStart: number,
  rangeEnd: number,
  leadingDelimiterEnd: number,
  trailingDelimiterStart: number,
  options: ScanInlineOptions,
  out: ParsedSyntaxData
): void {
  const { allowNestedAction, allowNestedThought, fallbackType, emitFallbackIntent } = options;

  if (leadingDelimiterEnd > rangeStart) {
    pushToken(out.tokens, fallbackType, text, rangeStart, leadingDelimiterEnd);
  }

  let cursor = leadingDelimiterEnd;
  let segmentStart = leadingDelimiterEnd;

  while (cursor < trailingDelimiterStart) {
    const ch = text[cursor];
    if (ch === '\\' && cursor + 1 < trailingDelimiterStart) {
      cursor += 2;
      continue;
    }

    if (
      allowNestedAction &&
      ch === '*' &&
      cursor + 1 < trailingDelimiterStart &&
      text[cursor + 1] === '*'
    ) {
      const closeStart = findClosingAction(text, cursor + 2, trailingDelimiterStart);
      const nestedEnd = closeStart + 2;
      if (closeStart !== -1 && !isSpanSuppressed(cursor, nestedEnd, out.suppressedSpans)) {
        if (cursor > segmentStart) {
          pushToken(out.tokens, fallbackType, text, segmentStart, cursor);
          if (emitFallbackIntent && fallbackType !== 'normal') {
            pushIntent(out.intents, fallbackType, text.slice(segmentStart, cursor));
          }
        }

        out.spans.push({
          kind: 'action',
          start: cursor,
          end: nestedEnd,
          openEnd: cursor + 2,
          closeStart,
        });
        out.actionDelimiterRanges.push(
          { start: cursor, end: cursor + 2 },
          { start: closeStart, end: nestedEnd }
        );

        pushToken(out.tokens, 'action', text, cursor, nestedEnd);
        pushIntent(out.intents, 'action', text.slice(cursor + 2, closeStart));

        cursor = nestedEnd;
        segmentStart = nestedEnd;
        continue;
      }
    }

    if (allowNestedThought && ch === '"') {
      const closeStart = findClosingThought(text, cursor + 1, trailingDelimiterStart);
      const nestedEnd = closeStart + 1;
      if (closeStart !== -1 && !isSpanSuppressed(cursor, nestedEnd, out.suppressedSpans)) {
        if (cursor > segmentStart) {
          pushToken(out.tokens, fallbackType, text, segmentStart, cursor);
          if (emitFallbackIntent && fallbackType !== 'normal') {
            pushIntent(out.intents, fallbackType, text.slice(segmentStart, cursor));
          }
        }

        out.spans.push({
          kind: 'thought',
          start: cursor,
          end: nestedEnd,
          openEnd: cursor + 1,
          closeStart,
        });

        pushToken(out.tokens, 'thought', text, cursor, nestedEnd);
        pushIntent(out.intents, 'thought', text.slice(cursor + 1, closeStart));

        cursor = nestedEnd;
        segmentStart = nestedEnd;
        continue;
      }
    }

    cursor++;
  }

  if (trailingDelimiterStart > segmentStart) {
    pushToken(out.tokens, fallbackType, text, segmentStart, trailingDelimiterStart);
    if (emitFallbackIntent && fallbackType !== 'normal') {
      pushIntent(out.intents, fallbackType, text.slice(segmentStart, trailingDelimiterStart));
    }
  }

  if (rangeEnd > trailingDelimiterStart) {
    pushToken(out.tokens, fallbackType, text, trailingDelimiterStart, rangeEnd);
  }
}

/**
 * Єдина функція лексико-синтаксичного розбору тексту гравця (Single Source of Truth).
 * Усі конструкції суворо обмежені межами одного рядка, враховують `suppressedSpans`
 * та завершують пряму мову перед наступним валідним форматуванням.
 */
export function parseNovaSyntax(
  rawText: string,
  suppressedSpans: readonly SyntaxSelectionRange[] = []
): ParsedSyntaxData {
  const cleanText = stripZeroWidth(rawText);
  const normalizedSuppressed = normalizeSuppressedSpans(suppressedSpans, cleanText.length);

  const out: ParsedSyntaxData = {
    cleanText,
    suppressedSpans: normalizedSuppressed,
    tokens: [],
    spans: [],
    intents: [],
    actionDelimiterRanges: [],
  };

  if (!cleanText) {
    return out;
  }

  let lineStart = 0;
  const len = cleanText.length;

  while (lineStart < len) {
    const newlineIdx = cleanText.indexOf('\n', lineStart);
    const lineEnd = newlineIdx === -1 ? len : newlineIdx;

    let i = lineStart;
    let normalStart = lineStart;

    while (i < lineEnd) {
      const ch = cleanText[i];

      if (ch === '\\' && i + 1 < lineEnd) {
        i += 2;
        continue;
      }

      // 1. Пряма мова (- / – / —): тільки на початку рядка або як окремий маркер після пробілу
      if (isSpeechDash(ch) && !isPositionSuppressed(i, normalizedSuppressed)) {
        const atLineStart = isOnlyHorizontalWhitespace(cleanText, lineStart, i);
        const standaloneAfterSpace =
          i > lineStart &&
          isHorizontalSpace(cleanText[i - 1]) &&
          (i + 1 === lineEnd || isHorizontalSpace(cleanText[i + 1]));

        if (atLineStart || standaloneAfterSpace) {
          const openEnd = i + 1 < lineEnd && isHorizontalSpace(cleanText[i + 1]) ? i + 2 : i + 1;
          const nextFormatIdx = findNextFormattingInSpeech(
            cleanText,
            openEnd,
            lineEnd,
            normalizedSuppressed
          );

          // Визначаємо, чи завершується репліка перед наступним валідним форматуванням
          let speechEnd = lineEnd;
          let resumePos = lineEnd;

          if (nextFormatIdx !== -1) {
            // Перевіряємо наявність діалогового роздільника ` - ` / ` – ` / ` — ` перед форматуванням
            let k = nextFormatIdx - 1;
            while (k >= openEnd && isHorizontalSpace(cleanText[k])) {
              k--;
            }

            const hasTrailingSpaceAfterDash = k < nextFormatIdx - 1;
            const hasDialogDash =
              hasTrailingSpaceAfterDash &&
              k >= openEnd &&
              isSpeechDash(cleanText[k]) &&
              !isEscapedAt(cleanText, k) &&
              k - 1 >= openEnd &&
              isHorizontalSpace(cleanText[k - 1]);

            if (hasDialogDash) {
              let dividerStart = k - 1;
              while (dividerStart > openEnd && isHorizontalSpace(cleanText[dividerStart - 1])) {
                dividerStart--;
              }
              speechEnd = dividerStart;
            } else {
              // Без роздільника обрізаємо прилеглі пробіли перед форматуванням
              speechEnd = Math.max(openEnd, k + 1);
            }
            resumePos = nextFormatIdx;
          }

          const rawSpeechBody = cleanText.slice(openEnd, speechEnd);
          const hasSpeechContent = unescapeNovaText(rawSpeechBody).trim().length > 0;

          if (hasSpeechContent) {
            if (i > normalStart) {
              pushNormalRange(out.tokens, cleanText, normalStart, i, normalizedSuppressed);
            }

            out.spans.push({
              kind: 'speech',
              start: i,
              end: speechEnd,
              openEnd,
              closeStart: speechEnd,
            });
            pushToken(out.tokens, 'speech', cleanText, i, speechEnd);
            pushIntent(out.intents, 'speech', rawSpeechBody);

            if (resumePos > speechEnd) {
              pushNormalRange(out.tokens, cleanText, speechEnd, resumePos, normalizedSuppressed);
            }

            i = resumePos;
            normalStart = resumePos;
            if (i >= lineEnd) break;
            continue;
          }

          // Якщо після '- ' одразу йде форматування (порожня репліка), пропускаємо до нього
          if (nextFormatIdx !== -1) {
            i = nextFormatIdx;
            continue;
          }
        }
      }

      // 2. Позаігрове звернення (OOC) — тільки за наявності закриваючої ')' у цьому ж рядку
      if (ch === '(') {
        const closeStart = findClosingOoc(cleanText, i + 1, lineEnd);
        const spanEnd = closeStart + 1;
        if (closeStart !== -1 && !isSpanSuppressed(i, spanEnd, normalizedSuppressed)) {
          if (i > normalStart) {
            pushNormalRange(out.tokens, cleanText, normalStart, i, normalizedSuppressed);
          }

          out.spans.push({
            kind: 'ooc',
            start: i,
            end: spanEnd,
            openEnd: i + 1,
            closeStart,
          });

          pushToken(out.tokens, 'ooc', cleanText, i, spanEnd);
          pushIntent(out.intents, 'ooc', cleanText.slice(i + 1, closeStart));

          i = spanEnd;
          normalStart = spanEnd;
          continue;
        }
      }

      // 3. Фізична дія (**...**) — тільки за наявності закриваючого '**' у цьому ж рядку
      if (ch === '*' && i + 1 < lineEnd && cleanText[i + 1] === '*') {
        const closeStart = findClosingAction(cleanText, i + 2, lineEnd);
        const spanEnd = closeStart + 2;
        if (closeStart !== -1 && !isSpanSuppressed(i, spanEnd, normalizedSuppressed)) {
          if (i > normalStart) {
            pushNormalRange(out.tokens, cleanText, normalStart, i, normalizedSuppressed);
          }

          out.spans.push({
            kind: 'action',
            start: i,
            end: spanEnd,
            openEnd: i + 2,
            closeStart,
          });
          out.actionDelimiterRanges.push(
            { start: i, end: i + 2 },
            { start: closeStart, end: spanEnd }
          );

          scanEnclosedRange(
            cleanText,
            i,
            spanEnd,
            i + 2,
            closeStart,
            {
              allowNestedAction: false,
              allowNestedThought: true,
              fallbackType: 'action',
              emitFallbackIntent: true,
            },
            out
          );

          i = spanEnd;
          normalStart = spanEnd;
          continue;
        }
      }

      // 4. Думка ("...") — тільки за наявності закриваючої '"' у цьому ж рядку
      if (ch === '"') {
        const closeStart = findClosingThought(cleanText, i + 1, lineEnd);
        const spanEnd = closeStart + 1;
        if (closeStart !== -1 && !isSpanSuppressed(i, spanEnd, normalizedSuppressed)) {
          if (i > normalStart) {
            pushNormalRange(out.tokens, cleanText, normalStart, i, normalizedSuppressed);
          }

          out.spans.push({
            kind: 'thought',
            start: i,
            end: spanEnd,
            openEnd: i + 1,
            closeStart,
          });

          scanEnclosedRange(
            cleanText,
            i,
            spanEnd,
            i + 1,
            closeStart,
            {
              allowNestedAction: true,
              allowNestedThought: false,
              fallbackType: 'thought',
              emitFallbackIntent: true,
            },
            out
          );

          i = spanEnd;
          normalStart = spanEnd;
          continue;
        }
      }

      i++;
    }

    if (lineEnd > normalStart) {
      pushNormalRange(out.tokens, cleanText, normalStart, lineEnd, normalizedSuppressed);
    }

    if (newlineIdx === -1) {
      break;
    }

    pushToken(out.tokens, 'normal', cleanText, lineEnd, lineEnd + 1, false);
    lineStart = lineEnd + 1;
  }

  return out;
}

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
 * Парсить текст гравця у впорядкований масив інтентів для бекенда (API v1.5.2).
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
