import copy
import json
import os
import re
import shutil
import sys
from datetime import datetime, timezone
from functools import lru_cache
from typing import Any, Dict, List, Optional, Tuple, TYPE_CHECKING
from fastapi import HTTPException, status

# Безпечне кодування консолі для Windows
if sys.stdout and hasattr(sys.stdout, "reconfigure"):
    try:
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass

from core import world_lore_store, world_migration
from core.slugify import (
    ensure_unique_slug,
    is_strict_ascii_id,
    sanitize_icon_key,
    slugify_ascii,
)
from core.world_lore_store import ALLOWED_LORE_EXTS, MAX_LORE_FILE_BYTES

if TYPE_CHECKING:
    from core.services.template_validator import TemplateValidator
from schemas.game_dto import (
    LoreArticleResponse,
    WorldAiPrompts,
    WorldCloneRequest,
    WorldCreateRequest,
    WorldDeleteConflict,
    WorldDetailResponse,
    WorldLoreArticleInfo,
    WorldSummary,
    WorldUpdateRequest,
)

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
WORLDS_DIR = os.path.join(BASE_DIR, "data", "worlds")
CHARACTERS_DIR = os.path.join(BASE_DIR, "data", "characters")
SAVES_DIR = os.path.join(BASE_DIR, "data", "saves")
DEFAULTS_DIR = os.path.join(BASE_DIR, "data", "defaults")

DEFAULT_WORLD_ID = "default_dark_fantasy"


class WorldDeleteConflictError(Exception):
    """Доменна помилка конфлікту видалення світу (HTTP 409 з плоским WorldDeleteConflict)."""

    def __init__(self, conflict: WorldDeleteConflict):
        self.conflict = conflict
        super().__init__(conflict.detail)


@lru_cache(maxsize=4)
def _load_default_json(filename: str) -> Dict[str, Any]:
    path = os.path.join(DEFAULTS_DIR, filename)
    with open(path, "r", encoding="utf-8") as f:
        data = json.load(f)
    if not isinstance(data, dict):
        raise ValueError(f"Дефолтний файл {path} має містити JSON-об'єкт.")
    return data


def _default_dark_fantasy_schema_meta() -> Dict[str, Any]:
    """Повертає копію _schema_meta стандартного шаблону Крэтэрлсокії (виключно Lucide-ключі)."""
    return copy.deepcopy(_load_default_json("default_dark_fantasy_schema_meta.json"))


def _default_dark_fantasy_passport(now_iso: str) -> Dict[str, Any]:
    """Формує копію паспорта базового світу Крэтэрлсокії з актуальними мітками часу."""
    passport = copy.deepcopy(_load_default_json("default_dark_fantasy_passport.json"))
    passport["created_at"] = now_iso
    passport["updated_at"] = now_iso
    return passport


