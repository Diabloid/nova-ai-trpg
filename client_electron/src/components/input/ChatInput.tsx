import React, { useCallback, useMemo, useState } from 'react';
import { useVoiceRecorder } from '../../hooks/useVoiceRecorder';
import { useGameStore } from '../../store/useGameStore';
import {
  stripZeroWidth,
  tokenizeNovaSyntax,
  type SyntaxSelectionRange,
} from '../../utils/novaSyntax';
import { ContextMenu } from '../ui/ContextMenu';
import { buildChatContextMenuItems, resolveEditorShortcut } from './chatEditorHelpers';
import { ChatInputDock } from './ChatInputDock';
import { SyntaxHelpTooltip } from './SyntaxHelpTooltip';
import { useChatEditorHistory } from './useChatEditorHistory';

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

  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    selection: SyntaxSelectionRange;
  } | null>(null);

  // Розділяємо блокування редактора і блокування відправки, щоб гравець міг вільно набирати чернетку під час стрімінгу
  const isEditorLocked = isLoading || backendOffline || !activeCampaignId;

  const {
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
  } = useChatEditorHistory({
    userInput,
    setUserInput,
    suppressedSpans,
    setSuppressedSpans,
    activeCampaignId,
    rollbackInputSignal,
  });

  const handleTranscribed = useCallback(
    (text: string) => {
      const state = useGameStore.getState();
      const currentInput = stripZeroWidth(state.userInput);
      const nextInput = currentInput ? `${currentInput} ${text}` : text;
      const sel = editorRef.current
        ? getSelectionOffsets()
        : { start: currentInput.length, end: currentInput.length };

      pushHistoryStep(
        {
          text: currentInput,
          suppressedSpans: state.suppressedSpans,
          selectionStart: sel.start,
          selectionEnd: sel.end,
        },
        'discrete'
      );
      setPendingSelection({ start: nextInput.length, end: nextInput.length });
      setUserInput(nextInput);
    },
    [editorRef, getSelectionOffsets, pushHistoryStep, setPendingSelection, setUserInput]
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

  const isFieldLocked = isEditorLocked || isTranscribing;
  const isSendBlocked = isFieldLocked || isStreaming || isRollingBack;
  const hasText = userInput.trim().length > 0;
  const placeholderText = backendOffline
    ? 'Сервер офлайн • Очікування підключення...'
    : !activeCampaignId
      ? 'Створіть або оберіть кампанію, щоб розпочати гру...'
      : 'Введіть дію, думку або фразу...';

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

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.nativeEvent.isComposing || isComposingRef.current) return;

    const shortcut = !isFieldLocked ? resolveEditorShortcut(e) : null;
    if (shortcut) {
      e.preventDefault();
      if (shortcut.type === 'undo') performUndo(isFieldLocked);
      else if (shortcut.type === 'redo') performRedo(isFieldLocked);
      else applyFormatting(shortcut.kind, undefined, isFieldLocked);
      return;
    }

    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
      return;
    }

    if (e.key === 'Enter' && e.shiftKey) {
      e.preventDefault();
      if (!editorRef.current) return;
      spliceSelection(getSelectionOffsets(), '\n');
    }
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLDivElement>) => {
    if (isFieldLocked) return;
    e.preventDefault();
    if (!editorRef.current) return;
    const clipText = e.clipboardData.getData('text/plain');
    if (!clipText) return;
    spliceSelection(getSelectionOffsets(), clipText);
  };

  const handleCopyOrCut = (isCut: boolean, e: React.ClipboardEvent<HTMLDivElement>) => {
    if (!editorRef.current) return;
    const sel = getSelectionOffsets();
    if (sel.end <= sel.start) return;

    e.preventDefault();
    const selectedText = stripZeroWidth(userInput.slice(sel.start, sel.end));
    e.clipboardData.setData('text/plain', selectedText);

    if (isCut && !isFieldLocked) {
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
    setContextMenu({
      x: e.clientX,
      y: e.clientY,
      selection: getSelectionOffsets(),
    });
  };

  const canToggleFormatting =
    userInput.length > 0 &&
    (suppressedSpans.length > 0 ||
      tokenizeNovaSyntax(userInput, suppressedSpans).some((token) => token.type !== 'normal'));

  const contextMenuItems = useMemo(
    () =>
      buildChatContextMenuItems({
        selection: contextMenu?.selection ?? null,
        userInput,
        isEditorLocked: isFieldLocked,
        canToggleFormatting,
        onFocusEditor: focusEditor,
        onSpliceSelection: spliceSelection,
        onApplyFormatting: (kind, sel) => applyFormatting(kind, sel, isFieldLocked),
        onToggleSuppressFormatting: toggleFormattingAtSelection,
      }),
    [
      contextMenu,
      userInput,
      isFieldLocked,
      canToggleFormatting,
      focusEditor,
      spliceSelection,
      applyFormatting,
      toggleFormattingAtSelection,
    ]
  );

  return (
    <>
      <ChatInputDock
        hasText={hasText}
        isRecording={isRecording}
        isTranscribing={isTranscribing}
        isSendDisabled={isSendBlocked && !isRecording}
        onSendOrRecord={handleSendOrRecordClick}
        isHighlighted={isRollbackHighlighted}
        isDimmed={isFieldLocked}
        inputBoxMarker
        rightExtras={<SyntaxHelpTooltip />}
      >
        <div className="relative w-full min-w-0">
          {userInput.length === 0 && (
            <span
              aria-hidden="true"
              className="pointer-events-none select-none absolute inset-0 text-[15px] leading-[24px] font-sans text-text-placeholder italic truncate"
            >
              {placeholderText}
            </span>
          )}

          <div
            ref={editorRef}
            role="textbox"
            aria-multiline="true"
            aria-label={placeholderText}
            contentEditable={!isFieldLocked}
            suppressContentEditableWarning
            spellCheck={false}
            onBeforeInput={handleBeforeInput}
            onInput={handleInput}
            onKeyDown={handleKeyDown}
            onPaste={handlePaste}
            onCopy={(e) => handleCopyOrCut(false, e)}
            onCut={(e) => handleCopyOrCut(true, e)}
            onCompositionStart={handleCompositionStart}
            onCompositionEnd={handleCompositionEnd}
            onContextMenu={handleContextMenu}
            className={`w-full bg-transparent text-[15px] leading-[24px] font-sans text-text-primary selection:bg-accent-ruby/40 whitespace-pre-wrap break-words outline-none min-h-[24px] max-h-[120px] m-0 p-0 border-0 block ${
              isInputOverflowing ? 'overflow-y-auto' : 'overflow-hidden'
            } ${isFieldLocked ? 'cursor-not-allowed select-none' : 'select-text cursor-text'}`}
          />
        </div>
      </ChatInputDock>

      <ContextMenu
        isOpen={!!contextMenu}
        x={contextMenu?.x ?? 0}
        y={contextMenu?.y ?? 0}
        onClose={() => setContextMenu(null)}
        items={contextMenuItems}
      />
    </>
  );
};
