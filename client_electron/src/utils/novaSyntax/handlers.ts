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
  stripZeroWidth,
  unescapeNovaText,
} from './suppressedSpans';

export interface ParsedSyntaxData {
  cleanText: string;
  suppressedSpans: SyntaxSelectionRange[];
  tokens: NovaToken[];
  spans: NovaSpan[];
  intents: IntentItem[];
  /** Позиції відкриваючих і закриваючих `**` валідних action-спанів (для cleanDisplayAction) */
  actionDelimiterRanges: Array<{ start: number; end: number }>;
}

export interface HandlerMatch {
  nextIndex: number;
  nextNormalStart: number;
}

export { stripZeroWidth };

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

/**
 * Шукає парний неекранований закриваючий маркер `delimiter` в межах `[from, limit)`.
 * Якщо передано `openNestedChar`, підтримує баланс вкладених дужок (напр. `(...)`).
 */
export function findClosingDelimiter(
  text: string,
  from: number,
  limit: number,
  delimiter: string,
  openNestedChar?: string
): number {
  let depth = 1;
  const endBound = openNestedChar ? limit : limit - delimiter.length + 1;

  for (let i = from; i < endBound; i++) {
    if (text[i] === '\\') {
      i++;
      continue;
    }
    if (openNestedChar && text[i] === openNestedChar) {
      depth++;
      continue;
    }
    if (text.startsWith(delimiter, i)) {
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
      const close = findClosingDelimiter(text, j + 2, lineEnd, '**');
      if (close !== -1 && !isSpanSuppressed(j, close + 2, suppressedSpans)) {
        return j;
      }
    }

    if (ch === '"') {
      const close = findClosingDelimiter(text, j + 1, lineEnd, '"');
      if (close !== -1 && !isSpanSuppressed(j, close + 1, suppressedSpans)) {
        return j;
      }
    }

    if (ch === '(') {
      const close = findClosingDelimiter(text, j + 1, lineEnd, ')', '(');
      if (close !== -1 && !isSpanSuppressed(j, close + 1, suppressedSpans)) {
        return j;
      }
    }
  }

  return -1;
}

