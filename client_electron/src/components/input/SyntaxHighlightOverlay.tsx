import React, { useMemo } from 'react';
import {
  NOVA_SYNTAX_CLASSES,
  tokenizeNovaSyntax,
} from '../../utils/novaSyntax';

interface SyntaxHighlightOverlayProps {
  text: string;
  scrollTop: number;
  className?: string;
}

/**
 * Легкий read-only компонент підсвітки синтаксису на базі єдиного парсера `novaSyntax.ts`.
 */
export const SyntaxHighlightOverlay: React.FC<SyntaxHighlightOverlayProps> = ({
  text,
  scrollTop,
  className = '',
}) => {
  const tokens = useMemo(() => tokenizeNovaSyntax(text), [text]);
  const endsWithNewline = text.endsWith('\n');

  return (
    <div
      aria-hidden="true"
      className={`pointer-events-none select-none overflow-hidden whitespace-pre-wrap break-words ${className}`}
    >
      <div
        className="w-full"
        style={{ transform: `translateY(${-scrollTop}px)` }}
      >
        {tokens.map((token, idx) =>
          token.type === 'normal' ? (
            <span key={idx}>{token.text}</span>
          ) : (
            <span key={idx} className={NOVA_SYNTAX_CLASSES[token.type]}>
              {token.text}
            </span>
          )
        )}
        {endsWithNewline ? '\u00A0' : null}
      </div>
    </div>
  );
};
