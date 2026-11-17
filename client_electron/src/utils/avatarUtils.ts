const ALLOWED_AVATAR_EXTENSIONS = /\.(png|jpe?g|webp)$/i;
const ALLOWED_AVATAR_MIME_TYPES = new Set([
  'image/png',
  'image/jpeg',
  'image/jpg',
  'image/webp',
]);

function loadImageElement(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Не вдалося декодувати зображення'));
    img.src = src;
  });
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
  const mime = (file.type || '').toLowerCase();
  const isValidType =
    ALLOWED_AVATAR_MIME_TYPES.has(mime) || ALLOWED_AVATAR_EXTENSIONS.test(file.name || '');

  if (!isValidType) {
    throw new Error('Підтримуються лише зображення форматів PNG, JPG або WebP');
  }

  const objectUrl = URL.createObjectURL(file);
  try {
    const img = await loadImageElement(objectUrl);
    const srcW = img.naturalWidth || img.width;
    const srcH = img.naturalHeight || img.height;

    if (!srcW || !srcH) {
      throw new Error('Зображення має нульовий розмір');
    }

    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new Error('Не вдалося ініціалізувати 2D-контекст для стиснення аватара');
    }

    // Object-cover center crop по меншій стороні
    const minSide = Math.min(srcW, srcH);
    const sx = (srcW - minSide) / 2;
    const sy = (srcH - minSide) / 2;

    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, sx, sy, minSide, minSide, 0, 0, size, size);

    const webpDataUrl = canvas.toDataURL('image/webp', quality);
    if (webpDataUrl.startsWith('data:image/webp')) {
      return webpDataUrl;
    }

    return canvas.toDataURL('image/jpeg', quality);
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}
