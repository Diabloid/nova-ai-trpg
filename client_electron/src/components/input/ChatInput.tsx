import React, { useRef, useState, useLayoutEffect, useEffect, useCallback } from 'react';
import {
  Scissors,
  Copy,
  ClipboardPaste,
  RemoveFormatting,
  Bold,
  Italic,
  MessageSquare,
  Braces,
} from 'lucide-react';
import { useGameStore } from '../../store/useGameStore';
import { useVoiceRecorder } from '../../hooks/useVoiceRecorder';
import { ChatInputDock } from './ChatInputDock';
import { SyntaxHelpTooltip } from './SyntaxHelpTooltip';
import { ContextMenu } from '../ui/ContextMenu';
import {
  extractPlainTextFromEditor,
  getEditorSelectionOffsets,
  renderTokensIntoEditor,
  setEditorSelectionOffsets,
} from '../../utils/caretDom';
import {
  applyNovaFormatting,
  remapSuppressedSpans,
  stripZeroWidth,
  toggleSuppressFormatting,
  tokenizeNovaSyntax,
  type FormattableSyntaxKind,
  type SyntaxSelectionRange,
} from '../../utils/novaSyntax';

const MIN_EDITOR_HEIGHT = 24;
const MAX_EDITOR_HEIGHT = 120;
const MAX_HISTORY_SIZE = 100;
const TYPING_BURST_MS = 800;

interface EditorHistoryEntry {
  text: string;
  suppressedSpans: SyntaxSelectionRange[];
  selectionStart: number;
  selectionEnd: number;
}

