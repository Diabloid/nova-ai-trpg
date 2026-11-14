import React, { useEffect, useState } from 'react';
import { Scissors, Copy, ClipboardPaste } from 'lucide-react';
import { ContextMenu, type ContextMenuItem } from './ContextMenu';
import {
  getEditableSelection,
  copyEditableSelection,
  cutEditableSelection,
  pasteIntoEditable,
  type EditableTextElement,
} from '../../utils/textareaClipboard';

const TEXT_INPUT_TYPES = new Set([
  '',
  'text',
  'search',
  'url',
  'tel',
  'email',
  'password',
]);

function isTextEditableElement(target: EventTarget | null): target is EditableTextElement {
  if (!(target instanceof HTMLElement)) return false;
  if (target instanceof HTMLTextAreaElement) return true;
  if (target instanceof HTMLInputElement) {
    return TEXT_INPUT_TYPES.has((target.type || 'text').toLowerCase());
  }
  return false;
}

interface MenuState {
  x: number;
  y: number;
  items: ContextMenuItem[];
}

/**
 * Глобальне контекстне меню ПКМ за замовчуванням для ВСІХ інпутів, textarea,
 * чатів ([data-context-copy]) та виділеного тексту.
 * Компоненти зі спеціалізованим меню (напр. ChatInput зі зняттям форматування)
 * перехоплюють подію через e.preventDefault().
 */
export const GlobalContextMenu: React.FC = () => {
  const [menu, setMenu] = useState<MenuState | null>(null);

  useEffect(() => {
    const handleContextMenu = (e: MouseEvent) => {
      if (e.defaultPrevented) return;

      const target = e.target as HTMLElement | null;
      if (!target) return;

      // 1. Будь-який <input> або <textarea> (редагування: Вирізати / Копіювати / Вставити)
      if (isTextEditableElement(target)) {
        e.preventDefault();

        const selection = getEditableSelection(target);
        const value = target.value;
        const isPassword = target instanceof HTMLInputElement && target.type === 'password';
        const isReadOnly = target.readOnly || target.disabled;
        const hasSelection = !isPassword && selection.end > selection.start;

        setMenu({
          x: e.clientX,
          y: e.clientY,
          items: [
            {
              label: 'Вирізати',
              shortcut: 'Ctrl+X',
              icon: <Scissors size={13} />,
              disabled: !hasSelection || isReadOnly,
              onClick: () => {
                cutEditableSelection(target, value, selection).catch(() => {});
              },
            },
            {
              label: 'Копіювати',
              shortcut: 'Ctrl+C',
              icon: <Copy size={13} />,
              disabled: !hasSelection,
              onClick: () => {
                copyEditableSelection(value, selection).catch(() => {});
              },
            },
            {
              label: 'Вставити',
              shortcut: 'Ctrl+V',
              icon: <ClipboardPaste size={13} />,
              disabled: isReadOnly,
              onClick: () => {
                pasteIntoEditable(target, value, selection).catch(() => {});
              },
            },
          ],
        });
        return;
      }

      // 2. Повідомлення чату ([data-context-copy]) або виділений текст у будь-якому блоці
      const copyHost = target.closest<HTMLElement>('[data-context-copy]');
      const selectedText = window.getSelection()?.toString() ?? '';
      const fallbackText = copyHost?.dataset.contextCopy ?? '';
      const textToCopy = selectedText.length > 0 ? selectedText : fallbackText;

      if (textToCopy.length > 0) {
        e.preventDefault();
        setMenu({
          x: e.clientX,
          y: e.clientY,
          items: [
            {
              label: 'Копіювати',
              shortcut: 'Ctrl+C',
              icon: <Copy size={13} />,
              onClick: () => {
                navigator.clipboard.writeText(textToCopy).catch(() => {});
              },
            },
          ],
        });
      }
    };

    window.addEventListener('contextmenu', handleContextMenu);
    return () => {
      window.removeEventListener('contextmenu', handleContextMenu);
    };
  }, []);

  return (
    <ContextMenu
      isOpen={!!menu}
      x={menu?.x ?? 0}
      y={menu?.y ?? 0}
      items={menu?.items ?? []}
      onClose={() => setMenu(null)}
    />
  );
};
