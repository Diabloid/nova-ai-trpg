import re
from typing import Any, Dict, Iterable, Optional
from fastapi import HTTPException, status

MAX_AVATAR_DATA_URI_CHARS = 512 * 1024  # ~512 КБ ліміт для Data URI аватара
STRICT_ASCII_ID_RE = re.compile(r"^[a-z0-9_-]+$")
HEX_COLOR_RE = re.compile(r"^#[0-9A-Fa-f]{6}$")


def validate_hex_color(color: Optional[str], fallback: str = "#38BDF8") -> str:
    """Перевіряє та нормалізує HEX-колір (#RRGGBB)."""
    if isinstance(color, str):
        trimmed = color.strip()
        if HEX_COLOR_RE.fullmatch(trimmed):
            return trimmed.upper()
    return fallback

# Таблиця транслітерації української та російської кирилиці в ASCII
CYRILLIC_TO_ASCII = {
    "а": "a", "б": "b", "в": "v", "г": "h", "ґ": "g",
    "д": "d", "е": "e", "є": "ye", "ж": "zh", "з": "z",
    "и": "y", "і": "i", "ї": "yi", "й": "y", "к": "k",
    "л": "l", "м": "m", "н": "n", "о": "o", "п": "p",
    "р": "r", "с": "s", "т": "t", "у": "u", "ф": "f",
    "х": "kh", "ц": "ts", "ч": "ch", "ш": "sh", "щ": "shch",
    "ь": "", "ю": "yu", "я": "ya",
    "ё": "yo", "ы": "y", "э": "e", "ъ": "",
    "'": "", "’": "", "`": "",
}

# Мапінг типових Unicode-емодзі на ключі векторних іконок lucide-react
EMOJI_TO_LUCIDE = {
    "🌙": "moon",
    "🌑": "moon",
    "🤖": "cpu",
    "🦾": "cpu",
    "⚔️": "swords",
    "⚔": "swords",
    "🗡️": "sword",
    "🛡️": "shield",
    "🛡": "shield",
    "⚡": "zap",
    "✨": "sparkles",
    "📜": "scroll-text",
    "📖": "book-open",
    "🎒": "backpack",
    "❤️": "heart-pulse",
    "❤": "heart-pulse",
    "💀": "skull",
    "🏛️": "landmark",
    "🏛": "landmark",
    "🌍": "globe",
    "🌎": "globe",
    "🌏": "globe",
    "🔥": "flame",
    "🚀": "rocket",
    "🔍": "search",
    "🕵️": "search",
    "👤": "user",
    "🧙": "wand-sparkles",
}


def slugify_ascii(text: str, default: str = "item", max_length: int = 64) -> str:
    """
    Транслітерує кирилицю (укр/рос) та санітизує рядок до строгого ASCII (a-z0-9_).
    """
    if not text:
        return default

    lowered = text.strip().lower()
    transliterated_chars = []
    for ch in lowered:
        if ch in CYRILLIC_TO_ASCII:
            transliterated_chars.append(CYRILLIC_TO_ASCII[ch])
        else:
            transliterated_chars.append(ch)

    joined = "".join(transliterated_chars)
    # Усі не-ASCII або спецсимволи замінюємо на підкреслення
    slug = re.sub(r"[^a-z0-9]+", "_", joined)
    slug = re.sub(r"_+", "_", slug).strip("_")

    if max_length > 0 and len(slug) > max_length:
        slug = slug[:max_length].rstrip("_")

    return slug or default


def ensure_unique_slug(base_slug: str, existing_ids: Iterable[str]) -> str:
    """
    Гарантує унікальність ідентифікатора серед existing_ids,
    додаючи суфікси _2, _3, ... при колізії.
    """
    existing_set = {str(item).lower() for item in existing_ids}
    if base_slug.lower() not in existing_set:
        return base_slug

    counter = 2
    while f"{base_slug}_{counter}".lower() in existing_set:
        counter += 1
    return f"{base_slug}_{counter}"


def sanitize_icon_key(icon: Optional[str], default: str = "globe") -> str:
    """
    Перетворює іконку на валідний ключ lucide-react (лише a-z0-9-).
    Якщо передано Unicode-емодзі — мапить на відомий ключ або повертає default.
    """
    if not icon:
        return default

    raw = icon.strip()
    if raw in EMOJI_TO_LUCIDE:
        return EMOJI_TO_LUCIDE[raw]

    # Перевіряємо, чи це вже валідний Lucide-ключ (напр. 'scroll-text', 'heart-pulse')
    normalized = raw.lower().replace("_", "-")
    if re.fullmatch(r"[a-z0-9]+(?:-[a-z0-9]+)*", normalized):
        return normalized

    return default


def validate_and_normalize_meta_avatar(meta: Dict[str, Any]) -> None:
    """
    Sanity-валідація поля meta.avatar:
    - видаляє ключ avatar, якщо значення порожнє ("") або None;
    - відхиляє завеликі data:image/... (>512 КБ) з HTTP 400.
    """
    if not isinstance(meta, dict) or "avatar" not in meta:
        return

    val = meta.get("avatar")
    if val is None or (isinstance(val, str) and not val.strip()):
        meta.pop("avatar", None)
        return

    if isinstance(val, str):
        cleaned = val.strip()
        if cleaned.startswith("data:image/") and len(cleaned) > MAX_AVATAR_DATA_URI_CHARS:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=(
                    f"Розмір аватара перевищує ліміт ({MAX_AVATAR_DATA_URI_CHARS // 1024} КБ). "
                    "Стисніть зображення (наприклад, 256x256 WebP) перед збереженням."
                ),
            )
        meta["avatar"] = cleaned


def is_strict_ascii_id(value: Optional[str]) -> bool:
    """Перевіряє, чи ідентифікатор складається виключно зі строгого ASCII [a-z0-9_-]+."""
    if not value or not isinstance(value, str):
        return False
    return bool(STRICT_ASCII_ID_RE.fullmatch(value))


def sanitize_strict_ascii_id(raw_id: Optional[str], default: str = "item", max_length: int = 64) -> str:
    """
    Нормалізує ідентифікатор до строгого ASCII [a-z0-9_-]+.
    Уже валідні ASCII-ідентифікатори (у т.ч. з дефісами та провідним '_') зберігаються без спотворень.
    """
    normalized = (raw_id or "").strip().lower()
    if STRICT_ASCII_ID_RE.fullmatch(normalized):
        return normalized
    return slugify_ascii(normalized, default=default, max_length=max_length)


def merge_legacy_background_into_biography(meta: Dict[str, Any]) -> bool:
    """
    Переносить застаріле поле meta.background у meta.biography і видаляє ключ background.
    Повертає True, якщо словник meta було змінено.
    """
    if not isinstance(meta, dict) or "background" not in meta:
        return False

    raw_bg = meta.pop("background", None)
    bg_clean = str(raw_bg).strip() if raw_bg is not None else ""
    if not bg_clean:
        return True

    raw_bio = meta.get("biography")
    bio_clean = str(raw_bio).strip() if raw_bio is not None else ""
    if not bio_clean:
        meta["biography"] = bg_clean
    elif bg_clean.lower() in bio_clean.lower():
        meta["biography"] = bio_clean
    elif bio_clean.lower() in bg_clean.lower():
        meta["biography"] = bg_clean
    else:
        meta["biography"] = f"{bg_clean}\n\n{bio_clean}"
    return True
