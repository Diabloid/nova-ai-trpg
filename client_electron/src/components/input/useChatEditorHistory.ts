import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
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
  type FormattableSyntaxKind,
  type SyntaxSelectionRange,
} from '../../utils/novaSyntax';
import {
  MAX_EDITOR_HEIGHT,
  MAX_HISTORY_SIZE,
  MIN_EDITOR_HEIGHT,
  TYPING_BURST_MS,
  type EditorHistoryEntry,
} from './chatEditorHelpers';

interface UseChatEditorHistoryParams {
  userInput: string;
  setUserInput: (text: string) => void;
  suppressedSpans: SyntaxSelectionRange[];
  setSuppressedSpans: (spans: SyntaxSelectionRange[]) => void;
  activeCampaignId: string | null;
  rollbackInputSignal: number;
}

/**
 * Інкапсулює стек undo/redo, коалесинг набору тексту, DOM-синхронізацію Nova-токенів,
 * збереження позиції каретки/скролу та авто-висоту `contentEditable`-редактора.
 */
export function useChatEditorHistory({
  userInput,
  setUserInput,
  suppressedSpans,
  setSuppressedSpans,
  activeCampaignId,
  rollbackInputSignal,
}: UseChatEditorHistoryParams) {
  const [isInputOverflowing, setIsInputOverflowing] = useState(false);
  const [isRollbackHighlighted, setIsRollbackHighlighted] = useState(false);

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

  const performUndo = useCallback(
    (locked = false) => {
      if (locked || undoStackRef.current.length === 0) return;
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
    },
    [userInput, suppressedSpans, setSuppressedSpans, applyValueChange]
  );

  const performRedo = useCallback(
    (locked = false) => {
      if (locked || redoStackRef.current.length === 0) return;
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
    },
    [userInput, suppressedSpans, setSuppressedSpans, applyValueChange]
  );

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

  const handleInput = useCallback(() => {
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
        pushHistoryStep(
          {
            text: prevClean,
            suppressedSpans,
            selectionStart: prevSelection.start,
            selectionEnd: prevSelection.end,
          },
          'delete',
          lenDelta === -1 ? 'x' : undefined
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
  }, [userInput, suppressedSpans, pushHistoryStep, setSuppressedSpans, setUserInput]);

  const applyFormatting = useCallback(
    (
      kind: FormattableSyntaxKind,
      explicitSelection?: SyntaxSelectionRange,
      locked = false
    ) => {
      if (locked) return;
      const el = editorRef.current;
      const selection =
        explicitSelection ?? (el ? getEditorSelectionOffsets(el) : { start: 0, end: 0 });
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
    [userInput, suppressedSpans, pushHistoryStep, setSuppressedSpans, applyValueChange]
  );

  const toggleFormattingAtSelection = useCallback(
    (selection: SyntaxSelectionRange) => {
      const nextSuppressed = toggleSuppressFormatting(userInput, suppressedSpans, selection);
      if (JSON.stringify(nextSuppressed) !== JSON.stringify(suppressedSpans)) {
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
      pendingSelectionRef.current = selection;
      editorRef.current?.focus();
      setSuppressedSpans(nextSuppressed);
    },
    [userInput, suppressedSpans, pushHistoryStep, setSuppressedSpans]
  );

  const handleBeforeInput = useCallback(() => {
    const el = editorRef.current;
    if (!el || isComposingRef.current) return;
    beforeSelectionRef.current = getEditorSelectionOffsets(el);
  }, []);

  const handleCompositionStart = useCallback(() => {
    const el = editorRef.current;
    if (el) {
      beforeSelectionRef.current = getEditorSelectionOffsets(el);
    }
    isComposingRef.current = true;
  }, []);

  const handleCompositionEnd = useCallback(() => {
    isComposingRef.current = false;
    handleInput();
  }, [handleInput]);

  const getSelectionOffsets = useCallback((): SyntaxSelectionRange => {
    const el = editorRef.current;
    return el ? getEditorSelectionOffsets(el) : { start: 0, end: 0 };
  }, []);

  const setPendingSelection = useCallback((range: SyntaxSelectionRange) => {
    pendingSelectionRef.current = range;
  }, []);

  const focusEditor = useCallback(() => {
    editorRef.current?.focus();
  }, []);

  return {
    editorRef,
    isComposingRef,
    isInputOverflowing,
    isRollbackHighlighted,
    pushHistoryStep,
    clearHistory,
    performUndo,
    performRedo,
    spliceSelection,
    applyFormatting,
    toggleFormattingAtSelection,
    handleInput,
    handleBeforeInput,
    handleCompositionStart,
    handleCompositionEnd,
    getSelectionOffsets,
    setPendingSelection,
    focusEditor,
  };
}
