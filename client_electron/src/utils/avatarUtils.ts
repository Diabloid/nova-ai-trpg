const ALLOWED_AVATAR_EXTENSIONS = /\.(png|jpe?g|webp)$/i;
const ALLOWED_AVATAR_MIME_TYPES = new Set([
  'image/png',
  'image/jpeg',
  'image/jpg',
  'image/webp',
]);

export interface AvatarCropRegion {
  sx: number;
  sy: number;
  sSize: number;
}

export function validateAvatarFile(file: File): void {
  const mime = (file.type || '').toLowerCase();
  const isValidType =
    ALLOWED_AVATAR_MIME_TYPES.has(mime) || ALLOWED_AVATAR_EXTENSIONS.test(file.name || '');

  if (!isValidType) {
    throw new Error('Підтримуються лише зображення форматів PNG, JPG або WebP');
  }
}

export function readAvatarFileAsDataUrl(file: File): Promise<string> {
  validateAvatarFile(file);
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result);
      } else {
        reject(new Error('Не вдалося прочитати файл зображення'));
      }
    };
    reader.onerror = () => reject(new Error('Помилка читання файлу зображення'));
    reader.readAsDataURL(file);
  });
}

export function loadImageElement(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Не вдалося декодувати зображення'));
    img.src = src;
  });
}

function drawRegionToWebP(
  img: HTMLImageElement,
  region: AvatarCropRegion,
  size: number,
  quality: number
): string {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Не вдалося ініціалізувати 2D-контекст для обробки аватара');
  }

  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, region.sx, region.sy, region.sSize, region.sSize, 0, 0, size, size);

  const webpDataUrl = canvas.toDataURL('image/webp', quality);
  if (webpDataUrl.startsWith('data:image/webp')) {
    return webpDataUrl;
  }

  return canvas.toDataURL('image/jpeg', quality);
}

/**
 * Рендерить вибрану квадратну область зображення у `size × size` (256×256) WebP із fallback на JPEG.
 */
export async function renderCroppedAvatarToWebP(
  src: string,
  region: AvatarCropRegion,
  size = 256,
  quality = 0.82
): Promise<string> {
  const img = await loadImageElement(src);
  const srcW = img.naturalWidth || img.width;
  const srcH = img.naturalHeight || img.height;

  if (!srcW || !srcH) {
    throw new Error('Зображення має нульовий розмір');
  }

  return drawRegionToWebP(img, region, size, quality);
}

/**
 * Центрує й обрізає зображення по меншій стороні у квадрат `size × size` (256×256)
 * та стискає в компактний Data URI `image/webp` із fallback на `image/jpeg`.
 */
export async function compressAvatarFileToWebP(
  file: File,
  size = 256,
  quality = 0.82
): Promise<string> {
  validateAvatarFile(file);

  const objectUrl = URL.createObjectURL(file);
  try {
    const img = await loadImageElement(objectUrl);
    const srcW = img.naturalWidth || img.width;
    const srcH = img.naturalHeight || img.height;

    if (!srcW || !srcH) {
      throw new Error('Зображення має нульовий розмір');
    }

    const minSide = Math.min(srcW, srcH);
    const region: AvatarCropRegion = {
      sx: (srcW - minSide) / 2,
      sy: (srcH - minSide) / 2,
      sSize: minSide,
    };

    return drawRegionToWebP(img, region, size, quality);
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}
