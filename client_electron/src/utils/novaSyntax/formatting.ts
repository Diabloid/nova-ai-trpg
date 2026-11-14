import type { NovaTokenType, SyntaxSelectionRange } from './types';
import {
  normalizeSuppressedSpans,
  remapSuppressedSpans,
  stripZeroWidth,
} from './suppressedSpans';

export type FormattableSyntaxKind = Exclude<NovaTokenType, 'normal'>;

export interface FormatOperationResult {
  text: string;
  suppressedSpans: SyntaxSelectionRange[];
  selectionStart: number;
  selectionEnd: number;
}

const ENCLOSED_DELIMITERS: Record<
  Exclude<FormattableSyntaxKind, 'speech'>,
  { open: string; close: string }
> = {
  action: { open: '**', close: '**' },
  thought: { open: '"', close: '"' },
  ooc: { open: '(', close: ')' },
};

/**
 * Застосовує синтаксичне форматування (`**дія**`, `"думка"`, `(OOC)` або `- пряма мова`)
 * до виділення чи позиції каретки, очищає перетин із `suppressedSpans` і ремапить решту спанів.
 */
export function applyNovaFormatting(
  rawText: string,
  suppressedSpans: readonly SyntaxSelectionRange[],
  selection: SyntaxSelectionRange,
  kind: FormattableSyntaxKind
): FormatOperationResult {
  const cleanText = stripZeroWidth(rawText);
  const start = Math.max(0, Math.min(cleanText.length, Math.min(selection.start, selection.end)));
  const end = Math.max(0, Math.min(cleanText.length, Math.max(selection.start, selection.end)));

  const normalized = normalizeSuppressedSpans(suppressedSpans, cleanText.length);
  const withoutOverlap = normalized.filter((s) =>
    end > start ? !(s.end > start && s.start < end) : !(s.start <= start && start < s.end)
  );

  if (kind === 'speech') {
    const lineStart = cleanText.lastIndexOf('\n', start - 1) + 1;
    const beforeOnLine = cleanText.slice(lineStart, start);
    const isAtVisualLineStart = /^[ \t]*$/.test(beforeOnLine);
    const prefix = isAtVisualLineStart ? '- ' : '\n- ';

    const nextText = `${cleanText.slice(0, start)}${prefix}${cleanText.slice(start)}`;
    const nextSuppressed = remapSuppressedSpans(cleanText, nextText, withoutOverlap);
    const nextCaret = end > start ? end + prefix.length : start + prefix.length;

    return {
      text: nextText,
      suppressedSpans: nextSuppressed,
      selectionStart: nextCaret,
      selectionEnd: nextCaret,
    };
  }

  const { open, close } = ENCLOSED_DELIMITERS[kind];
  const selectedText = cleanText.slice(start, end);
  const nextText = `${cleanText.slice(0, start)}${open}${selectedText}${close}${cleanText.slice(end)}`;
  const nextSuppressed = remapSuppressedSpans(cleanText, nextText, withoutOverlap);

  if (end === start) {
    const caretInside = start + open.length;
    return {
      text: nextText,
      suppressedSpans: nextSuppressed,
      selectionStart: caretInside,
      selectionEnd: caretInside,
    };
  }

  const caretAfterClose = end + open.length + close.length;
  return {
    text: nextText,
    suppressedSpans: nextSuppressed,
    selectionStart: caretAfterClose,
    selectionEnd: caretAfterClose,
  };
}