class WorldManager:
    """
    Керує пакетами світів у data/worlds/{world_id}/:
    - world.json (паспорт світу + ai_prompts)
    - character_template.json (шаблон персонажа зі схемою _schema_meta)
    - lore/ (статті лору .md / .txt)
    Координує CRUD світів, клонування, захищене видалення, делегує міграцію та лор спеціалізованим модулям.
    """

    def __init__(
        self,
        worlds_dir: Optional[str] = None,
        characters_dir: Optional[str] = None,
        saves_dir: Optional[str] = None,
        template_validator: Optional["TemplateValidator"] = None,
    ):
        self.worlds_dir = worlds_dir or WORLDS_DIR
        self.characters_dir = characters_dir or CHARACTERS_DIR
        self.saves_dir = saves_dir or SAVES_DIR
        if template_validator is None:
            from core.services.template_validator import TemplateValidator
            self.template_validator = TemplateValidator()
        else:
            self.template_validator = template_validator
        os.makedirs(self.worlds_dir, exist_ok=True)

    def _sanitize_world_id_for_lookup(self, world_id: Optional[str]) -> str:
        if world_id is None or not str(world_id).strip():
            return DEFAULT_WORLD_ID
        normalized = str(world_id).strip().lower()
        if is_strict_ascii_id(normalized):
            return normalized
        clean = re.sub(r"[^a-z0-9_-]+", "", normalized)
        return clean or "__invalid_world_id__"

    def get_world_dir(self, world_id: str) -> str:
        clean_id = self._sanitize_world_id_for_lookup(world_id)
        return os.path.join(self.worlds_dir, clean_id)

    def world_exists(self, world_id: str) -> bool:
        w_dir = self.get_world_dir(world_id)
        return os.path.isfile(os.path.join(w_dir, "world.json"))

    def _require_world_dir(self, world_id: str) -> Tuple[str, str]:
        clean_id = self._sanitize_world_id_for_lookup(world_id)
        w_dir = os.path.join(self.worlds_dir, clean_id)
        if not os.path.isfile(os.path.join(w_dir, "world.json")):
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Світ '{world_id}' не знайдено.",
            )
        return clean_id, w_dir

    def _list_existing_world_ids(self) -> List[str]:
        if not os.path.exists(self.worlds_dir):
            return []
        ids: List[str] = []
        for entry in os.listdir(self.worlds_dir):
            w_dir = os.path.join(self.worlds_dir, entry)
            if os.path.isdir(w_dir) and os.path.isfile(os.path.join(w_dir, "world.json")):
                ids.append(entry)
        return ids

    def _read_json(self, path: str) -> Dict[str, Any]:
        with open(path, "r", encoding="utf-8") as f:
            return json.load(f)

    def _write_json(self, path: str, data: Dict[str, Any]) -> None:
        with open(path, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=4)

    def _read_text_safe(self, filepath: str) -> str:
        return world_lore_store.read_text_safe(filepath)

    def _validate_lore_filename(self, filename: str) -> str:
        return world_lore_store.validate_lore_filename(filename)

    def _extract_article_title(self, filename: str, content: str) -> str:
        return world_lore_store.extract_article_title(filename, content)

    def _estimate_tokens(self, text: str) -> int:
        return world_lore_store.estimate_tokens(text)

    def _count_characters_by_world(self, character_manager=None) -> Dict[str, int]:
        counts: Dict[str, int] = {}
        char_dir = getattr(character_manager, "characters_dir", None) or self.characters_dir
        if not os.path.exists(char_dir):
            return counts

        for filename in os.listdir(char_dir):
            if filename.endswith(".json") and not filename.startswith("_"):
                filepath = os.path.join(char_dir, filename)
                try:
                    data = self._read_json(filepath)
                    w_id = data.get("meta", {}).get("world_id") or DEFAULT_WORLD_ID
                    counts[w_id] = counts.get(w_id, 0) + 1
                except Exception:
                    continue
        return counts

    def _migrate_legacy_characters(self) -> Tuple[Dict[str, str], Dict[str, str]]:
        return world_migration.migrate_legacy_characters(
            characters_dir=self.characters_dir,
            default_world_id=DEFAULT_WORLD_ID,
        )

    def _migrate_legacy_campaigns(
        self,
        char_worlds: Dict[str, str],
        char_id_map: Dict[str, str],
    ) -> None:
        world_migration.migrate_legacy_campaigns(
            saves_dir=self.saves_dir,
            char_worlds=char_worlds,
            char_id_map=char_id_map,
            default_world_id=DEFAULT_WORLD_ID,
        )

    def migrate_if_needed(self) -> None:
        """Делегує ідемпотентну авто-ініціалізацію базового світу та legacy-міграцію."""
        world_migration.migrate_if_needed(
            worlds_dir=self.worlds_dir,
            characters_dir=self.characters_dir,
            saves_dir=self.saves_dir,
            template_validator=self.template_validator,
            default_world_id=DEFAULT_WORLD_ID,
            passport_factory=_default_dark_fantasy_passport,
            schema_meta_factory=_default_dark_fantasy_schema_meta,
        )

    def get_world_passport(self, world_id: str) -> Dict[str, Any]:
        _, w_dir = self._require_world_dir(world_id)
        return self._read_json(os.path.join(w_dir, "world.json"))

    def get_world_template(self, world_id: str) -> Dict[str, Any]:
        _, w_dir = self._require_world_dir(world_id)
        tpl_path = os.path.join(w_dir, "character_template.json")
        if os.path.isfile(tpl_path):
            return self._read_json(tpl_path)
        return {}

    def get_world_lore_dir(self, world_id: str) -> str:
        _, w_dir = self._require_world_dir(world_id)
        return os.path.join(w_dir, "lore")

    def list_worlds(self, character_manager=None) -> List[WorldSummary]:
        """Повертає список усіх світів із підрахунком персонажів та is_default."""
        if not os.path.exists(self.worlds_dir):
            return []

        counts = self._count_characters_by_world(character_manager)
        worlds: List[WorldSummary] = []

        for entry in sorted(os.listdir(self.worlds_dir)):
            w_dir = os.path.join(self.worlds_dir, entry)
            world_json_path = os.path.join(w_dir, "world.json")
            if not (os.path.isdir(w_dir) and os.path.isfile(world_json_path)):
                continue

            try:
                data = self._read_json(world_json_path)
                w_id = data.get("world_id") or entry
                mtime = os.path.getmtime(world_json_path)
                iso_fallback = datetime.fromtimestamp(mtime, tz=timezone.utc).isoformat()
                worlds.append(
                    WorldSummary(
                        world_id=w_id,
                        title=data.get("title") or w_id,
                        genre=data.get("genre") or "Фентезі",
                        description=data.get("description") or "",
                        icon=sanitize_icon_key(data.get("icon"), default="moon" if w_id == DEFAULT_WORLD_ID else "globe"),
                        accent_color=data.get("accent_color") or "#7E0018",
                        character_count=counts.get(w_id, 0),
                        is_default=(w_id == DEFAULT_WORLD_ID),
                        created_at=data.get("created_at") or iso_fallback,
                        updated_at=data.get("updated_at") or iso_fallback,
                    )
                )
            except Exception as e:
                print(f"⚠️ [WorldManager] Помилка читання світу {entry}: {e}")

        # Базовий світ завжди перший, далі за назвою
        worlds.sort(key=lambda w: (not w.is_default, w.title.lower()))
        return worlds

    def get_world_detail(self, world_id: str, character_manager=None) -> WorldDetailResponse:
        """Повертає повні деталі світу: паспорт, ai_prompts, шаблон та список статей лору."""
        clean_id, w_dir = self._require_world_dir(world_id)
        data = self._read_json(os.path.join(w_dir, "world.json"))
        tpl = self.get_world_template(clean_id)
        counts = self._count_characters_by_world(character_manager)

        lore_dir = os.path.join(w_dir, "lore")
        articles, total_bytes, total_tokens = world_lore_store.list_lore_articles(lore_dir)

        mtime = os.path.getmtime(os.path.join(w_dir, "world.json"))
        iso_fallback = datetime.fromtimestamp(mtime, tz=timezone.utc).isoformat()

        return WorldDetailResponse(
            world_id=clean_id,
            title=data.get("title") or clean_id,
            genre=data.get("genre") or "Фентезі",
            description=data.get("description") or "",
            author=data.get("author") or "System",
            icon=sanitize_icon_key(data.get("icon"), default="moon" if clean_id == DEFAULT_WORLD_ID else "globe"),
            accent_color=data.get("accent_color") or "#7E0018",
            character_count=counts.get(clean_id, 0),
            is_default=(clean_id == DEFAULT_WORLD_ID),
            created_at=data.get("created_at") or iso_fallback,
            updated_at=data.get("updated_at") or iso_fallback,
            starting_locations=data.get("starting_locations") or [],
            ai_prompts=WorldAiPrompts.model_validate(data.get("ai_prompts") or {}),
            character_template=tpl,
            lore_articles=articles,
            total_lore_bytes=total_bytes,
            total_lore_tokens=total_tokens,
        )

    def create_world(self, request: WorldCreateRequest) -> WorldSummary:
        """Створює новий пакет світу з гарантовано унікальним ASCII world_id."""
        existing_ids = self._list_existing_world_ids()
        raw_slug_source = request.world_id or request.title
        base_slug = slugify_ascii(raw_slug_source, default="world")
        world_id = ensure_unique_slug(base_slug, existing_ids)

        w_dir = os.path.join(self.worlds_dir, world_id)
        lore_dir = os.path.join(w_dir, "lore")
        os.makedirs(lore_dir, exist_ok=True)

        now_iso = datetime.now(timezone.utc).isoformat()
        icon_key = sanitize_icon_key(request.icon, default="globe")
        accent_hex = self.template_validator.validate_hex_color(request.accent_color, fallback="#38BDF8")

        passport = {
            "world_id": world_id,
            "title": request.title.strip(),
            "genre": request.genre.strip() if request.genre else "Фентезі",
            "description": request.description or "",
            "author": request.author or "User",
            "icon": icon_key,
            "accent_color": accent_hex,
            "starting_locations": request.starting_locations or [],
            "ai_prompts": request.ai_prompts.model_dump(),
            "created_at": now_iso,
            "updated_at": now_iso,
        }
        self._write_json(os.path.join(w_dir, "world.json"), passport)

        default_loc = request.starting_locations[0] if request.starting_locations else "Стартова локація"
        if request.character_template is not None:
            tpl_data = self.template_validator.validate_and_normalize(
                request.character_template,
                world_id=world_id,
                default_location=default_loc,
            )
        else:
            tpl_data = self.template_validator.validate_and_normalize(
                {
                    "meta": {"name": "", "world_id": world_id, "location": default_loc},
                    "_schema_meta": _default_dark_fantasy_schema_meta(),
                },
                world_id=world_id,
                default_location=default_loc,
            )
        self._write_json(os.path.join(w_dir, "character_template.json"), tpl_data)

        return WorldSummary(
            world_id=world_id,
            title=passport["title"],
            genre=passport["genre"],
            description=passport["description"],
            icon=icon_key,
            accent_color=passport["accent_color"],
            character_count=0,
            is_default=False,
            created_at=now_iso,
            updated_at=now_iso,
        )

    def update_world(self, world_id: str, request: WorldUpdateRequest) -> WorldDetailResponse:
        """Оновлює паспорт, промпти або шаблон існуючого світу."""
        clean_id, w_dir = self._require_world_dir(world_id)
        world_json_path = os.path.join(w_dir, "world.json")
        passport = self._read_json(world_json_path)

        if request.title is not None:
            passport["title"] = request.title.strip()
        if request.genre is not None:
            passport["genre"] = request.genre.strip()
        if request.description is not None:
            passport["description"] = request.description
        if request.author is not None:
            passport["author"] = request.author
        if request.icon is not None:
            passport["icon"] = sanitize_icon_key(request.icon, default="globe")
        if request.accent_color is not None:
            passport["accent_color"] = self.template_validator.validate_hex_color(
                request.accent_color,
                fallback=passport.get("accent_color") or "#38BDF8",
            )
        if request.starting_locations is not None:
            passport["starting_locations"] = request.starting_locations
        if request.ai_prompts is not None:
            passport["ai_prompts"] = request.ai_prompts.model_dump()

        passport["updated_at"] = datetime.now(timezone.utc).isoformat()
        self._write_json(world_json_path, passport)

        if request.character_template is not None:
            locs = passport.get("starting_locations") or []
            default_loc = locs[0] if locs else "Стартова локація"
            tpl_data = self.template_validator.validate_and_normalize(
                request.character_template,
                world_id=clean_id,
                default_location=default_loc,
            )
            self._write_json(os.path.join(w_dir, "character_template.json"), tpl_data)

        return self.get_world_detail(clean_id)

    def clone_world(self, source_world_id: str, request: WorldCloneRequest) -> WorldSummary:
        """Клонує існуючий світ (паспорт, шаблон і за потреби статті лору) під новим ASCII ID."""
        _, src_dir = self._require_world_dir(source_world_id)
        src_passport = self._read_json(os.path.join(src_dir, "world.json"))
        src_tpl = self.get_world_template(source_world_id)

        existing_ids = self._list_existing_world_ids()
        base_slug = slugify_ascii(request.new_world_id or request.new_title, default="world")
        new_world_id = ensure_unique_slug(base_slug, existing_ids)

        dst_dir = os.path.join(self.worlds_dir, new_world_id)
        dst_lore_dir = os.path.join(dst_dir, "lore")
        os.makedirs(dst_lore_dir, exist_ok=True)

        now_iso = datetime.now(timezone.utc).isoformat()
        new_passport = dict(src_passport)
        new_passport["world_id"] = new_world_id
        new_passport["title"] = request.new_title.strip()
        new_passport["created_at"] = now_iso
        new_passport["updated_at"] = now_iso
        new_passport["icon"] = sanitize_icon_key(new_passport.get("icon"), default="globe")
        self._write_json(os.path.join(dst_dir, "world.json"), new_passport)

        locs = new_passport.get("starting_locations") or []
        default_loc = locs[0] if locs else "Стартова локація"
        new_tpl = self.template_validator.validate_and_normalize(
            src_tpl,
            world_id=new_world_id,
            default_location=default_loc,
        )
        self._write_json(os.path.join(dst_dir, "character_template.json"), new_tpl)

        if request.include_lore:
            world_lore_store.copy_lore_files(os.path.join(src_dir, "lore"), dst_lore_dir)

        return WorldSummary(
            world_id=new_world_id,
            title=new_passport["title"],
            genre=new_passport.get("genre", "Фентезі"),
            description=new_passport.get("description", ""),
            icon=new_passport["icon"],
            accent_color=new_passport.get("accent_color", "#7E0018"),
            character_count=0,
            is_default=False,
            created_at=now_iso,
            updated_at=now_iso,
        )

    def _find_dependents(self, world_id: str, character_manager=None) -> Tuple[List[str], List[str]]:
        """Знаходить залежні char_id та campaign_id для заданого world_id."""
        char_dir = getattr(character_manager, "characters_dir", None) or self.characters_dir
        dep_chars: List[str] = []
        if os.path.exists(char_dir):
            for fname in os.listdir(char_dir):
                if fname.endswith(".json") and not fname.startswith("_"):
                    cid = fname[:-5]
                    try:
                        data = self._read_json(os.path.join(char_dir, fname))
                        if data.get("meta", {}).get("world_id") == world_id:
                            dep_chars.append(cid)
                    except Exception:
                        continue

        dep_char_set = set(dep_chars)
        dep_campaigns: List[str] = []
        if os.path.exists(self.saves_dir):
            for entry in os.listdir(self.saves_dir):
                c_dir = os.path.join(self.saves_dir, entry)
                meta_path = os.path.join(c_dir, "metadata.json")
                if os.path.isdir(c_dir) and os.path.isfile(meta_path):
                    try:
                        meta = self._read_json(meta_path)
                        if meta.get("world_id") == world_id or meta.get("char_id") in dep_char_set:
                            dep_campaigns.append(meta.get("campaign_id") or entry)
                    except Exception:
                        continue

        return dep_chars, dep_campaigns

    def delete_world(
        self,
        world_id: str,
        cascade: bool = False,
        character_manager=None,
        campaign_manager=None,
    ) -> Dict[str, Any]:
        """
        Видаляє кастомний світ:
        - базовий світ default_dark_fantasy захищений (HTTP 403);
        - при наявності залежних сутностей без cascade=True кидає WorldDeleteConflictError (HTTP 409);
        - при cascade=True видаляє залежні кампанії, персонажів та каталог світу.
        """
        clean_id, w_dir = self._require_world_dir(world_id)
        if clean_id == DEFAULT_WORLD_ID:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Базовий світ '{DEFAULT_WORLD_ID}' захищений від видалення.",
            )

        dep_chars, dep_campaigns = self._find_dependents(clean_id, character_manager=character_manager)
        if (dep_chars or dep_campaigns) and not cascade:
            conflict = WorldDeleteConflict(
                detail=(
                    f"Неможливо видалити світ '{clean_id}': знайдено залежних персонажів "
                    f"({len(dep_chars)}) та кампаній ({len(dep_campaigns)}). Використайте ?cascade=true."
                ),
                world_id=clean_id,
                dependent_characters=len(dep_chars),
                dependent_campaigns=len(dep_campaigns),
            )
            raise WorldDeleteConflictError(conflict)

        if cascade:
            for camp_id in dep_campaigns:
                if campaign_manager is not None:
                    try:
                        campaign_manager.delete_campaign(camp_id)
                        continue
                    except HTTPException:
                        pass
                c_dir = os.path.join(self.saves_dir, camp_id)
                if os.path.exists(c_dir):
                    shutil.rmtree(c_dir, ignore_errors=True)

            char_dir = getattr(character_manager, "characters_dir", None) or self.characters_dir
            for char_id in dep_chars:
                if character_manager is not None:
                    try:
                        character_manager.delete_character(char_id)
                        continue
                    except HTTPException:
                        pass
                c_file = os.path.join(char_dir, f"{char_id}.json")
                if os.path.isfile(c_file):
                    os.remove(c_file)

        shutil.rmtree(w_dir)
        return {"status": "deleted", "world_id": clean_id}

    def get_lore_article(self, world_id: str, filename: str) -> LoreArticleResponse:
        clean_id, w_dir = self._require_world_dir(world_id)
        return world_lore_store.get_lore_article(clean_id, os.path.join(w_dir, "lore"), filename)

    def save_lore_article(self, world_id: str, filename: str, content: str) -> Dict[str, Any]:
        clean_id, w_dir = self._require_world_dir(world_id)
        result = world_lore_store.save_lore_article(os.path.join(w_dir, "lore"), filename, content)
        world_json_path = os.path.join(w_dir, "world.json")
        passport = self._read_json(world_json_path)
        passport["updated_at"] = datetime.now(timezone.utc).isoformat()
        self._write_json(world_json_path, passport)
        return result

    def delete_lore_article(self, world_id: str, filename: str) -> Dict[str, Any]:
        clean_id, w_dir = self._require_world_dir(world_id)
        result = world_lore_store.delete_lore_article(clean_id, os.path.join(w_dir, "lore"), filename)
        world_json_path = os.path.join(w_dir, "world.json")
        passport = self._read_json(world_json_path)
        passport["updated_at"] = datetime.now(timezone.utc).isoformat()
        self._write_json(world_json_path, passport)
        return result
