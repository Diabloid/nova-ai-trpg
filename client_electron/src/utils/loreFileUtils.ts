import type { WorldLoreDraftItem } from '../types/api';

export const MAX_LORE_FILE_BYTES = 512 * 1024;
const ALLOWED_EXTENSIONS = ['.md', '.txt'];

export interface ReadLoreFileResult {
  filename: string;
  title: string;
  content: string;
  sizeBytes: number;
  encoding: 'utf-8' | 'windows-1251';
}

/**
 * Перетворює довільне ім'я файлу на безпечний ASCII-іменник із розширенням `.md` або `.txt`.
 */
export function sanitizeLoreFilename(rawName: string, fallbackExt: '.md' | '.txt' = '.md'): string {
  const trimmed = rawName.trim();
  const extMatch = trimmed.match(/\.(md|txt)$/i);
  const ext = extMatch ? `.${extMatch[1].toLowerCase()}` : fallbackExt;
  const stem = extMatch ? trimmed.slice(0, -extMatch[0].length) : trimmed;

  const translitMap: Record<string, string> = {
    а: 'a', б: 'b', в: 'v', г: 'h', ґ: 'g', д: 'd', е: 'e', є: 'ye', ж: 'zh',
    з: 'z', и: 'y', і: 'i', ї: 'yi', й: 'y', к: 'k', л: 'l', м: 'm', н: 'n',
    о: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f', х: 'kh', ц: 'ts',
    ч: 'ch', ш: 'sh', щ: 'shch', ь: '', ю: 'yu', я: 'ya', ё: 'yo', э: 'e', ы: 'y', ъ: '',
  };

  const slug = stem
    .toLowerCase()
    .split('')
    .map((ch) => translitMap[ch] ?? ch)
    .join('')
    .replace(/[^a-z0-9_-]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 64);

  return `${slug || 'lore_article'}${ext}`;
}

function extractTitleFromContent(content: string, filename: string): string {
  const headingMatch = content.match(/^\s*#\s+(.+)$/m);
  if (headingMatch && headingMatch[1].trim()) {
    return headingMatch[1].trim();
  }
  return filename.replace(/\.(md|txt)$/i, '').replace(/[_-]+/g, ' ').trim() || 'Нова стаття';
}

/**
 * Читає локальний `.md` / `.txt` файл з перевіркою ліміту 512 КБ та автофолбеком на `windows-1251`,
 * якщо файл не є валідним UTF-8 (характерно для текстових файлів із Windows).
 */
export async function readLoreFileWithEncoding(file: File): Promise<ReadLoreFileResult> {
  const lowerName = file.name.toLowerCase();
  const hasAllowedExt = ALLOWED_EXTENSIONS.some((ext) => lowerName.endsWith(ext));
  if (!hasAllowedExt) {
    throw new Error('Підтримуються лише текстові файли з розширенням .md або .txt.');
  }

  if (file.size > MAX_LORE_FILE_BYTES) {
    throw new Error(`Файл «${file.name}» перевищує максимальний ліміт 512 КБ.`);
  }

  const buffer = await file.arrayBuffer();
  let encoding: 'utf-8' | 'windows-1251' = 'utf-8';
  let rawText: string;

  try {
    rawText = new TextDecoder('utf-8', { fatal: true }).decode(buffer);
  } catch {
    encoding = 'windows-1251';
    rawText = new TextDecoder('windows-1251').decode(buffer);
  }

  const normalized = rawText
    .replace(/^\uFEFF/, '')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n');

  const filename = sanitizeLoreFilename(file.name, lowerName.endsWith('.txt') ? '.txt' : '.md');
  const title = extractTitleFromContent(normalized, file.name);
  const utf8Bytes = new TextEncoder().encode(normalized).byteLength;

  return {
    filename,
    title,
    content: normalized,
    sizeBytes: utf8Bytes,
    encoding,
  };
}

/**
 * Підраховує сумарний обсяг статей лору в байтах, кілобайтах та орієнтовних токенах.
 */
export function estimateLoreStats(articles: WorldLoreDraftItem[]): {
  totalBytes: number;
  totalKb: number;
  estTokens: number;
} {
  const encoder = new TextEncoder();
  let totalBytes = 0;
  let totalChars = 0;

  for (const article of articles) {
    const text = article.content || '';
    totalBytes += encoder.encode(text).byteLength;
    totalChars += text.length;
  }

  return {
    totalBytes,
    totalKb: totalBytes / 1024,
    estTokens: Math.ceil(totalChars / 3.5),
  };
}
