import type { IntentItem } from '../types/api';

export type NovaTokenType = 'normal' | 'action' | 'thought' | 'speech' | 'ooc';

export interface NovaToken {
  type: NovaTokenType;
  text: string;
  start: number;
  end: number;
}

export interface NovaSpan {
  kind: Exclude<NovaTokenType, 'normal'>;
  /** Повний початок конструкції включно з відкриваючим маркером */
  start: number;
  /** Повний кінець конструкції включно із закриваючим маркером */
  end: number;
  /** Індекс одразу після відкриваючого маркера (для speech включає 1 пробіл після тире, якщо є) */
  openEnd: number;
  /** Індекс початку закриваючого маркера (для speech дорівнює end) */
  closeStart: number;
}

export interface SyntaxSelectionRange {
  start: number;
  end: number;
}

export interface RemoveFormattingResult {
  text: string;
  selectionStart: number;
  selectionEnd: number;
  changed: boolean;
}

/**
 * Єдині CSS-класи підсвітки синтаксису (1-в-1 з SyntaxHelpTooltip).
 * Використовують справжні font-bold та italic — у contenteditable курсор
 * позиціонується безпосередньо по відрендерених гліфах без розсинхрону.
 */
export const NOVA_SYNTAX_CLASSES: Record<NovaTokenType, string> = {
  normal: '',
  action: 'font-bold text-[#EAB308]',
  thought: 'italic text-[#60A5FA]',
  speech: 'text-[#4ADE80] font-medium',
  ooc: 'text-[#9CA3AF]',
};

const ZERO_WIDTH_SPACE_REGEX = /\u200B/g;

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

/** Видаляє будь-які Zero-Width Space (\u200B) */
export function stripZeroWidth(text: string): string {
  return text ? text.replace(ZERO_WIDTH_SPACE_REGEX, '') : '';
}

/** Знімає екранні зворотно-слешові префікси (\X -> X) без артефактів */
export function unescapeNovaText(text: string): string {
  const clean = stripZeroWidth(text);
  if (!clean.includes('\\')) return clean;

  let result = '';
  for (let i = 0; i < clean.length; i++) {
    if (clean[i] === '\\' && i + 1 < clean.length) {
      result += clean[i + 1];
      i++;
    } else {
      result += clean[i];
    }
  }
  return result;
}

