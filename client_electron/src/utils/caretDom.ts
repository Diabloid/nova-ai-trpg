import {
  NOVA_SYNTAX_CLASSES,
  stripZeroWidth,
  tokenizeNovaSyntax,
  type SyntaxSelectionRange,
} from './novaSyntax';

/**
 * Обчислює загальну текстову довжину DOM-вузла для точного мапінгу позиції каретки
 * (звичайні <br> рахуються як '\n', службовий sentinel <br> ігнорується).
 */
export function getNodeTextLength(node: Node): number {
  if (node.nodeType === Node.TEXT_NODE) {
    return (node.textContent ?? '').length;
  }
  if (node instanceof HTMLBRElement) {
    return node.dataset.novaSentinel === 'true' ? 0 : 1;
  }
  let total = 0;
  for (let i = 0; i < node.childNodes.length; i++) {
    total += getNodeTextLength(node.childNodes[i]);
  }
  return total;
}

/** Витягує чистий багаторядковий текст із contenteditable без жодних \u200B */
export function extractPlainTextFromEditor(root: HTMLElement): string {
  let hasRealText = false;
  let brCount = 0;

  const walk = (node: Node): string => {
    if (node.nodeType === Node.TEXT_NODE) {
      const value = node.textContent ?? '';
      if (stripZeroWidth(value).length > 0) {
        hasRealText = true;
      }
      return value;
    }
    if (node instanceof HTMLBRElement) {
      brCount += 1;
      return node.dataset.novaSentinel === 'true' ? '' : '\n';
    }
    let inner = '';
    for (let i = 0; i < node.childNodes.length; i++) {
      inner += walk(node.childNodes[i]);
    }
    if (
      node !== root &&
      (node.nodeName === 'DIV' || node.nodeName === 'P') &&
      !inner.endsWith('\n')
    ) {
      return `${inner}\n`;
    }
    return inner;
  };

  const extracted = stripZeroWidth(walk(root).replace(/\r\n?/g, '\n'));
  // Коли користувач стирає весь текст, Chromium вставляє в порожній contenteditable службовий <br>
  if (!hasRealText && brCount <= 1) {
    return '';
  }
  return extracted;
}

/** Переводить точку DOM-Selection у лінійний символьний індекс */
function resolvePointOffset(root: HTMLElement, targetNode: Node, targetOffset: number): number {
  let offset = 0;
  let found = false;

  const walk = (node: Node): void => {
    if (found) return;

    if (node === targetNode) {
      if (node.nodeType === Node.TEXT_NODE) {
        offset += Math.min(targetOffset, (node.textContent ?? '').length);
      } else {
        const limit = Math.min(targetOffset, node.childNodes.length);
        for (let i = 0; i < limit; i++) {
          offset += getNodeTextLength(node.childNodes[i]);
        }
      }
      found = true;
      return;
    }

    if (node.nodeType === Node.TEXT_NODE) {
      offset += (node.textContent ?? '').length;
      return;
    }

    if (node instanceof HTMLBRElement) {
      if (node.dataset.novaSentinel !== 'true') {
        offset += 1;
      }
      return;
    }

    for (let i = 0; i < node.childNodes.length; i++) {
      walk(node.childNodes[i]);
      if (found) return;
    }
  };

  walk(root);
  return offset;
}

export function getEditorSelectionOffsets(root: HTMLElement): SyntaxSelectionRange {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) {
    return { start: 0, end: 0 };
  }
  const range = sel.getRangeAt(0);
  if (!root.contains(range.startContainer) || !root.contains(range.endContainer)) {
    return { start: 0, end: 0 };
  }

  const a = resolvePointOffset(root, range.startContainer, range.startOffset);
  const b = resolvePointOffset(root, range.endContainer, range.endOffset);
  return a <= b ? { start: a, end: b } : { start: b, end: a };
}

function findDomPositionForOffset(
  root: HTMLElement,
  targetOffset: number
): { node: Node; offset: number } {
  let remaining = Math.max(0, targetOffset);
  let lastTextNode: Text | null = null;

  const walk = (node: Node): { node: Node; offset: number } | null => {
    if (node.nodeType === Node.TEXT_NODE) {
      const textNode = node as Text;
      const len = textNode.data.length;
      lastTextNode = textNode;
      if (remaining <= len) {
        return { node: textNode, offset: remaining };
      }
      remaining -= len;
      return null;
    }

    if (node instanceof HTMLBRElement) {
      if (node.dataset.novaSentinel !== 'true') {
        if (remaining === 0) {
          const parent = node.parentNode ?? root;
          const idx = Array.prototype.indexOf.call(parent.childNodes, node);
          return { node: parent, offset: Math.max(0, idx) };
        }
        remaining = Math.max(0, remaining - 1);
      }
      return null;
    }

    for (let i = 0; i < node.childNodes.length; i++) {
      const res = walk(node.childNodes[i]);
      if (res) return res;
    }
    return null;
  };

  const match = walk(root);
  if (match) return match;

  if (lastTextNode) {
    const textRef: Text = lastTextNode;
    return { node: textRef, offset: textRef.data.length };
  }
  return { node: root, offset: 0 };
}

export function setEditorSelectionOffsets(root: HTMLElement, start: number, end: number): void {
  const sel = window.getSelection();
  if (!sel) return;

  const startPos = findDomPositionForOffset(root, start);
  const endPos = start === end ? startPos : findDomPositionForOffset(root, end);

  const range = document.createRange();
  range.setStart(startPos.node, startPos.offset);
  range.setEnd(endPos.node, endPos.offset);
  sel.removeAllRanges();
  sel.addRange(range);
}

/** Імперативно рендерить токени єдиного парсера всередині contenteditable без конфліктів VDOM */
export function renderTokensIntoEditor(
  root: HTMLElement,
  text: string,
  suppressedSpans: readonly SyntaxSelectionRange[]
): void {
  const fragment = document.createDocumentFragment();
  const tokens = tokenizeNovaSyntax(text, suppressedSpans);

  for (const token of tokens) {
    if (token.type === 'normal') {
      if (token.isSuppressed) {
        const plainSpan = document.createElement('span');
        plainSpan.dataset.novaPlain = 'true';
        plainSpan.textContent = token.text;
        fragment.appendChild(plainSpan);
      } else {
        fragment.appendChild(document.createTextNode(token.text));
      }
    } else {
      const span = document.createElement('span');
      span.className = NOVA_SYNTAX_CLASSES[token.type];
      span.textContent = token.text;
      fragment.appendChild(span);
    }
  }

  // Sentinel <br> потрібен Chromium для коректного відображення порожнього рядка після trailing '\n'
  if (text.endsWith('\n')) {
    const sentinel = document.createElement('br');
    sentinel.dataset.novaSentinel = 'true';
    fragment.appendChild(sentinel);
  }

  root.replaceChildren(fragment);
}