export function pushToken(
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
export function handleNormalRange(
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

function pushIntent(
  intents: IntentItem[],
  type: Exclude<NovaTokenType, 'normal'>,
  rawSlice: string
): void {
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
      const closeStart = findClosingDelimiter(text, cursor + 2, trailingDelimiterStart, '**');
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
      const closeStart = findClosingDelimiter(text, cursor + 1, trailingDelimiterStart, '"');
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

/** Обробник прямої мови (`-` / `–` / `—`) на початку рядка або після горизонтального пробілу */
export function handleSpeechToken(
  cleanText: string,
  index: number,
  lineStart: number,
  lineEnd: number,
  normalStart: number,
  out: ParsedSyntaxData
): HandlerMatch | null {
  if (!isSpeechDash(cleanText[index]) || isPositionSuppressed(index, out.suppressedSpans)) {
    return null;
  }

  const atLineStart = isOnlyHorizontalWhitespace(cleanText, lineStart, index);
  const standaloneAfterSpace =
    index > lineStart &&
    isHorizontalSpace(cleanText[index - 1]) &&
    (index + 1 === lineEnd || isHorizontalSpace(cleanText[index + 1]));

  if (!atLineStart && !standaloneAfterSpace) {
    return null;
  }

  const openEnd =
    index + 1 < lineEnd && isHorizontalSpace(cleanText[index + 1]) ? index + 2 : index + 1;
  const nextFormatIdx = findNextFormattingInSpeech(
    cleanText,
    openEnd,
    lineEnd,
    out.suppressedSpans
  );

  let speechEnd = lineEnd;
  let resumePos = lineEnd;

  if (nextFormatIdx !== -1) {
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
      speechEnd = Math.max(openEnd, k + 1);
    }
    resumePos = nextFormatIdx;
  }

  const rawSpeechBody = cleanText.slice(openEnd, speechEnd);
  const hasSpeechContent = unescapeNovaText(rawSpeechBody).trim().length > 0;

  if (hasSpeechContent) {
    if (index > normalStart) {
      handleNormalRange(out.tokens, cleanText, normalStart, index, out.suppressedSpans);
    }

    out.spans.push({
      kind: 'speech',
      start: index,
      end: speechEnd,
      openEnd,
      closeStart: speechEnd,
    });
    pushToken(out.tokens, 'speech', cleanText, index, speechEnd);
    pushIntent(out.intents, 'speech', rawSpeechBody);

    if (resumePos > speechEnd) {
      handleNormalRange(out.tokens, cleanText, speechEnd, resumePos, out.suppressedSpans);
    }

    return { nextIndex: resumePos, nextNormalStart: resumePos };
  }

  // Якщо після `- ` одразу йде форматування (порожня репліка), пропускаємо до нього, лишаючи префікс як normal
  if (nextFormatIdx !== -1) {
    return { nextIndex: nextFormatIdx, nextNormalStart: normalStart };
  }

  return null;
}

/** Обробник позаігрового звернення `(...)` із балансом вкладених дужок у межах рядка */
export function handleOocToken(
  cleanText: string,
  index: number,
  lineEnd: number,
  normalStart: number,
  out: ParsedSyntaxData
): HandlerMatch | null {
  if (cleanText[index] !== '(') return null;

  const closeStart = findClosingDelimiter(cleanText, index + 1, lineEnd, ')', '(');
  const spanEnd = closeStart + 1;
  if (closeStart === -1 || isSpanSuppressed(index, spanEnd, out.suppressedSpans)) {
    return null;
  }

  if (index > normalStart) {
    handleNormalRange(out.tokens, cleanText, normalStart, index, out.suppressedSpans);
  }

  out.spans.push({
    kind: 'ooc',
    start: index,
    end: spanEnd,
    openEnd: index + 1,
    closeStart,
  });
  pushToken(out.tokens, 'ooc', cleanText, index, spanEnd);
  pushIntent(out.intents, 'ooc', cleanText.slice(index + 1, closeStart));

  return { nextIndex: spanEnd, nextNormalStart: spanEnd };
}

function handleEnclosedConstruct(
  cleanText: string,
  index: number,
  lineEnd: number,
  normalStart: number,
  kind: 'action' | 'thought',
  delimiter: string,
  scanOptions: ScanInlineOptions,
  out: ParsedSyntaxData
): HandlerMatch | null {
  const delimLen = delimiter.length;
  const closeStart = findClosingDelimiter(cleanText, index + delimLen, lineEnd, delimiter);
  const spanEnd = closeStart + delimLen;
  if (closeStart === -1 || isSpanSuppressed(index, spanEnd, out.suppressedSpans)) {
    return null;
  }

  if (index > normalStart) {
    handleNormalRange(out.tokens, cleanText, normalStart, index, out.suppressedSpans);
  }

  out.spans.push({
    kind,
    start: index,
    end: spanEnd,
    openEnd: index + delimLen,
    closeStart,
  });

  if (kind === 'action') {
    out.actionDelimiterRanges.push(
      { start: index, end: index + delimLen },
      { start: closeStart, end: spanEnd }
    );
  }

  scanEnclosedRange(
    cleanText,
    index,
    spanEnd,
    index + delimLen,
    closeStart,
    scanOptions,
    out
  );

  return { nextIndex: spanEnd, nextNormalStart: spanEnd };
}

/** Обробник фізичної дії `**...**` у межах рядка */
export function handleActionToken(
  cleanText: string,
  index: number,
  lineEnd: number,
  normalStart: number,
  out: ParsedSyntaxData
): HandlerMatch | null {
  if (cleanText[index] !== '*' || index + 1 >= lineEnd || cleanText[index + 1] !== '*') {
    return null;
  }

  return handleEnclosedConstruct(
    cleanText,
    index,
    lineEnd,
    normalStart,
    'action',
    '**',
    {
      allowNestedAction: false,
      allowNestedThought: true,
      fallbackType: 'action',
      emitFallbackIntent: true,
    },
    out
  );
}

/** Обробник думки `"..."` у межах рядка */
export function handleThoughtToken(
  cleanText: string,
  index: number,
  lineEnd: number,
  normalStart: number,
  out: ParsedSyntaxData
): HandlerMatch | null {
  if (cleanText[index] !== '"') return null;

  return handleEnclosedConstruct(
    cleanText,
    index,
    lineEnd,
    normalStart,
    'thought',
    '"',
    {
      allowNestedAction: true,
      allowNestedThought: false,
      fallbackType: 'thought',
      emitFallbackIntent: true,
    },
    out
  );
}
