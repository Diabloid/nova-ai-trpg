/**
 * Спільні утиліти буфера обміну для всіх input/textarea та перемикання форматування (\u200B).
 */

export type EditableTextElement = HTMLInputElement | HTMLTextAreaElement;

export interface TextSelectionSnapshot {
  start: number;
  end: number;
}

export function getEditableSelection(
  el: EditableTextElement | null
): TextSelectionSnapshot {
  if (!el) return { start: 0, end: 0 };
  try {
    return {
      start: el.selectionStart ?? 0,
      end: el.selectionEnd ?? 0,
    };
  } catch {
    return { start: 0, end: 0 };
  }
}

export function setEditableElementValue(
  el: EditableTextElement,
  nextValue: string,
  nextCaret: number,
  onReactChange?: (next: string) => void
): void {
  if (onReactChange) {
    onReactChange(nextValue);
  } else {
    const proto =
      el instanceof HTMLTextAreaElement
        ? HTMLTextAreaElement.prototype
        : HTMLInputElement.prototype;
    const nativeSetter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
    if (nativeSetter) {
      nativeSetter.call(el, nextValue);
    } else {
      el.value = nextValue;
    }
    el.dispatchEvent(new Event('input', { bubbles: true }));
  }

  requestAnimationFrame(() => {
    el.focus();
    try {
      el.setSelectionRange(nextCaret, nextCaret);
    } catch {
      // Деякі типи input не підтримують setSelectionRange
    }
  });
}

export async function copyEditableSelection(
  value: string,
  selection: TextSelectionSnapshot
): Promise<boolean> {
  if (selection.end <= selection.start) return false;
  await navigator.clipboard.writeText(value.slice(selection.start, selection.end));
  return true;
}

export async function cutEditableSelection(
  el: EditableTextElement | null,
  value: string,
  selection: TextSelectionSnapshot,
  onReactChange?: (next: string) => void
): Promise<boolean> {
  if (!el || selection.end <= selection.start) return false;
  await navigator.clipboard.writeText(value.slice(selection.start, selection.end));

  const nextValue = value.slice(0, selection.start) + value.slice(selection.end);
  setEditableElementValue(el, nextValue, selection.start, onReactChange);
  return true;
}

export async function pasteIntoEditable(
  el: EditableTextElement | null,
  value: string,
  selection: TextSelectionSnapshot,
  onReactChange?: (next: string) => void
): Promise<boolean> {
  if (!el) return false;
  const clipText = await navigator.clipboard.readText();
  if (!clipText) return false;

  const nextValue =
    value.slice(0, selection.start) + clipText + value.slice(selection.end);
  const nextCaret = selection.start + clipText.length;
  setEditableElementValue(el, nextValue, nextCaret, onReactChange);
  return true;
}

// Зворотна сумісність імен для ChatInput
export const getTextareaSelection = getEditableSelection;
export const copyTextareaSelection = copyEditableSelection;
export const cutTextareaSelection = cutEditableSelection;
export const pasteIntoTextarea = pasteIntoEditable;

interface TextMatch {
  index: number;
  length: number;
  value: string;
}

function unformatSingleMatch(inner: string): string {
  if (inner.includes('\\')) {
    return inner.replace(/\\/g, '');
  }

  // Думка: "текст" <-> "\u200Bтекст"
  if (inner.startsWith('"') && inner.endsWith('"') && inner.length >= 2) {
    if (inner.length > 2 && inner[1] === '\u200B') {
      return '"' + inner.slice(2);
    }
    return '"\u200B' + inner.slice(1);
  }

  // Дія: **текст** <-> *\u200B*текст*\u200B*
  if (
    inner.startsWith('*\u200B*') &&
    inner.endsWith('*\u200B*') &&
    inner.length >= 6
  ) {
    return '**' + inner.slice(3, -3) + '**';
  }
  if (inner.startsWith('**') && inner.endsWith('**') && inner.length >= 4) {
    if (inner.length > 4 && inner[2] === '\u200B') {
      return '**' + inner.slice(3);
    }
    return '*\u200B*' + inner.slice(2, -2) + '*\u200B*';
  }

  // Позаігровий коментар: (OOC) <-> (\u200BOOC)
  if (inner.startsWith('(') && inner.endsWith(')') && inner.length >= 2) {
    if (inner.length > 2 && inner[1] === '\u200B') {
      return '(' + inner.slice(2);
    }
    return '(\u200B' + inner.slice(1);
  }

  // Репліка на початку рядка: - текст <-> -\u200B текст
  if (inner.startsWith('-') || inner.startsWith('–') || inner.startsWith('—')) {
    if (inner.length > 1 && inner[1] === '\u200B') {
      return inner.slice(0, 1) + inner.slice(2);
    }
    return inner.slice(0, 1) + '\u200B' + inner.slice(1);
  }

  return inner;
}

/**
 * Перемикає форматування синтаксичних блоків через Zero-Width Space (\u200B),
 * (пріоритет: виділення -> блок під курсором -> усі блоки).
 */
export function toggleSyntaxFormatting(
  text: string,
  selection: TextSelectionSnapshot
): string {
  if (!text) return text;

  const allMatches: TextMatch[] = [];
  const collect = (regex: RegExp) => {
    let m: RegExpExecArray | null;
    while ((m = regex.exec(text)) !== null) {
      allMatches.push({
        index: m.index,
        length: m[0].length,
        value: m[0],
      });
    }
  };

  collect(/(?<!\\)".*?(?<!\\)"/g);
  collect(/(?<!\\)\(.*?(?<!\\)\)/g);
  collect(/(?<!\\)\*(?:\u200B)?\*.*?(?<!\\)\*(?:\u200B)?\*/g);

  // Репліка на початку рядка (із опційним відступом)
  const speechRegex = /^[ \t]*([-\u2013\u2014][^\n]*)/gm;
  let speechMatch: RegExpExecArray | null;
  while ((speechMatch = speechRegex.exec(text)) !== null) {
    const fullPrefixLen = speechMatch[0].length - speechMatch[1].length;
    allMatches.push({
      index: speechMatch.index + fullPrefixLen,
      length: speechMatch[1].length,
      value: speechMatch[1],
    });
  }

  if (allMatches.length === 0) return text;

  const applyReplacements = (targets: TextMatch[]): string => {
    let result = text;
    const ordered = [...targets].sort((a, b) => b.index - a.index);
    for (const m of ordered) {
      const replacement = unformatSingleMatch(m.value);
      result =
        result.slice(0, m.index) +
        replacement +
        result.slice(m.index + m.length);
    }
    return result;
  };

  // 1. Якщо є виділення — обробляємо всі блоки всередині виділення
  if (selection.end > selection.start) {
    const selMatches = allMatches.filter(
      (m) => m.index >= selection.start && m.index + m.length <= selection.end
    );
    if (selMatches.length > 0) {
      return applyReplacements(selMatches);
    }
  }

  // 2. Якщо курсор всередині блоку — беремо найвужчий блок (наприклад, "думку" всередині **дії**)
  const enclosing = allMatches
    .filter((m) => selection.start >= m.index && selection.start <= m.index + m.length)
    .sort((a, b) => a.length - b.length);

  if (enclosing.length > 0) {
    return applyReplacements([enclosing[0]]);
  }

  // 3. Інакше перемикаємо форматування всіх блоків у полі
  return applyReplacements(allMatches);
}