export const ChatInput: React.FC = () => {
  const {
    userInput,
    setUserInput,
    suppressedSpans,
    setSuppressedSpans,
    sendPlayerAction,
    activeCampaignId,
    backendOffline,
    isLoading,
    isStreaming,
    isRollingBack,
    rollbackInputSignal,
    setSystemAlert,
  } = useGameStore();

  const [isInputOverflowing, setIsInputOverflowing] = useState(false);
  const [isRollbackHighlighted, setIsRollbackHighlighted] = useState(false);
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
  const beforeSelectionRef = useRef<SyntaxSelectionRange | null>(null);
  const undoStackRef = useRef<EditorHistoryEntry[]>([]);
  const redoStackRef = useRef<EditorHistoryEntry[]>([]);
  const lastBurstRef = useRef<{ time: number; kind: 'insert' | 'delete' } | null>(null);
  const lastRollbackSignalRef = useRef<number>(rollbackInputSignal);

  const pushHistoryStep = useCallback(
    (
      entry: EditorHistoryEntry,
      mode: 'discrete' | 'insert' | 'delete',
      singleCharDelta?: string
    ) => {
      const now = Date.now();
      const isSingleNonSpaceInsert =
        mode === 'insert' &&
        singleCharDelta !== undefined &&
        singleCharDelta.length === 1 &&
        !/\s/.test(singleCharDelta);
      const isSingleDelete =
        mode === 'delete' &&
        singleCharDelta !== undefined &&
        singleCharDelta.length === 1;

      const canCoalesce =
        (isSingleNonSpaceInsert || isSingleDelete) &&
        lastBurstRef.current !== null &&
        lastBurstRef.current.kind === mode &&
        now - lastBurstRef.current.time < TYPING_BURST_MS &&
        undoStackRef.current.length > 0;

      redoStackRef.current = [];

      if (canCoalesce && lastBurstRef.current) {
        lastBurstRef.current.time = now;
        return;
      }

      undoStackRef.current.push({
        text: entry.text,
        suppressedSpans: entry.suppressedSpans.map((s) => ({ ...s })),
        selectionStart: entry.selectionStart,
        selectionEnd: entry.selectionEnd,
      });
      if (undoStackRef.current.length > MAX_HISTORY_SIZE) {
        undoStackRef.current.shift();
      }

      lastBurstRef.current =
        mode === 'insert' || mode === 'delete' ? { time: now, kind: mode } : null;
    },
    []
  );

  const clearHistory = useCallback(() => {
    undoStackRef.current = [];
    redoStackRef.current = [];
    lastBurstRef.current = null;
    beforeSelectionRef.current = null;
  }, []);

  const handleTranscribed = useCallback(
    (text: string) => {
      const state = useGameStore.getState();
      const currentInput = stripZeroWidth(state.userInput);
      const nextInput = currentInput ? `${currentInput} ${text}` : text;
      const el = editorRef.current;
      const sel = el ? getEditorSelectionOffsets(el) : { start: currentInput.length, end: currentInput.length };
      pushHistoryStep(
        {
          text: currentInput,
          suppressedSpans: state.suppressedSpans,
          selectionStart: sel.start,
          selectionEnd: sel.end,
        },
        'discrete'
      );
      pendingSelectionRef.current = { start: nextInput.length, end: nextInput.length };
      setUserInput(nextInput);
    },
    [pushHistoryStep, setUserInput]
  );

  const handleVoiceError = useCallback(
    (message: string) => {
      setSystemAlert(message, 'error');
    },
    [setSystemAlert]
  );

  const { isRecording, isTranscribing, startRecording, stopRecording } = useVoiceRecorder({
    onTranscribed: handleTranscribed,
    onError: handleVoiceError,
  });

  const hasText = userInput.trim().length > 0;
  // Розділяємо блокування редактора і блокування відправки, щоб гравець міг вільно набирати чернетку під час стрімінгу
  const isEditorLocked = isLoading || isTranscribing || backendOffline || !activeCampaignId;
  const isSendBlocked =
    isLoading ||
    isStreaming ||
    isRollingBack ||
    isTranscribing ||
    backendOffline ||
    !activeCampaignId;
  const placeholderText = backendOffline
    ? 'Сервер офлайн • Очікування підключення...'
    : !activeCampaignId
      ? 'Створіть або оберіть кампанію, щоб розпочати гру...'
      : 'Введіть дію, думку або фразу...';

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

    const hasRollbackTriggered =
      rollbackInputSignal > 0 && rollbackInputSignal !== lastRollbackSignalRef.current;
    if (hasRollbackTriggered) {
      lastRollbackSignalRef.current = rollbackInputSignal;
      pendingSelectionRef.current = {
        start: cleanValue.length,
        end: cleanValue.length,
      };
    }

    const currentDomText = extractPlainTextFromEditor(el);
    const suppressedKey = JSON.stringify(suppressedSpans);
    if (
      lastRenderedValueRef.current !== cleanValue ||
      lastRenderedSuppressedKeyRef.current !== suppressedKey ||
      currentDomText !== cleanValue
    ) {
      const prevScrollTop = el.scrollTop;
      const shouldRestoreSelection = hasRollbackTriggered || document.activeElement === el;
      const savedSelection =
        pendingSelectionRef.current ??
        (shouldRestoreSelection ? getEditorSelectionOffsets(el) : null);

      renderTokensIntoEditor(el, cleanValue, suppressedSpans);
      lastRenderedValueRef.current = cleanValue;
      lastRenderedSuppressedKeyRef.current = suppressedKey;
      pendingSelectionRef.current = null;

      if (hasRollbackTriggered) {
        el.focus();
      }

      if (savedSelection && shouldRestoreSelection) {
        const clampedStart = Math.min(savedSelection.start, cleanValue.length);
        const clampedEnd = Math.min(savedSelection.end, cleanValue.length);
        setEditorSelectionOffsets(el, clampedStart, clampedEnd);
      }

      el.scrollTop = prevScrollTop;
    } else if (hasRollbackTriggered) {
      el.focus();
      setEditorSelectionOffsets(el, cleanValue.length, cleanValue.length);
      pendingSelectionRef.current = null;
    }

    recalculateLayout();
  }, [userInput, suppressedSpans, rollbackInputSignal, setUserInput, recalculateLayout]);

  // Коротке підсвічування рамки інпуту після відкату ходу (~500 мс)
  useEffect(() => {
    if (rollbackInputSignal === 0) return;
    const startTimer = setTimeout(() => setIsRollbackHighlighted(true), 0);
    const endTimer = setTimeout(() => setIsRollbackHighlighted(false), 500);
    return () => {
      clearTimeout(startTimer);
      clearTimeout(endTimer);
    };
  }, [rollbackInputSignal]);

  // Скидання історії скасувань при зміні кампанії
  useEffect(() => {
    clearHistory();
  }, [activeCampaignId, clearHistory]);

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

  const performUndo = useCallback(() => {
    if (isEditorLocked || undoStackRef.current.length === 0) return;
    const el = editorRef.current;
    const currentSelection = el ? getEditorSelectionOffsets(el) : { start: 0, end: 0 };
    const currentText = stripZeroWidth(userInput);

    const target = undoStackRef.current.pop();
    if (!target) return;

    redoStackRef.current.push({
      text: currentText,
      suppressedSpans: suppressedSpans.map((s) => ({ ...s })),
      selectionStart: currentSelection.start,
      selectionEnd: currentSelection.end,
    });
    lastBurstRef.current = null;
    lastRenderedValueRef.current = null;
    setSuppressedSpans(target.suppressedSpans);
    applyValueChange(target.text, target.selectionStart, target.selectionEnd);
  }, [isEditorLocked, userInput, suppressedSpans, setSuppressedSpans, applyValueChange]);

  const performRedo = useCallback(() => {
    if (isEditorLocked || redoStackRef.current.length === 0) return;
    const el = editorRef.current;
    const currentSelection = el ? getEditorSelectionOffsets(el) : { start: 0, end: 0 };
    const currentText = stripZeroWidth(userInput);

    const target = redoStackRef.current.pop();
    if (!target) return;

    undoStackRef.current.push({
      text: currentText,
      suppressedSpans: suppressedSpans.map((s) => ({ ...s })),
      selectionStart: currentSelection.start,
      selectionEnd: currentSelection.end,
    });
    lastBurstRef.current = null;
    lastRenderedValueRef.current = null;
    setSuppressedSpans(target.suppressedSpans);
    applyValueChange(target.text, target.selectionStart, target.selectionEnd);
  }, [isEditorLocked, userInput, suppressedSpans, setSuppressedSpans, applyValueChange]);

  const spliceSelection = useCallback(
    (selection: SyntaxSelectionRange, insertedText: string) => {
      const cleanInserted = stripZeroWidth(insertedText.replace(/\r\n?/g, '\n'));
      const before = userInput.slice(0, selection.start);
      const after = userInput.slice(selection.end);
      const nextValue = `${before}${cleanInserted}${after}`;
      const nextCaret = selection.start + cleanInserted.length;

      if (nextValue !== userInput) {
        pushHistoryStep(
          {
            text: stripZeroWidth(userInput),
            suppressedSpans,
            selectionStart: selection.start,
            selectionEnd: selection.end,
          },
          'discrete'
        );
      }

      setSuppressedSpans(remapSuppressedSpans(userInput, nextValue, suppressedSpans));
      applyValueChange(nextValue, nextCaret);
    },
    [userInput, suppressedSpans, pushHistoryStep, setSuppressedSpans, applyValueChange]
  );

  const handleInput = () => {
    const el = editorRef.current;
    if (!el || isComposingRef.current) return;

    const nextRaw = extractPlainTextFromEditor(el);
    const afterSelection = getEditorSelectionOffsets(el);
    const prevClean = stripZeroWidth(userInput);
    const prevSelection = beforeSelectionRef.current ?? afterSelection;
    beforeSelectionRef.current = null;

    if (nextRaw !== prevClean) {
      const lenDelta = nextRaw.length - prevClean.length;
      if (lenDelta > 0) {
        const deltaChar =
          lenDelta === 1 && afterSelection.start > 0
            ? nextRaw.slice(afterSelection.start - 1, afterSelection.start)
            : undefined;
        pushHistoryStep(
          {
            text: prevClean,
            suppressedSpans,
            selectionStart: prevSelection.start,
            selectionEnd: prevSelection.end,
          },
          'insert',
          deltaChar
        );
      } else if (lenDelta < 0) {
        const deletedSingle = lenDelta === -1 ? 'x' : undefined;
        pushHistoryStep(
          {
            text: prevClean,
            suppressedSpans,
            selectionStart: prevSelection.start,
            selectionEnd: prevSelection.end,
          },
          'delete',
          deletedSingle
        );
      } else {
        pushHistoryStep(
          {
            text: prevClean,
            suppressedSpans,
            selectionStart: prevSelection.start,
            selectionEnd: prevSelection.end,
          },
          'discrete'
        );
      }
    }

    pendingSelectionRef.current = afterSelection;
    lastRenderedValueRef.current = null;
    setSuppressedSpans(remapSuppressedSpans(userInput, nextRaw, suppressedSpans));
    setUserInput(nextRaw);
  };

  const handleSend = () => {
    if (!activeCampaignId) {
      setSystemAlert('Спочатку оберіть або створіть кампанію', 'warning');
      return;
    }
    const cleanText = stripZeroWidth(userInput);
    if (!cleanText.trim() || isSendBlocked) return;
    clearHistory();
    // sendPlayerAction сам зчитує suppressedSpans перед очищенням інпуту
    sendPlayerAction(cleanText).catch((err: Error) => {
      setSystemAlert(`Помилка відправки: ${err.message}`, 'error');
    });
  };

  const applyFormatting = useCallback(
    (kind: FormattableSyntaxKind, explicitSelection?: SyntaxSelectionRange) => {
      if (isEditorLocked) return;
      const el = editorRef.current;
      const selection = explicitSelection ?? (el ? getEditorSelectionOffsets(el) : { start: 0, end: 0 });
      const res = applyNovaFormatting(userInput, suppressedSpans, selection, kind);

      if (
        res.text !== userInput ||
        JSON.stringify(res.suppressedSpans) !== JSON.stringify(suppressedSpans)
      ) {
        pushHistoryStep(
          {
            text: stripZeroWidth(userInput),
            suppressedSpans,
            selectionStart: selection.start,
            selectionEnd: selection.end,
          },
          'discrete'
        );
      }

      setSuppressedSpans(res.suppressedSpans);
      el?.focus();
      applyValueChange(res.text, res.selectionStart, res.selectionEnd);
    },
    [isEditorLocked, userInput, suppressedSpans, pushHistoryStep, setSuppressedSpans, applyValueChange]
  );

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.nativeEvent.isComposing || isComposingRef.current) return;

    if (!isEditorLocked && (e.ctrlKey || e.metaKey) && !e.altKey) {
      // Перевіряємо фізичний e.code для незалежності від розкладки; Ctrl+Shift+I (DevTools) не чіпаємо
      if (e.code === 'KeyZ' && !e.shiftKey) {
        e.preventDefault();
        performUndo();
        return;
      }
      if ((e.code === 'KeyZ' && e.shiftKey) || (e.code === 'KeyY' && !e.shiftKey)) {
        e.preventDefault();
        performRedo();
        return;
      }

      if (!e.shiftKey) {
        if (e.code === 'KeyB') {
          e.preventDefault();
          applyFormatting('action');
          return;
        }
        if (e.code === 'KeyI') {
          e.preventDefault();
          applyFormatting('thought');
          return;
        }
        if (e.code === 'KeyD') {
          e.preventDefault();
          applyFormatting('speech');
          return;
        }
        if (e.code === 'Slash') {
          e.preventDefault();
          applyFormatting('ooc');
          return;
        }
      }
    }

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
    if (isEditorLocked) return;
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

    if (isCut && !isEditorLocked) {
      spliceSelection(sel, '');
    }
  };

  const handleSendOrRecordClick = () => {
    if (isRecording) {
      stopRecording();
    } else if (hasText) {
      handleSend();
    } else if (!isSendBlocked) {
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
    <>
      <ChatInputDock
        hasText={hasText}
        isRecording={isRecording}
        isTranscribing={isTranscribing}
        isSendDisabled={isSendBlocked && !isRecording}
        onSendOrRecord={handleSendOrRecordClick}
        isHighlighted={isRollbackHighlighted}
        isDimmed={isEditorLocked}
        inputBoxMarker
        rightExtras={<SyntaxHelpTooltip />}
      >
        <div className="relative w-full min-w-0">
          {userInput.length === 0 && (
            <span
              aria-hidden="true"
              className="pointer-events-none select-none absolute inset-0 text-[15px] leading-[24px] font-sans text-[#555555] italic truncate"
            >
              {placeholderText}
            </span>
          )}

          <div
            ref={editorRef}
            role="textbox"
            aria-multiline="true"
            aria-label={placeholderText}
            contentEditable={!isEditorLocked}
            suppressContentEditableWarning
            spellCheck={false}
            onBeforeInput={() => {
              const el = editorRef.current;
              if (!el || isComposingRef.current) return;
              beforeSelectionRef.current = getEditorSelectionOffsets(el);
            }}
            onInput={handleInput}
            onKeyDown={handleKeyDown}
            onPaste={handlePaste}
            onCopy={(e) => handleCopyOrCut(false, e)}
            onCut={(e) => handleCopyOrCut(true, e)}
            onCompositionStart={() => {
              const el = editorRef.current;
              if (el) {
                beforeSelectionRef.current = getEditorSelectionOffsets(el);
              }
              isComposingRef.current = true;
            }}
            onCompositionEnd={() => {
              isComposingRef.current = false;
              handleInput();
            }}
            onContextMenu={handleContextMenu}
            className={`w-full bg-transparent text-[15px] leading-[24px] font-sans text-[#E5E7EB] selection:bg-[#7E0018]/40 whitespace-pre-wrap break-words outline-none min-h-[24px] max-h-[120px] m-0 p-0 border-0 block ${
              isInputOverflowing ? 'overflow-y-auto' : 'overflow-hidden'
            } ${isEditorLocked ? 'cursor-not-allowed select-none' : 'select-text cursor-text'}`}
          />
        </div>
      </ChatInputDock>

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
            disabled: !hasSelection || isEditorLocked,
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
            disabled: isEditorLocked,
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
            label: 'Дія (**...**)',
            shortcut: 'Ctrl+B',
            icon: <Bold size={13} className="text-[#EAB308]" />,
            disabled: isEditorLocked,
            onClick: () => {
              if (!contextMenu) return;
              applyFormatting('action', contextMenu.selection);
            },
          },
          {
            label: 'Думка ("...")',
            shortcut: 'Ctrl+I',
            icon: <Italic size={13} className="text-[#60A5FA]" />,
            disabled: isEditorLocked,
            onClick: () => {
              if (!contextMenu) return;
              applyFormatting('thought', contextMenu.selection);
            },
          },
          {
            label: 'Пряма мова (- ...)',
            shortcut: 'Ctrl+D',
            icon: <MessageSquare size={13} className="text-[#4ADE80]" />,
            disabled: isEditorLocked,
            onClick: () => {
              if (!contextMenu) return;
              applyFormatting('speech', contextMenu.selection);
            },
          },
          {
            label: 'Поза грою ((...))',
            shortcut: 'Ctrl+/',
            icon: <Braces size={13} className="text-[#9CA3AF]" />,
            disabled: isEditorLocked,
            onClick: () => {
              if (!contextMenu) return;
              applyFormatting('ooc', contextMenu.selection);
            },
          },
          { type: 'separator' },
          {
            label: 'Скасувати форматування',
            icon: <RemoveFormatting size={13} />,
            disabled: !canToggleFormatting || isEditorLocked,
            onClick: () => {
              if (!contextMenu) return;
              const nextSuppressed = toggleSuppressFormatting(
                userInput,
                suppressedSpans,
                contextMenu.selection
              );
              if (JSON.stringify(nextSuppressed) !== JSON.stringify(suppressedSpans)) {
                pushHistoryStep(
                  {
                    text: stripZeroWidth(userInput),
                    suppressedSpans,
                    selectionStart: contextMenu.selection.start,
                    selectionEnd: contextMenu.selection.end,
                  },
                  'discrete'
                );
              }
              pendingSelectionRef.current = contextMenu.selection;
              editorRef.current?.focus();
              setSuppressedSpans(nextSuppressed);
            },
          },
        ]}
      />
    </>
  );
};
