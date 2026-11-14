/**
 * Сервіс очищення та відновлення тексту Оповідача.
 * Усуває розриви слів, пунктуації та речень, що можуть виникати під час генерації ШІ.
 */

// Зшивання розірваних слів ("Х\n\nолодний" -> "Холодний")
const BROKEN_WORD_REGEX = /(?<=\p{L})\n+(?=\p{Ll})/gu;

// Зшивання відірваної пунктуації ("наверші\n\n." -> "наверші.")
const BROKEN_PUNCTUATION_REGEX = /(?<=\S)\n+(?=[.,!?:;])/g;

// Зшивання розірваних речень
const BROKEN_SENTENCE_REGEX = /\s*\n+\s*(?=\p{Ll})/gu;

// Збереження справжніх абзаців (2+ нових рядків)
const PARAGRAPH_REGEX = /\n{2,}/g;

export function sanitizeStory(rawStory: string): string {
  if (!rawStory) return '';

  // 1. Уніфікуємо переноси рядків
  let cleanStory = rawStory.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

  // 2. Зшиваємо розірвані слова
  cleanStory = cleanStory.replace(BROKEN_WORD_REGEX, '');

  // 3. Зшиваємо відірвану пунктуацію
  cleanStory = cleanStory.replace(BROKEN_PUNCTUATION_REGEX, '');

  // 4. Зшиваємо розірвані речення
  cleanStory = cleanStory.replace(BROKEN_SENTENCE_REGEX, ' ');

  // 5. Зберігаємо справжні абзаци (2+ нових рядків)
  cleanStory = cleanStory.replace(PARAGRAPH_REGEX, '◄PARAGRAPH►');

  // 6. Будь-які залишкові одинарні переноси міняємо на пробіл
  cleanStory = cleanStory.replace(/\n/g, ' ');

  // 7. Повертаємо абзаци
  cleanStory = cleanStory.replace(/◄PARAGRAPH►/g, '\n\n');

  return cleanStory.trim();
}
