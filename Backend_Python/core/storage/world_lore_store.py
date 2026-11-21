import os
import shutil
from typing import Any, Dict, List, Tuple
from fastapi import HTTPException, status

from schemas.game_dto import LoreArticleResponse, WorldLoreArticleInfo

MAX_LORE_FILE_BYTES = 512 * 1024  # 512 KB ліміт на одну статтю лору
ALLOWED_LORE_EXTS = (".md", ".txt")


def validate_lore_filename(filename: str) -> str:
    """Захист від path traversal та перевірка розширення .md/.txt."""
    if not filename or not isinstance(filename, str):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Некоректне ім'я файлу статті лору.",
        )
    cleaned = filename.strip()
    if (
        ".." in cleaned
        or "/" in cleaned
        or "\\" in cleaned
        or "\x00" in cleaned
        or cleaned.startswith(".")
    ):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Заборонені символи в імені файлу (path traversal захист).",
        )
    ext = os.path.splitext(cleaned)[1].lower()
    if ext not in ALLOWED_LORE_EXTS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Дозволені лише формати {', '.join(ALLOWED_LORE_EXTS)}.",
        )
    return cleaned


def extract_article_title(filename: str, content: str) -> str:
    """Витягує заголовок першого рівня Markdown або повертає ім'я файлу без розширення."""
    for line in content.splitlines():
        stripped = line.strip()
        if stripped.startswith("#"):
            title = stripped.lstrip("#").strip()
            if title:
                return title
    return os.path.splitext(filename)[0]


def estimate_tokens(text: str) -> int:
    """Орієнтовна оцінка кількості токенів (~4 символи на токен)."""
    if not text:
        return 0
    return max(1, len(text) // 4)


def read_text_safe(filepath: str) -> str:
    """Безпечно читає текстовий файл (UTF-8-sig з fallback на cp1251) та перевіряє розмір."""
    size = os.path.getsize(filepath)
    if size > MAX_LORE_FILE_BYTES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Файл занадто великий ({size} байт). Максимум: {MAX_LORE_FILE_BYTES} байт.",
        )
    with open(filepath, "rb") as f:
        raw = f.read()
    try:
        return raw.decode("utf-8-sig")
    except UnicodeDecodeError:
        return raw.decode("cp1251", errors="replace")


def list_lore_articles(lore_dir: str) -> Tuple[List[WorldLoreArticleInfo], int, int]:
    """Індексує статті лору в каталозі та повертає (articles, total_bytes, total_tokens)."""
    articles: List[WorldLoreArticleInfo] = []
    total_bytes = 0
    total_tokens = 0

    if not os.path.exists(lore_dir):
        return articles, total_bytes, total_tokens

    for fname in sorted(os.listdir(lore_dir)):
        if not fname.lower().endswith(ALLOWED_LORE_EXTS):
            continue
        fpath = os.path.join(lore_dir, fname)
        if not os.path.isfile(fpath):
            continue
        try:
            text = read_text_safe(fpath)
            size_b = os.path.getsize(fpath)
            tokens = estimate_tokens(text)
            articles.append(
                WorldLoreArticleInfo(
                    filename=fname,
                    title=extract_article_title(fname, text),
                    size_bytes=size_b,
                    est_tokens=tokens,
                )
            )
            total_bytes += size_b
            total_tokens += tokens
        except Exception as e:
            print(f"⚠️ [WorldLoreStore] Помилка індексації статті {fname}: {e}")

    return articles, total_bytes, total_tokens


def get_lore_article(world_id: str, lore_dir: str, filename: str) -> LoreArticleResponse:
    """Читає окрему статтю лору світу та повертає її метадані й вміст."""
    safe_name = validate_lore_filename(filename)
    fpath = os.path.join(lore_dir, safe_name)

    if not os.path.isfile(fpath):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Статтю '{safe_name}' у світі '{world_id}' не знайдено.",
        )

    content = read_text_safe(fpath)
    size_b = os.path.getsize(fpath)
    return LoreArticleResponse(
        world_id=world_id,
        filename=safe_name,
        title=extract_article_title(safe_name, content),
        content=content,
        size_bytes=size_b,
        est_tokens=estimate_tokens(content),
    )


def save_lore_article(lore_dir: str, filename: str, content: str) -> Dict[str, Any]:
    """Зберігає або оновлює файл статті лору з перевіркою ліміту розміру."""
    safe_name = validate_lore_filename(filename)
    raw_bytes = content.encode("utf-8")
    if len(raw_bytes) > MAX_LORE_FILE_BYTES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Розмір статті перевищує ліміт {MAX_LORE_FILE_BYTES} байт.",
        )

    os.makedirs(lore_dir, exist_ok=True)
    fpath = os.path.join(lore_dir, safe_name)
    with open(fpath, "wb") as f:
        f.write(raw_bytes)

    return {"status": "saved", "filename": safe_name, "size_bytes": len(raw_bytes)}


def delete_lore_article(world_id: str, lore_dir: str, filename: str) -> Dict[str, Any]:
    """Видаляє статтю лору з каталогу світу."""
    safe_name = validate_lore_filename(filename)
    fpath = os.path.join(lore_dir, safe_name)

    if not os.path.isfile(fpath):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Статтю '{safe_name}' у світі '{world_id}' не знайдено.",
        )

    os.remove(fpath)
    return {"status": "deleted", "filename": safe_name}


def copy_lore_files(src_lore_dir: str, dst_lore_dir: str) -> None:
    """Копіює всі валідні файли лору при клонуванні світу."""
    if not os.path.exists(src_lore_dir):
        return
    os.makedirs(dst_lore_dir, exist_ok=True)
    for fname in os.listdir(src_lore_dir):
        if fname.lower().endswith(ALLOWED_LORE_EXTS):
            src_file = os.path.join(src_lore_dir, fname)
            if os.path.isfile(src_file):
                shutil.copy2(src_file, os.path.join(dst_lore_dir, fname))
