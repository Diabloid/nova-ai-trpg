import { createElement, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import {
  Bold,
  Braces,
  ClipboardPaste,
  Copy,
  Italic,
  MessageSquare,
  RemoveFormatting,
  Scissors,
  type LucideIcon,
} from 'lucide-react';
import {
  stripZeroWidth,
  type FormattableSyntaxKind,
  type SyntaxSelectionRange,
} from '../../utils/novaSyntax';
import type { ContextMenuItem } from '../ui/ContextMenu';

export interface EditorHistoryEntry {
  text: string;
  suppressedSpans: SyntaxSelectionRange[];
  selectionStart: number;
  selectionEnd: number;
}

export const MIN_EDITOR_HEIGHT = 24;
export const MAX_EDITOR_HEIGHT = 120;
export const MAX_HISTORY_SIZE = 100;
export const TYPING_BURST_MS = 800;

const SHORTCUT_FORMAT_MAP: Record<string, FormattableSyntaxKind> = {
  KeyB: 'action',
  KeyI: 'thought',
  KeyD: 'speech',
  Slash: 'ooc',
};

const FORMAT_MENU_ITEMS: Array<{
  kind: FormattableSyntaxKind;
  label: string;
  shortcut: string;
  icon: LucideIcon;
  iconClassName: string;
}> = [
  {
    kind: 'action',
    label: 'Дія (**...**)',
    shortcut: 'Ctrl+B',
    icon: Bold,
    iconClassName: 'text-[#EAB308]',
  },
  {
    kind: 'thought',
    label: 'Думка ("...")',
    shortcut: 'Ctrl+I',
    icon: Italic,
    iconClassName: 'text-[#60A5FA]',
  },
  {
    kind: 'speech',
    label: 'Пряма мова (- ...)',
    shortcut: 'Ctrl+D',
    icon: MessageSquare,
    iconClassName: 'text-[#4ADE80]',
  },
  {
    kind: 'ooc',
    label: 'Поза грою ((...))',
    shortcut: 'Ctrl+/',
    icon: Braces,
    iconClassName: 'text-text-muted',
  },
];

export type EditorShortcutCommand =
  | { type: 'undo' }
  | { type: 'redo' }
  | { type: 'format'; kind: FormattableSyntaxKind };

/**
 * Розпізнає фізичні шорткати редактора (`Ctrl/Cmd+Z/Y/B/I/D//`) незалежно від розкладки.
 * `Ctrl+Shift+I` (DevTools) не перехоплюється.
 */
export function resolveEditorShortcut(
  e: ReactKeyboardEvent<HTMLDivElement>
): EditorShortcutCommand | null {
  if (!(e.ctrlKey || e.metaKey) || e.altKey) return null;

  if (e.code === 'KeyZ' && !e.shiftKey) {
    return { type: 'undo' };
  }
  if ((e.code === 'KeyZ' && e.shiftKey) || (e.code === 'KeyY' && !e.shiftKey)) {
    return { type: 'redo' };
  }

  if (!e.shiftKey && e.code in SHORTCUT_FORMAT_MAP) {
    return { type: 'format', kind: SHORTCUT_FORMAT_MAP[e.code] };
  }

  return null;
}

interface BuildContextMenuParams {
  selection: SyntaxSelectionRange | null;
  userInput: string;
  isEditorLocked: boolean;
  canToggleFormatting: boolean;
  onFocusEditor: () => void;
  onSpliceSelection: (selection: SyntaxSelectionRange, insertedText: string) => void;
  onApplyFormatting: (kind: FormattableSyntaxKind, selection: SyntaxSelectionRange) => void;
  onToggleSuppressFormatting: (selection: SyntaxSelectionRange) => void;
}

export function buildChatContextMenuItems({
  selection,
  userInput,
  isEditorLocked,
  canToggleFormatting,
  onFocusEditor,
  onSpliceSelection,
  onApplyFormatting,
  onToggleSuppressFormatting,
}: BuildContextMenuParams): ContextMenuItem[] {
  const hasSelection = Boolean(selection && selection.end > selection.start);
  const selectedText = selection
    ? stripZeroWidth(userInput.slice(selection.start, selection.end))
    : '';

  return [
    {
      label: 'Вирізати',
      shortcut: 'Ctrl+X',
      icon: createElement(Scissors, { size: 13 }),
      disabled: !hasSelection || isEditorLocked,
      onClick: () => {
        if (!selection || !selectedText) return;
        navigator.clipboard
          .writeText(selectedText)
          .then(() => {
            onFocusEditor();
            onSpliceSelection(selection, '');
          })
          .catch(() => {});
      },
    },
    {
      label: 'Копіювати',
      shortcut: 'Ctrl+C',
      icon: createElement(Copy, { size: 13 }),
      disabled: !hasSelection,
      onClick: () => {
        if (!selectedText) return;
        navigator.clipboard.writeText(selectedText).catch(() => {});
      },
    },
    {
      label: 'Вставити',
      shortcut: 'Ctrl+V',
      icon: createElement(ClipboardPaste, { size: 13 }),
      disabled: isEditorLocked,
      onClick: () => {
        if (!selection) return;
        navigator.clipboard
          .readText()
          .then((clipText) => {
            if (!clipText) return;
            onFocusEditor();
            onSpliceSelection(selection, clipText);
          })
          .catch(() => {});
      },
    },
    { type: 'separator' },
    ...FORMAT_MENU_ITEMS.map((item) => ({
      label: item.label,
      shortcut: item.shortcut,
      icon: createElement(item.icon, { size: 13, className: item.iconClassName }),
      disabled: isEditorLocked,
      onClick: () => {
        if (!selection) return;
        onApplyFormatting(item.kind, selection);
      },
    })),
    { type: 'separator' },
    {
      label: 'Скасувати форматування',
      icon: createElement(RemoveFormatting, { size: 13 }),
      disabled: !canToggleFormatting || isEditorLocked,
      onClick: () => {
        if (!selection) return;
        onToggleSuppressFormatting(selection);
      },
    },
  ];
}
