import React, { useRef, useState, useLayoutEffect, useEffect, useCallback } from 'react';
import { Scissors, Copy, ClipboardPaste, RemoveFormatting } from 'lucide-react';
import { useGameStore } from '../../store/useGameStore';
import { gameApi } from '../../api/gameApi';
import { SendOrMicButton } from './SendOrMicButton';
import { VoiceBanner } from './VoiceBanner';
import { SyntaxHelpTooltip } from './SyntaxHelpTooltip';
import { ContextMenu } from '../ui/ContextMenu';
import {
  NOVA_SYNTAX_CLASSES,
  remapSuppressedSpans,
  stripZeroWidth,
  toggleSuppressFormatting,
  tokenizeNovaSyntax,
  type SyntaxSelectionRange,
} from '../../utils/novaSyntax';

const MIN_EDITOR_HEIGHT = 24;
const MAX_EDITOR_HEIGHT = 120;

/**
 * Обчислює загальну текстову довжину DOM-вузла для точного мапінгу позиції каретки
 * (звичайні <br> рахуються як '\n', службовий sentinel <br> ігнорується).
 */
function getNodeTextLength(node: Node): number {
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
function extractPlainTextFromEditor(root: HTMLElement): string {
  const walk = (node: Node): string => {
    if (node.nodeType === Node.TEXT_NODE) {
      return node.textContent ?? '';
    }
    if (node instanceof HTMLBRElement) {
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

  return stripZeroWidth(walk(root).replace(/\r\n?/g, '\n'));
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

function getEditorSelectionOffsets(root: HTMLElement): SyntaxSelectionRange {
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

function setEditorSelectionOffsets(root: HTMLElement, start: number, end: number): void {
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
function renderTokensIntoEditor(
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

export const ChatInput: React.FC = () => {
  const {
    userInput,
    setUserInput,
    suppressedSpans,
    setSuppressedSpans,
    sendPlayerAction,
    isLoading,
    isStreaming,
    setSystemAlert,
  } = useGameStore();

  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [isInputOverflowing, setIsInputOverflowing] = useState(false);
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    selection: SyntaxSelectionRange;
  } | null>(null);

  const editorRef = useRef<HTMLDivElement>(null);
  const isComposingRef = useRef(false);
  const lastRenderedValueRef = useRef<string | null>(null);
  const lastRenderedSuppressedKeyRef = useRef<string>('[]');
  const pendingSelectionRef = useRef<SyntaxSelectionRange | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);

  const hasText = userInput.trim().length > 0;
  const isInputDisabled = isLoading || isStreaming || isTranscribing;

  const recalculateLayout = useCallback(() => {
    const el = editorRef.current;
    if (!el) return;
    el.style.height = 'auto';
    const scrollHeight = el.scrollHeight;
    el.style.height = `${Math.min(Math.max(scrollHeight, MIN_EDITOR_HEIGHT), MAX_EDITOR_HEIGHT)}px`;
    setIsInputOverflowing(scrollHeight > MAX_EDITOR_HEIGHT);
  }, []);

  // Синхронізація підсвічених DOM-токенів зі збереженням каретки, скролу та автовисоти
  useLayoutEffect(() => {
    const el = editorRef.current;
    if (!el) return;

    const cleanValue = stripZeroWidth(userInput);
    if (cleanValue !== userInput) {
      setUserInput(cleanValue);
      return;
    }

    if (isComposingRef.current) return;

    const currentDomText = extractPlainTextFromEditor(el);
    const suppressedKey = JSON.stringify(suppressedSpans);
    if (
      lastRenderedValueRef.current !== cleanValue ||
      lastRenderedSuppressedKeyRef.current !== suppressedKey ||
      currentDomText !== cleanValue
    ) {
      const prevScrollTop = el.scrollTop;
      const shouldRestoreSelection = document.activeElement === el;
      const savedSelection =
        pendingSelectionRef.current ??
        (shouldRestoreSelection ? getEditorSelectionOffsets(el) : null);

      renderTokensIntoEditor(el, cleanValue, suppressedSpans);
      lastRenderedValueRef.current = cleanValue;
      lastRenderedSuppressedKeyRef.current = suppressedKey;
      pendingSelectionRef.current = null;

      if (savedSelection && shouldRestoreSelection) {
        const clampedStart = Math.min(savedSelection.start, cleanValue.length);
        const clampedEnd = Math.min(savedSelection.end, cleanValue.length);
        setEditorSelectionOffsets(el, clampedStart, clampedEnd);
      }

      el.scrollTop = prevScrollTop;
    }

    recalculateLayout();
  }, [userInput, suppressedSpans, setUserInput, recalculateLayout]);

  // Перерахунок висоти й скролу при ресайзі вікна чи переключенні Sidebar
  useEffect(() => {
    const el = editorRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;

    const observer = new ResizeObserver(() => {
      recalculateLayout();
    });
    observer.observe(el);

    return () => observer.disconnect();
  }, [recalculateLayout]);

  const applyValueChange = useCallback(
    (nextValue: string, nextSelectionStart: number, nextSelectionEnd = nextSelectionStart) => {
      const sanitized = stripZeroWidth(nextValue);
      pendingSelectionRef.current = {
        start: Math.max(0, Math.min(sanitized.length, nextSelectionStart)),
        end: Math.max(0, Math.min(sanitized.length, nextSelectionEnd)),
      };
      setUserInput(sanitized);
    },
    [setUserInput]
  );

  const spliceSelection = useCallback(
    (selection: SyntaxSelectionRange, insertedText: string) => {
      const cleanInserted = stripZeroWidth(insertedText.replace(/\r\n?/g, '\n'));
      const before = userInput.slice(0, selection.start);
      const after = userInput.slice(selection.end);
      const nextValue = `${before}${cleanInserted}${after}`;
      const nextCaret = selection.start + cleanInserted.length;

      setSuppressedSpans(remapSuppressedSpans(userInput, nextValue, suppressedSpans));
      applyValueChange(nextValue, nextCaret);
    },
    [userInput, suppressedSpans, setSuppressedSpans, applyValueChange]
  );

  const handleInput = () => {
    const el = editorRef.current;
    if (!el || isComposingRef.current) return;

    const nextRaw = extractPlainTextFromEditor(el);
    pendingSelectionRef.current = getEditorSelectionOffsets(el);
    lastRenderedValueRef.current = null;
    setSuppressedSpans(remapSuppressedSpans(userInput, nextRaw, suppressedSpans));
    setUserInput(nextRaw);
  };

  const handleSend = () => {
    const cleanText = stripZeroWidth(userInput);
    if (!cleanText.trim() || isLoading || isStreaming) return;
    // sendPlayerAction сам зчитує suppressedSpans перед очищенням інпуту
    sendPlayerAction(cleanText).catch((err: Error) => {
      setSystemAlert(`Помилка відправки: ${err.message}`, 'error');
    });
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.nativeEvent.isComposing || isComposingRef.current) return;

    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
      return;
    }

    if (e.key === 'Enter' && e.shiftKey) {
      e.preventDefault();
      const el = editorRef.current;
      if (!el) return;
      const sel = getEditorSelectionOffsets(el);
      spliceSelection(sel, '\n');
    }
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLDivElement>) => {
    if (isInputDisabled) return;
    e.preventDefault();
    const el = editorRef.current;
    if (!el) return;
    const clipText = e.clipboardData.getData('text/plain');
    if (!clipText) return;
    const sel = getEditorSelectionOffsets(el);
    spliceSelection(sel, clipText);
  };

  const handleCopyOrCut = (isCut: boolean, e: React.ClipboardEvent<HTMLDivElement>) => {
    const el = editorRef.current;
    if (!el) return;
    const sel = getEditorSelectionOffsets(el);
    if (sel.end <= sel.start) return;

    e.preventDefault();
    const selectedText = stripZeroWidth(userInput.slice(sel.start, sel.end));
    e.clipboardData.setData('text/plain', selectedText);

    if (isCut && !isInputDisabled) {
      spliceSelection(sel, '');
    }
  };

  // Робота з аудіозаписом
  const startRecording = async () => {
    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        setSystemAlert('Аудіозапис не підтримується у цьому середовищі', 'error');
        return;
      }

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioChunksRef.current = [];

      const recorder = new MediaRecorder(stream);
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      recorder.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, {
          type: recorder.mimeType || 'audio/webm',
        });
        stream.getTracks().forEach((track) => track.stop());

        setIsTranscribing(true);
        try {
          const text = stripZeroWidth(await gameApi.transcribeAudio(audioBlob, 'recording.webm'));
          if (text) {
            const currentInput = stripZeroWidth(useGameStore.getState().userInput);
            setUserInput(currentInput ? `${currentInput} ${text}` : text);
          }
        } catch (err: unknown) {
          const message = err instanceof Error ? err.message : 'Невідома помилка';
          setSystemAlert(`Помилка розпізнавання: ${message}`, 'error');
        } finally {
          setIsTranscribing(false);
        }
      };

      recorder.start();
      setIsRecording(true);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Невідома помилка';
      setSystemAlert(`Не вдалося отримати доступ до мікрофона: ${message}`, 'error');
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  };

  const handleSendOrRecordClick = () => {
    if (isRecording) {
      stopRecording();
    } else if (hasText) {
      handleSend();
    } else {
      startRecording();
    }
  };

  const handleContextMenu = (e: React.MouseEvent<HTMLDivElement>) => {
    e.preventDefault();
    const el = editorRef.current;
    setContextMenu({
      x: e.clientX,
      y: e.clientY,
      selection: el ? getEditorSelectionOffsets(el) : { start: 0, end: 0 },
    });
  };

  const hasSelection = !!contextMenu && contextMenu.selection.end > contextMenu.selection.start;
  const canToggleFormatting =
    userInput.length > 0 &&
    (suppressedSpans.length > 0 ||
      tokenizeNovaSyntax(userInput, suppressedSpans).some((token) => token.type !== 'normal'));

  return (
    <div className="w-full flex flex-col select-none">
      {/* Баннери запису та транскрипції голосу */}
      <VoiceBanner isRecording={isRecording} isTranscribing={isTranscribing} />

      {/* Головна зона вводу: Border.inputBox + Кнопки праворуч */}
      <div className="flex items-end gap-3">
        {/* Поле вводу з фірмовою рамкою #333333 -> focus #5A0010 та contenteditable-підсвіткою */}
        <div className="flex-1 bg-[#161616] border border-[#333333] hover:border-[#444444] focus-within:border-[#5A0010] focus-within:hover:border-[#5A0010] rounded-[10px] p-[14px_16px] flex items-center transition-colors shadow-inner">
          <div className="relative w-full min-w-0">
            {userInput.length === 0 && (
              <span
                aria-hidden="true"
                className="pointer-events-none select-none absolute inset-0 text-[15px] leading-[24px] font-sans text-[#555555] italic truncate"
              >
                Введіть дію, думку або фразу...
              </span>
            )}

            <div
              ref={editorRef}
              role="textbox"
              aria-multiline="true"
              aria-label="Введіть дію, думку або фразу..."
              contentEditable={!isInputDisabled}
              suppressContentEditableWarning
              spellCheck={false}
              onInput={handleInput}
              onKeyDown={handleKeyDown}
              onPaste={handlePaste}
              onCopy={(e) => handleCopyOrCut(false, e)}
              onCut={(e) => handleCopyOrCut(true, e)}
              onCompositionStart={() => {
                isComposingRef.current = true;
              }}
              onCompositionEnd={() => {
                isComposingRef.current = false;
                handleInput();
              }}
              onContextMenu={handleContextMenu}
              className={`w-full bg-transparent text-[15px] leading-[24px] font-sans text-[#E5E7EB] selection:bg-[#7E0018]/40 whitespace-pre-wrap break-words outline-none min-h-[24px] max-h-[120px] m-0 p-0 border-0 block ${
                isInputOverflowing ? 'overflow-y-auto' : 'overflow-hidden'
              } ${isInputDisabled ? 'opacity-60 cursor-not-allowed select-none' : 'select-text cursor-text'}`}
            />
          </div>
        </div>

        {/* Права група: Send/Mic Button (48x48) + Help Icon (?) */}
        <div className="flex items-end gap-3 pb-0.5 shrink-0">
          <SendOrMicButton
            hasText={hasText}
            isRecording={isRecording}
            disabled={isInputDisabled && !isRecording}
            onClick={handleSendOrRecordClick}
          />
          <div className="pb-2.5">
            <SyntaxHelpTooltip />
          </div>
        </div>
      </div>

      <ContextMenu
        isOpen={!!contextMenu}
        x={contextMenu?.x ?? 0}
        y={contextMenu?.y ?? 0}
        onClose={() => setContextMenu(null)}
        items={[
          {
            label: 'Вирізати',
            shortcut: 'Ctrl+X',
            icon: <Scissors size={13} />,
            disabled: !hasSelection || isInputDisabled,
            onClick: () => {
              if (!contextMenu) return;
              const selected = stripZeroWidth(
                userInput.slice(contextMenu.selection.start, contextMenu.selection.end)
              );
              if (!selected) return;
              navigator.clipboard
                .writeText(selected)
                .then(() => {
                  editorRef.current?.focus();
                  spliceSelection(contextMenu.selection, '');
                })
                .catch(() => {});
            },
          },
          {
            label: 'Копіювати',
            shortcut: 'Ctrl+C',
            icon: <Copy size={13} />,
            disabled: !hasSelection,
            onClick: () => {
              if (!contextMenu) return;
              const selected = stripZeroWidth(
                userInput.slice(contextMenu.selection.start, contextMenu.selection.end)
              );
              if (!selected) return;
              navigator.clipboard.writeText(selected).catch(() => {});
            },
          },
          {
            label: 'Вставити',
            shortcut: 'Ctrl+V',
            icon: <ClipboardPaste size={13} />,
            disabled: isInputDisabled,
            onClick: () => {
              if (!contextMenu) return;
              navigator.clipboard
                .readText()
                .then((clipText) => {
                  if (!clipText) return;
                  editorRef.current?.focus();
                  spliceSelection(contextMenu.selection, clipText);
                })
                .catch(() => {});
            },
          },
          { type: 'separator' },
          {
            label: 'Скасувати форматування',
            icon: <RemoveFormatting size={13} />,
            disabled: !canToggleFormatting || isInputDisabled,
            onClick: () => {
              if (!contextMenu) return;
              const nextSuppressed = toggleSuppressFormatting(
                userInput,
                suppressedSpans,
                contextMenu.selection
              );
              pendingSelectionRef.current = contextMenu.selection;
              editorRef.current?.focus();
              setSuppressedSpans(nextSuppressed);
            },
          },
        ]}
      />
    </div>
  );
};
