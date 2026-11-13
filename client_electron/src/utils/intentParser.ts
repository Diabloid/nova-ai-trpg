import type { IntentItem } from '../types/api';

const ACTION_REGEX = /(?<!\\)\*\*(?![\u200B])(.*?)(?<!\\)\*\*/g;
const THOUGHT_REGEX = /(?<!\\)\"(?![\u200B])(.*?)(?<!\\)\"/g;
const OOC_REGEX = /(?<!\\)\((?![\u200B])(.*?)(?<!\\)\)/g;
const SPEECH_REGEX = /(?<!\\)[\-\u2013\u2014](?![\u200B])(.*)$/gm;

/**
 * Парсер намірів гравця (конвенція Default Action v1.5.2)
 */
export function parseIntents(rawAction: string): IntentItem[] {
  const intents: IntentItem[] = [];
  if (!rawAction || !rawAction.trim()) {
    return intents;
  }

  let match: RegExpExecArray | null;

  // 1. Дії (**Дія**)
  while ((match = ACTION_REGEX.exec(rawAction)) !== null) {
    intents.push({ type: 'action', content: match[1].trim() });
  }

  // 2. Думки ("Думка")
  while ((match = THOUGHT_REGEX.exec(rawAction)) !== null) {
    intents.push({ type: 'thought', content: match[1].trim() });
  }

  // 3. Позагровий коментар ((OOC))
  while ((match = OOC_REGEX.exec(rawAction)) !== null) {
    intents.push({ type: 'ooc', content: match[1].trim() });
  }

  // 4. Пряма мова (- Репліка)
  while ((match = SPEECH_REGEX.exec(rawAction)) !== null) {
    intents.push({ type: 'speech', content: match[1].trim() });
  }

  // 5. Default Action: якщо гравець не ввів жодного спецсимволу,
  // автоматично вважаємо весь текст дією (голос або швидкий ввід без обов'язкових **)
  if (intents.length === 0 && rawAction.trim()) {
    intents.push({ type: 'action', content: rawAction.trim() });
  }

  return intents;
}

/**
 * Очищення тексту гравця для відображення у списку повідомлень
 */
export function cleanDisplayAction(rawAction: string): string {
  if (!rawAction) return '';

  return rawAction
    .replace(/\*\*/g, '')
    .replace(/\\"/g, '"')
    .replace(/\\\(/g, '(')
    .replace(/\\\)/g, ')')
    .replace(/\\-/g, '-')
    .replace(/\u200B/g, '')
    .trim();
}
