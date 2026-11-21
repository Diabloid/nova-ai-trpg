import type { SyntaxSelectionRange } from './types';
import { normalizeSuppressedSpans, stripZeroWidth } from './suppressedSpans';
import {
  handleActionToken,
  handleNormalRange,
  handleOocToken,
  handleSpeechToken,
  handleThoughtToken,
  pushToken,
  type ParsedSyntaxData,
} from './handlers';

export type { ParsedSyntaxData };
export {
  tokenizeNovaSyntax,
  parseIntents,
  cleanDisplayAction,
  buildDisplayTokens,
} from './parserHelpers';

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
      if (cleanText[i] === '\\' && i + 1 < lineEnd) {
        i += 2;
        continue;
      }

      const match =
        handleSpeechToken(cleanText, i, lineStart, lineEnd, normalStart, out) ??
        handleOocToken(cleanText, i, lineEnd, normalStart, out) ??
        handleActionToken(cleanText, i, lineEnd, normalStart, out) ??
        handleThoughtToken(cleanText, i, lineEnd, normalStart, out);

      if (match) {
        i = match.nextIndex;
        normalStart = match.nextNormalStart;
        continue;
      }

      i++;
    }

    if (lineEnd > normalStart) {
      handleNormalRange(out.tokens, cleanText, normalStart, lineEnd, normalizedSuppressed);
    }

    if (newlineIdx === -1) {
      break;
    }

    pushToken(out.tokens, 'normal', cleanText, lineEnd, lineEnd + 1, false);
    lineStart = lineEnd + 1;
  }

  return out;
}
