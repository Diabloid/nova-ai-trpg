import type { SyntaxSelectionRange } from './types';
import { parseNovaSyntax } from './parser';

const ZERO_WIDTH_SPACE_REGEX = /\u200B/g;

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

/** Нормалізує список приглушених діапазонів без злиття дотичних блоків */
export function normalizeSuppressedSpans(
  spans: readonly SyntaxSelectionRange[] | undefined,
  textLength: number
): SyntaxSelectionRange[] {
  if (!spans || spans.length === 0 || textLength <= 0) return [];

  const clamped = spans
    .map((s) => ({
      start: Math.max(0, Math.min(textLength, s.start)),
      end: Math.max(0, Math.min(textLength, s.end)),
    }))
    .filter((s) => s.end > s.start)
    .sort((a, b) => (a.start !== b.start ? a.start - b.start : b.end - a.end));

  const deduped: SyntaxSelectionRange[] = [];
  for (const s of clamped) {
    const prev = deduped[deduped.length - 1];
    if (prev && prev.start === s.start && prev.end === s.end) {
      continue;
    }
    deduped.push(s);
  }
  return deduped;
}

export function isSpanSuppressed(
  start: number,
  end: number,
  suppressedSpans: readonly SyntaxSelectionRange[]
): boolean {
  return suppressedSpans.some((s) => s.start <= start && end <= s.end);
}

export function isPositionSuppressed(
  pos: number,
  suppressedSpans: readonly SyntaxSelectionRange[]
): boolean {
  return suppressedSpans.some((s) => s.start <= pos && pos < s.end);
}

/**
 * Синхронізує приглушені діапазони після введення, видалення або вставки тексту
 * через обчислення спільного префікса та суфікса між prevText і nextText.
 */
export function remapSuppressedSpans(
  prevText: string,
  nextText: string,
  suppressedSpans: readonly SyntaxSelectionRange[]
): SyntaxSelectionRange[] {
  if (suppressedSpans.length === 0 || !nextText) return [];
  if (prevText === nextText) {
    return normalizeSuppressedSpans(suppressedSpans, nextText.length);
  }

  let prefixLen = 0;
  const minLen = Math.min(prevText.length, nextText.length);
  while (prefixLen < minLen && prevText[prefixLen] === nextText[prefixLen]) {
    prefixLen++;
  }

  let suffixLen = 0;
  const maxSuffix = minLen - prefixLen;
  while (
    suffixLen < maxSuffix &&
    prevText[prevText.length - 1 - suffixLen] === nextText[nextText.length - 1 - suffixLen]
  ) {
    suffixLen++;
  }

  const editStart = prefixLen;
  const prevEditEnd = prevText.length - suffixLen;
  const nextEditEnd = nextText.length - suffixLen;
  const delta = nextText.length - prevText.length;

  const remapped: SyntaxSelectionRange[] = [];
  for (const s of suppressedSpans) {
    if (s.end <= editStart) {
      remapped.push({ start: s.start, end: s.end });
    } else if (s.start >= prevEditEnd) {
      remapped.push({ start: s.start + delta, end: s.end + delta });
    } else {
      const nextStart = s.start <= editStart ? s.start : editStart;
      const nextEnd = s.end >= prevEditEnd ? s.end + delta : nextEditEnd;
      if (nextEnd > nextStart) {
        remapped.push({ start: nextStart, end: nextEnd });
      }
    }
  }

  return normalizeSuppressedSpans(remapped, nextText.length);
}

/**
 * Перемикає приглушення синтаксису (`suppressedSpans`) без видалення маркерів (`"`, `()`, `**`, `-`)
 * і без вставки `\u200B`:
 * - якщо ціль зараз активна -> приглушує (текст лишається білим із лапками/маркерами)
 * - якщо ціль вже приглушена -> повертає підсвітку назад (toggle).
 */
export function toggleSuppressFormatting(
  rawText: string,
  suppressedSpans: readonly SyntaxSelectionRange[],
  selection?: SyntaxSelectionRange
): SyntaxSelectionRange[] {
  const cleanText = stripZeroWidth(rawText);
  if (!cleanText) return [];

  const normalized = normalizeSuppressedSpans(suppressedSpans, cleanText.length);
  const parsed = parseNovaSyntax(cleanText, normalized);
  const activeSpans = parsed.spans;

  const selStart = selection ? Math.max(0, Math.min(cleanText.length, selection.start)) : 0;
  const selEnd = selection ? Math.max(0, Math.min(cleanText.length, selection.end)) : 0;
  const hasSelection = selEnd > selStart;

  if (hasSelection) {
    const overlappingActive = activeSpans.filter(
      (s) => s.end > selStart && s.start < selEnd
    );
    if (overlappingActive.length > 0) {
      const toSuppress = overlappingActive.map((s) => ({ start: s.start, end: s.end }));
      return normalizeSuppressedSpans([...normalized, ...toSuppress], cleanText.length);
    }

    const overlappingSuppressed = normalized.filter(
      (s) => s.end > selStart && s.start < selEnd
    );
    if (overlappingSuppressed.length > 0) {
      return normalized.filter((s) => !(s.end > selStart && s.start < selEnd));
    }
    return normalized;
  }

  if (selection) {
    // Пріоритет під курсором: обираємо найвужчий блок (активний -> приглушити, приглушений -> відновити)
    const enclosingActive = activeSpans
      .filter((s) => s.start <= selStart && selStart <= s.end)
      .sort((a, b) => (a.end - a.start) - (b.end - b.start))[0];

    const enclosingSuppressed = normalized
      .filter((s) => s.start <= selStart && selStart <= s.end)
      .sort((a, b) => (a.end - a.start) - (b.end - b.start))[0];

    if (
      enclosingSuppressed &&
      (!enclosingActive ||
        enclosingSuppressed.end - enclosingSuppressed.start <=
          enclosingActive.end - enclosingActive.start)
    ) {
      return normalized.filter((s) => s !== enclosingSuppressed);
    }

    if (enclosingActive) {
      return normalizeSuppressedSpans(
        [...normalized, { start: enclosingActive.start, end: enclosingActive.end }],
        cleanText.length
      );
    }
  }

  // Поза спанами: якщо ще є активні — приглушуємо всі; інакше вмикаємо назад (toggle)
  if (activeSpans.length > 0) {
    const allNew = activeSpans.map((s) => ({ start: s.start, end: s.end }));
    return normalizeSuppressedSpans([...normalized, ...allNew], cleanText.length);
  }

  return [];
}
