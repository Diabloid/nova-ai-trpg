import React, { useMemo } from 'react';

interface SyntaxToken {
  type: 'normal' | 'action' | 'thought' | 'speech' | 'ooc';
  text: string;
}

type SyntaxMode = 'action' | 'thought' | 'ooc';

/**
 * Токенізатор живої підсвітки синтаксису:
 * - **дія** -> #EAB308 (жирний, з підтримкою вкладених "думок" та (OOC))
 * - "думка" -> #60A5FA (курсив, з підтримкою вкладених **дій** та (OOC))
 * - - репліка -> #4ADE80 (зелений до кінця рядка)
 * - (OOC) -> #9CA3AF (сірий)
 */
function tokenizeNovaSyntax(text: string): SyntaxToken[] {
  if (!text) return [];

  const tokens: SyntaxToken[] = [];
  const stack: SyntaxMode[] = [];

  let currentType: SyntaxToken['type'] = 'normal';
  let buffer = '';
  let i = 0;

  const flush = (nextType: SyntaxToken['type']) => {
    if (buffer.length > 0) {
      tokens.push({ type: currentType, text: buffer });
      buffer = '';
    }
    currentType = nextType;
  };

  const getActiveType = (): SyntaxToken['type'] =>
    stack.length > 0 ? stack[stack.length - 1] : 'normal';

  while (i < text.length) {
    // Екрановані символи (\*, \", \(, \-)
    if (text[i] === '\\' && i + 1 < text.length) {
      buffer += text.slice(i, i + 2);
      i += 2;
      continue;
    }

    const activeMode = stack.length > 0 ? stack[stack.length - 1] : null;

    if (activeMode === 'ooc') {
      if (text[i] === ')') {
        buffer += ')';
        stack.pop();
        flush(getActiveType());
        i += 1;
        continue;
      }
      buffer += text[i];
      i += 1;
      continue;
    }

    if (activeMode === 'action') {
      if (text.startsWith('**', i)) {
        buffer += '**';
        stack.pop();
        flush(getActiveType());
        i += 2;
        continue;
      }
      if (text[i] === '"' && text[i + 1] !== '\u200B') {
        flush('thought');
        stack.push('thought');
        buffer += '"';
        i += 1;
        continue;
      }
      if (text[i] === '(' && text[i + 1] !== '\u200B') {
        flush('ooc');
        stack.push('ooc');
        buffer += '(';
        i += 1;
        continue;
      }
      buffer += text[i];
      i += 1;
      continue;
    }

    if (activeMode === 'thought') {
      if (text[i] === '"') {
        buffer += '"';
        stack.pop();
        flush(getActiveType());
        i += 1;
        continue;
      }
      if (text.startsWith('**', i) && text[i + 2] !== '\u200B') {
        flush('action');
        stack.push('action');
        buffer += '**';
        i += 2;
        continue;
      }
      if (text[i] === '(' && text[i + 1] !== '\u200B') {
        flush('ooc');
        stack.push('ooc');
        buffer += '(';
        i += 1;
        continue;
      }
      buffer += text[i];
      i += 1;
      continue;
    }

    // Верхній рівень ('normal')
    if (i === 0 || text[i - 1] === '\n') {
      const speechMatch = /^[ \t]*[-\u2013\u2014](?!\u200B)[^\n]*/.exec(text.slice(i));
      if (speechMatch) {
        flush('speech');
        tokens.push({ type: 'speech', text: speechMatch[0] });
        currentType = 'normal';
        i += speechMatch[0].length;
        continue;
      }
    }

    if (text.startsWith('**', i) && text[i + 2] !== '\u200B') {
      flush('action');
      stack.push('action');
      buffer += '**';
      i += 2;
      continue;
    }

    if (text[i] === '"' && text[i + 1] !== '\u200B') {
      flush('thought');
      stack.push('thought');
      buffer += '"';
      i += 1;
      continue;
    }

    if (text[i] === '(' && text[i + 1] !== '\u200B') {
      flush('ooc');
      stack.push('ooc');
      buffer += '(';
      i += 1;
      continue;
    }

    buffer += text[i];
    i += 1;
  }

  flush('normal');
  return tokens;
}

const TOKEN_CLASSES: Record<SyntaxToken['type'], string> = {
  normal: 'text-[#E5E7EB]',
  // Використовуємо text-shadow та чистий колір без italic/font-bold, щоб зберегти 1-в-1 ширину гліфів Segoe UI без зсуву каретки
  action: 'text-[#EAB308] [text-shadow:0.45px_0_0_currentColor]',
  thought: 'text-[#60A5FA]',
  speech: 'text-[#4ADE80]',
  ooc: 'text-[#9CA3AF]',
};

interface SyntaxHighlightOverlayProps {
  text: string;
  overlayRef: React.RefObject<HTMLDivElement | null>;
  isOverflowing?: boolean;
}

export const SyntaxHighlightOverlay: React.FC<SyntaxHighlightOverlayProps> = ({
  text,
  overlayRef,
  isOverflowing = false,
}) => {
  const tokens = useMemo(() => tokenizeNovaSyntax(text), [text]);

  return (
    <div
      ref={overlayRef}
      aria-hidden="true"
      className={`pointer-events-none select-none absolute inset-0 whitespace-pre-wrap break-words text-[15px] leading-[24px] font-sans [font-kerning:none] [font-variant-ligatures:none] m-0 p-0 [&::-webkit-scrollbar-thumb]:bg-transparent [&::-webkit-scrollbar-thumb:hover]:bg-transparent ${
        isOverflowing ? 'overflow-y-auto' : 'overflow-hidden'
      }`}
    >
      {tokens.map((tok, idx) => (
        <span key={idx} className={TOKEN_CLASSES[tok.type]}>
          {tok.text}
        </span>
      ))}
      {text.endsWith('\n') ? ' ' : null}
    </div>
  );
};
