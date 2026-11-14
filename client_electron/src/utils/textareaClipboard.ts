import { stripZeroWidth } from './novaSyntax';

/**
 * Спільні утиліти буфера обміну для всіх input / textarea та текстових редакторів.
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
  const sanitized = stripZeroWidth(nextValue);
  const clampedCaret = Math.max(0, Math.min(sanitized.length, nextCaret));

  if (onReactChange) {
    onReactChange(sanitized);
  } else {
    const proto =
      el instanceof HTMLTextAreaElement
        ? HTMLTextAreaElement.prototype
        : HTMLInputElement.prototype;
    const nativeSetter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
    if (nativeSetter) {
      nativeSetter.call(el, sanitized);
    } else {
      el.value = sanitized;
    }
    el.dispatchEvent(new Event('input', { bubbles: true }));
  }

  requestAnimationFrame(() => {
    el.focus();
    try {
      el.setSelectionRange(clampedCaret, clampedCaret);
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
  const selected = stripZeroWidth(value.slice(selection.start, selection.end));
  if (!selected) return false;
  await navigator.clipboard.writeText(selected);
  return true;
}

export async function cutEditableSelection(
  el: EditableTextElement | null,
  value: string,
  selection: TextSelectionSnapshot,
  onReactChange?: (next: string) => void
): Promise<boolean> {
  if (!el || selection.end <= selection.start) return false;
  const selected = stripZeroWidth(value.slice(selection.start, selection.end));
  await navigator.clipboard.writeText(selected);

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
  const clipText = stripZeroWidth(await navigator.clipboard.readText());
  if (!clipText) return false;

  const nextValue =
    value.slice(0, selection.start) + clipText + value.slice(selection.end);
  const nextCaret = selection.start + clipText.length;
  setEditableElementValue(el, nextValue, nextCaret, onReactChange);
  return true;
}
