import re
from typing import Iterable, Optional

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