/** Перераховує індекс при вирізанні \u200B зі строки */
function mapIndexWithoutZeroWidth(raw: string, rawIdx: number): number {
  let cleanIdx = 0;
  const limit = Math.min(Math.max(rawIdx, 0), raw.length);
  for (let i = 0; i < limit; i++) {
    if (raw[i] !== '\u200B') {
      cleanIdx++;
    }
  }
  return cleanIdx;
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

interface ParsedSyntaxData {
  cleanText: string;
  tokens: NovaToken[];
  spans: NovaSpan[];
  intents: IntentItem[];
  /** Позиції відкриваючих і закриваючих `**` валідних action-спанів (для cleanDisplayAction) */
  actionDelimiterRanges: Array<{ start: number; end: number }>;
}

function pushToken(tokens: NovaToken[], type: NovaTokenType, text: string, start: number, end: number): void {
  if (end <= start) return;
  const slice = text.slice(start, end);
  const last = tokens[tokens.length - 1];
  if (last && last.type === type && last.end === start) {
    last.text += slice;
    last.end = end;
    return;
  }
  tokens.push({ type, text: slice, start, end });
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
 * Сканує вкладений вміст усередині валідного `action` або `thought` спану:
 * виділяє вкладені закриті `"думки"` або `**дії**` без дублювання в інтентах
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

  // Відкриваючий маркер належить зовнішньому спану
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
      if (closeStart !== -1) {
        if (cursor > segmentStart) {
          pushToken(out.tokens, fallbackType, text, segmentStart, cursor);
          if (emitFallbackIntent && fallbackType !== 'normal') {
            pushIntent(out.intents, fallbackType, text.slice(segmentStart, cursor));
          }
        }

        const nestedEnd = closeStart + 2;
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
      if (closeStart !== -1) {
        if (cursor > segmentStart) {
          pushToken(out.tokens, fallbackType, text, segmentStart, cursor);
          if (emitFallbackIntent && fallbackType !== 'normal') {
            pushIntent(out.intents, fallbackType, text.slice(segmentStart, cursor));
          }
        }

        const nestedEnd = closeStart + 1;
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

  // Закриваючий маркер належить зовнішньому спану
  if (rangeEnd > trailingDelimiterStart) {
    pushToken(out.tokens, fallbackType, text, trailingDelimiterStart, rangeEnd);
  }
}

/**
 * Єдина функція лексико-синтаксичного розбору тексту гравця (Single Source of Truth).
 * Усі конструкції (`**дія**`, `"думка"`, `(OOC)`, `- репліка`) суворо обмежені
 * межами одного рядка та не протікають крізь переноси рядків.
 */
function parseNovaSyntax(rawText: string): ParsedSyntaxData {
  const cleanText = stripZeroWidth(rawText);
  const out: ParsedSyntaxData = {
    cleanText,
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

      // Екранування спецсимволу зворотним слешем
      if (ch === '\\' && i + 1 < lineEnd) {
        i += 2;
        continue;
      }

      // 1. Пряма мова (- / – / —): тільки на початку рядка або як окремий маркер після пробілу
      if (isSpeechDash(ch)) {
        const atLineStart = isOnlyHorizontalWhitespace(cleanText, lineStart, i);
        const standaloneAfterSpace =
          i > lineStart &&
          isHorizontalSpace(cleanText[i - 1]) &&
          (i + 1 === lineEnd || isHorizontalSpace(cleanText[i + 1]));

        if (atLineStart || standaloneAfterSpace) {
          if (i > normalStart) {
            pushToken(out.tokens, 'normal', cleanText, normalStart, i);
          }

          const openEnd = i + 1 < lineEnd && isHorizontalSpace(cleanText[i + 1]) ? i + 2 : i + 1;
          out.spans.push({
            kind: 'speech',
            start: i,
            end: lineEnd,
            openEnd,
            closeStart: lineEnd,
          });

          // Усередині репліки не витягуємо вкладені action / thought / ooc
          pushToken(out.tokens, 'speech', cleanText, i, lineEnd);
          pushIntent(out.intents, 'speech', cleanText.slice(openEnd, lineEnd));

          i = lineEnd;
          normalStart = lineEnd;
          break;
        }
      }

      // 2. Позаігрове звернення (OOC) — тільки за наявності закриваючої ')' у цьому ж рядку
      if (ch === '(') {
        const closeStart = findClosingOoc(cleanText, i + 1, lineEnd);
        if (closeStart !== -1) {
          if (i > normalStart) {
            pushToken(out.tokens, 'normal', cleanText, normalStart, i);
          }

          const spanEnd = closeStart + 1;
          out.spans.push({
            kind: 'ooc',
            start: i,
            end: spanEnd,
            openEnd: i + 1,
            closeStart,
          });

          // Усередині OOC не витягуємо вкладені action / thought
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
        if (closeStart !== -1) {
          if (i > normalStart) {
            pushToken(out.tokens, 'normal', cleanText, normalStart, i);
          }

          const spanEnd = closeStart + 2;
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
        if (closeStart !== -1) {
          if (i > normalStart) {
            pushToken(out.tokens, 'normal', cleanText, normalStart, i);
          }

          const spanEnd = closeStart + 1;
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
      pushToken(out.tokens, 'normal', cleanText, normalStart, lineEnd);
    }

    if (newlineIdx === -1) {
      break;
    }

    // Сам символ переносу рядка теж зберігається як normal токен з точними індексами
    pushToken(out.tokens, 'normal', cleanText, lineEnd, lineEnd + 1);
    lineStart = lineEnd + 1;
  }

  return out;
}

/**
 * Розбиває текст гравця на візуальні токени підсвітки синтаксису.
 */
export function tokenizeNovaSyntax(text: string): NovaToken[] {
  return parseNovaSyntax(text).tokens;
}

/**
 * Парсить текст гравця у впорядкований масив інтентів для бекенда (API v1.5.2).
 * Порядок інтентів суворо відповідає появі в тексті, вкладені дублі виключені,
 * а звичайний текст без валідних маркерів стає Default Action.
 */
export function parseIntents(rawAction: string): IntentItem[] {
  const parsed = parseNovaSyntax(rawAction);
  if (parsed.intents.length > 0) {
    return parsed.intents;
  }

  const fallback = cleanDisplayAction(parsed.cleanText);
  if (fallback.length > 0) {
    return [{ type: 'action', content: fallback }];
  }

  return [];
}

/**
 * Очищує текст гравця для відображення в баблі чату:
 * прибирає лише неекрановані маркери дії `**`, коректно розекрановує `\**` / `\"` / `\-` / `\\`
 * без залишкових `\`, та гарантує відсутність `\u200B`.
 */
export function cleanDisplayAction(rawAction: string): string {
  const parsed = parseNovaSyntax(rawAction);
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
 * Повністю видаляє синтаксичні маркери (`**...**`, `"..."`, `(...)`, `- `)
 * без вставки `\u200B`, коректно оновлюючи позицію курсора / виділення.
 * Пріоритет:
 * 1. Конструкції в межах виділеного фрагмента
 * 2. Найвужча конструкція під курсором
 * 3. Усі конструкції в тексті (якщо курсор поза форматуванням)
 */
export function removeSyntaxFormatting(
  rawText: string,
  rawSelection?: SyntaxSelectionRange
): RemoveFormattingResult {
  const cleanText = stripZeroWidth(rawText);
  const selStart = rawSelection ? mapIndexWithoutZeroWidth(rawText, rawSelection.start) : 0;
  const selEnd = rawSelection ? mapIndexWithoutZeroWidth(rawText, rawSelection.end) : 0;

  const parsed = parseNovaSyntax(cleanText);
  const spans = parsed.spans;

  if (spans.length === 0) {
    return {
      text: cleanText,
      selectionStart: selStart,
      selectionEnd: selEnd,
      changed: cleanText !== rawText,
    };
  }

  const hasSelection = selEnd > selStart;
  let targetSpans: NovaSpan[] = [];

  if (hasSelection) {
    targetSpans = spans.filter((span) => span.end > selStart && span.start < selEnd);
  } else if (rawSelection) {
    const enclosing = spans.filter((span) => span.start <= selStart && selStart <= span.end);
    if (enclosing.length > 0) {
      // Найвужча (включно з вкладеною) конструкція під курсором
      enclosing.sort((a, b) => (a.end - a.start) - (b.end - b.start));
      targetSpans = [enclosing[0]];
    }
  }

  if (targetSpans.length === 0) {
    targetSpans = spans;
  }

  // Збираємо всі діапазони маркерів до видалення (відкриваючі та закриваючі)
  const removals: Array<{ start: number; end: number }> = [];
  for (const span of targetSpans) {
    if (span.openEnd > span.start) {
      removals.push({ start: span.start, end: span.openEnd });
    }
    if (span.end > span.closeStart) {
      removals.push({ start: span.closeStart, end: span.end });
    }
  }

  // Нормалізуємо та зливаємо діапазони на випадок вкладеності або перетинів
  removals.sort((a, b) => a.start - b.start);
  const merged: Array<{ start: number; end: number }> = [];
  for (const r of removals) {
    const prev = merged[merged.length - 1];
    if (prev && r.start <= prev.end) {
      prev.end = Math.max(prev.end, r.end);
    } else {
      merged.push({ ...r });
    }
  }

  let nextText = '';
  let cursor = 0;
  for (const r of merged) {
    if (r.start > cursor) {
      nextText += cleanText.slice(cursor, r.start);
    }
    cursor = r.end;
  }
  if (cursor < cleanText.length) {
    nextText += cleanText.slice(cursor);
  }

  const remapOffset = (pos: number): number => {
    let shift = 0;
    for (const r of merged) {
      if (pos >= r.end) {
        shift += r.end - r.start;
      } else if (pos > r.start) {
        shift += pos - r.start;
      }
    }
    return Math.max(0, Math.min(nextText.length, pos - shift));
  };

  return {
    text: nextText,
    selectionStart: remapOffset(selStart),
    selectionEnd: remapOffset(selEnd),
    changed: nextText !== rawText,
  };
}
