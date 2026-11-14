export type NovaTokenType = 'normal' | 'action' | 'thought' | 'speech' | 'ooc';

export interface NovaToken {
  type: NovaTokenType;
  text: string;
  start: number;
  end: number;
  isSuppressed?: boolean;
}

export interface NovaSpan {
  kind: Exclude<NovaTokenType, 'normal'>;
  /** Повний початок конструкції включно з відкриваючим маркером */
  start: number;
  /** Повний кінець конструкції включно із закриваючим маркером */
  end: number;
  /** Індекс одразу після відкриваючого маркера */
  openEnd: number;
  /** Індекс початку закриваючого маркера (для speech дорівнює end) */
  closeStart: number;
}

export interface SyntaxSelectionRange {
  start: number;
  end: number;
}

/**
 * Єдині CSS-класи підсвітки синтаксису (1-в-1 із SyntaxHelpTooltip).
 * Для thought використовується клас `.nova-thought-italic` (synthetic oblique
 * на базі звичайних гліфів без підміни форми кириличних букв).
 */
export const NOVA_SYNTAX_CLASSES: Record<NovaTokenType, string> = {
  normal: '',
  action: 'font-bold text-[#EAB308]',
  thought: 'nova-thought-italic text-[#60A5FA]',
  speech: 'text-[#4ADE80] font-medium',
  ooc: 'text-[#9CA3AF]',
};
