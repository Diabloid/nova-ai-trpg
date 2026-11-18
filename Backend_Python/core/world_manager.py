import os
import sys
import json
import shutil
from datetime import datetime, timezone
from typing import List, Optional, Dict, Any, Tuple, TYPE_CHECKING
from fastapi import HTTPException, status

# Безпечне кодування консолі для Windows
if sys.stdout and hasattr(sys.stdout, "reconfigure"):
    try:
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass

from core.slugify import slugify_ascii, ensure_unique_slug, sanitize_icon_key

if TYPE_CHECKING:
    from core.services.template_validator import TemplateValidator
from schemas.game_dto import (
    WorldAiPrompts,
    WorldSummary,
    WorldLoreArticleInfo,
    WorldDetailResponse,
    WorldCreateRequest,
    WorldUpdateRequest,
    WorldCloneRequest,
    WorldDeleteConflict,
    LoreArticleResponse,
)

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
WORLDS_DIR = os.path.join(BASE_DIR, "data", "worlds")
LEGACY_LORE_DIR = os.path.join(BASE_DIR, "data", "lore")
CHARACTERS_DIR = os.path.join(BASE_DIR, "data", "characters")
SAVES_DIR = os.path.join(BASE_DIR, "data", "saves")

DEFAULT_WORLD_ID = "default_dark_fantasy"
MAX_LORE_FILE_BYTES = 512 * 1024  # 512 KB ліміт на одну статтю лору
ALLOWED_LORE_EXTS = (".md", ".txt")


class WorldDeleteConflictError(Exception):
    """Доменна помилка конфлікту видалення світу (HTTP 409 з плоским WorldDeleteConflict)."""
    def __init__(self, conflict: WorldDeleteConflict):
        self.conflict = conflict
        super().__init__(conflict.detail)


def _default_dark_fantasy_schema_meta() -> Dict[str, Any]:
    """Повертає _schema_meta v2 для стандартного шаблону Крэтэрлсокії (виключно Lucide-ключі)."""
    return {
        "version": 2,
        "sections": {
            "anatomy_and_health.injuries": {
                "title": "Травми та стани",
                "icon": "heart-pulse",
                "color": "#EF4444",
                "archetype": "card_list",
                "placement": "drawer_column",
                "order": 1,
            },
            "storage_and_equipment.worn": {
                "title": "Одяг та спорядження",
                "icon": "shield",
                "color": "#3B82F6",
                "archetype": "card_list",
                "placement": "drawer_column",
                "order": 2,
            },
            "abilities": {
                "title": "Здібності та магія",
                "icon": "zap",
                "color": "#A855F7",
                "archetype": "card_list",
                "placement": "drawer_column",
                "order": 3,
            },
            "storage_and_equipment.containers": {
                "title": "Інвентар та контейнери",
                "icon": "backpack",
                "color": "#F59E0B",
                "archetype": "container_map",
                "placement": "drawer_column",
                "order": 4,
            },
            "meta.biography": {
                "title": "Біографія",
                "icon": "scroll-text",
                "color": "#10B981",
                "archetype": "long_text",
                "placement": "details",
                "order": 5,
            },
            "custom_blocks": {
                "title": "Додаткові блоки",
                "icon": "scroll-text",
                "color": "#64748B",
                "archetype": "stat_grid",
                "placement": "details",
                "order": 6,
            },
        },
    }


def _default_dark_fantasy_passport(now_iso: str) -> Dict[str, Any]:
    """Формує паспорт базового світу Крэтэрлсокії з винесеними сеттинговими правилами."""
    return {
        "world_id": DEFAULT_WORLD_ID,
        "title": "Крэтэрлсокія",
        "genre": "Темне фентезі",
        "description": (
            "Похмурий світ, пошматований трисотлітніми війнами, магічними розломами, "
            "смертю богів та точковими спалахами чуми. Землі Уессексу, Священної Імперії "
            "та Раздроблених королівств."
        ),
        "author": "System",
        "icon": "moon",
        "accent_color": "#7E0018",
        "starting_locations": [
            "Вулиця покинутого селища",
            "Околиці зачумленого селища",
            "Занедбана каплиця",
            "Трактир на роздоріжжі",
            "Прикордонний тракт Уессексу",
        ],
        "ai_prompts": {
            "world_tone": (
                "Похмурий, напружений, реалістичний світ темного фентезі, де магія "
                "виснажує Ефірне Ядро, а чума й нежить чатують за кожним рогом."
            ),
            "narrator_rules": (
                "Світ темного фентезі Крэтэрлсокія: похмуре середньовіччя, Ефір, магічні розломи, "
                "точкові спалахи чуми, гільдії, раси (люди, ельфи, дворфи, орки, звіролюди). "
                "Дотримуйся суворого реалізму наслідків і похмурої атмосфери."
            ),
            "analyzer_rules": (
                "МАГІЧНЕ ВИСНАЖЕННЯ (ПРОПОРЦІЙНІСТЬ): Оцінюй витрати Ефіру логічно, використовуючи "
                "суху термінологію в new_overall_state.\n"
                "- Магія 1-го кола (побут) — витрати мізерні (пиши \"Ефірне Ядро стабільне\" або \"Легке коливання Ефіру\").\n"
                "- Магія 2-го кола — помірні витрати.\n"
                "- Магія 3-го кола або Синергія — високе/критичне виснаження.\n"
                "Уникай розмитих художніх слів на кшталт \"частково виснажене\". Тільки об'єктивні факти."
            ),
            "creator_rules": (
                "Похмурий світ Крэтэрлсокії (темне фентезі, пошматоване війнами, магічними розломами та чумою).\n"
                "Походження та раси: Людина з Раздроблених королівств, Уессексу або Священної Імперії; "
                "Ельф, Дворф, Зверолюд, Орк тощо.\n"
                "Архетипи та фах: найманець, маг одного з магічних кіл, мисливець за нежиттю, "
                "жебрак-виживач, бродячий аптекар, утікач-каторжник.\n"
                "Органічно вплітай елементи лору (смерть богів, старі війни, Ефір, гільдії, точкові спалахи мору)."
            ),
        },
        "created_at": now_iso,
        "updated_at": now_iso,
    }


class WorldManager:
    """
    Керує пакетами світів у data/worlds/{world_id}/:
    - world.json (паспорт світу + ai_prompts)
    - character_template.json (шаблон персонажа зі схемою _schema_meta)
    - lore/ (статті лору .md / .txt)
    Забезпечує ідемпотентну авто-міграцію, CRUD світів, клонування, захищене видалення та CRUD лору.
    """

    def __init__(
        self,
        worlds_dir: Optional[str] = None,
        legacy_lore_dir: Optional[str] = None,
        characters_dir: Optional[str] = None,
        saves_dir: Optional[str] = None,
        template_validator: Optional["TemplateValidator"] = None,
    ):
        self.worlds_dir = worlds_dir or WORLDS_DIR
        self.legacy_lore_dir = legacy_lore_dir or LEGACY_LORE_DIR
        self.characters_dir = characters_dir or CHARACTERS_DIR
        self.saves_dir = saves_dir or SAVES_DIR
        if template_validator is None:
            from core.services.template_validator import TemplateValidator
            self.template_validator = TemplateValidator()
        else:
            self.template_validator = template_validator
        os.makedirs(self.worlds_dir, exist_ok=True)

    # ------------------------------------------------------------------
    # Допоміжні методи шляхів та читання
    # ------------------------------------------------------------------

    def _sanitize_world_id_for_lookup(self, world_id: Optional[str]) -> str:
        if world_id is None or not str(world_id).strip():
            return DEFAULT_WORLD_ID
        clean = "".join(c for c in str(world_id) if c.isalnum() or c in ("-", "_")).strip().lower()
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
                detail=f"Світ '{world_id}' не знайдено."
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
        """Безпечно читає текстовий файл (UTF-8-sig з fallback на cp1251) та перевіряє розмір."""
        size = os.path.getsize(filepath)
        if size > MAX_LORE_FILE_BYTES:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Файл занадто великий ({size} байт). Максимум: {MAX_LORE_FILE_BYTES} байт."
            )
        with open(filepath, "rb") as f:
            raw = f.read()
        try:
            return raw.decode("utf-8-sig")
        except UnicodeDecodeError:
            return raw.decode("cp1251", errors="replace")

    def _validate_lore_filename(self, filename: str) -> str:
        """Захист від path traversal та перевірка розширення .md/.txt."""
        if not filename or not isinstance(filename, str):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Некоректне ім'я файлу статті лору."
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
                detail="Заборонені символи в імені файлу (path traversal захист)."
            )
        ext = os.path.splitext(cleaned)[1].lower()
        if ext not in ALLOWED_LORE_EXTS:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Дозволені лише формати {', '.join(ALLOWED_LORE_EXTS)}."
            )
        return cleaned

    def _extract_article_title(self, filename: str, content: str) -> str:
        for line in content.splitlines():
            stripped = line.strip()
            if stripped.startswith("#"):
                title = stripped.lstrip("#").strip()
                if title:
                    return title
        return os.path.splitext(filename)[0]

    def _estimate_tokens(self, text: str) -> int:
        if not text:
            return 0
        return max(1, len(text) // 4)

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

    # ------------------------------------------------------------------
    # Ідемпотентна авто-міграція при старті (B1.1)
    # ------------------------------------------------------------------

    def migrate_if_needed(self) -> None:
        """
        Ідемпотентна авто-міграція платформи до структури Світів v2.0.0:
        1. Створює data/worlds/default_dark_fantasy/ з копією лору, world.json та character_template.json.
        2. Проставляє meta.world_id = 'default_dark_fantasy' у всіх існуючих персонажах без world_id.
        3. Проставляє world_id у всіх існуючих кампаніях (metadata.json) без world_id.
        """
        now_iso = datetime.now(timezone.utc).isoformat()
        default_dir = os.path.join(self.worlds_dir, DEFAULT_WORLD_ID)
        default_lore_dir = os.path.join(default_dir, "lore")
        world_json_path = os.path.join(default_dir, "world.json")
        template_json_path = os.path.join(default_dir, "character_template.json")

        os.makedirs(default_lore_dir, exist_ok=True)

        # 1.1 Копіюємо статті лору з data/lore/ -> data/worlds/default_dark_fantasy/lore/
        if os.path.exists(self.legacy_lore_dir):
            existing_lore = os.listdir(default_lore_dir)
            if not existing_lore:
                copied_count = 0
                for fname in os.listdir(self.legacy_lore_dir):
                    if fname.lower().endswith(ALLOWED_LORE_EXTS):
                        src = os.path.join(self.legacy_lore_dir, fname)
                        dst = os.path.join(default_lore_dir, fname)
                        if os.path.isfile(src) and not os.path.exists(dst):
                            shutil.copy2(src, dst)
                            copied_count += 1
                if copied_count > 0:
                    print(f"🌍 [WorldManager] Мігровано {copied_count} файлів лору в {DEFAULT_WORLD_ID}/lore/")

        # 1.2 Створюємо world.json для Крэтэрлсокії
        if not os.path.exists(world_json_path):
            self._write_json(world_json_path, _default_dark_fantasy_passport(now_iso))
            print(f"🌍 [WorldManager] Створено паспорт базового світу '{DEFAULT_WORLD_ID}'")

        # 1.3 Створюємо character_template.json із _schema_meta v2
        if not os.path.exists(template_json_path):
            legacy_tpl_path = os.path.join(self.characters_dir, "_template.json")
            if os.path.isfile(legacy_tpl_path):
                try:
                    tpl_data = self._read_json(legacy_tpl_path)
                except Exception:
                    tpl_data = {}
            else:
                tpl_data = {
                    "meta": {
                        "name": "",
                        "first_name": "",
                        "last_name": "",
                        "patronymic": "",
                        "titles": "",
                        "age": "",
                        "background": "",
                        "location": "Невідомий ліс",
                        "appearance": "",
                        "appearance_details": {
                            "physique": "",
                            "height": "",
                            "eyes": "",
                            "hair": "",
                            "race_traits": "",
                        },
                        "biography": "",
                    },
                    "anatomy_and_health": {"overall_state": "Повний сил", "injuries": []},
                    "storage_and_equipment": {"worn": [], "containers": {}},
                    "abilities": [],
                    "custom_blocks": {},
                }
            tpl_meta = tpl_data.setdefault("meta", {})
            tpl_meta.setdefault("world_id", DEFAULT_WORLD_ID)
            tpl_data["_schema_meta"] = _default_dark_fantasy_schema_meta()
            self._write_json(template_json_path, tpl_data)
            print(f"🌍 [WorldManager] Створено character_template.json для '{DEFAULT_WORLD_ID}'")

        # 2. Міграція існуючих персонажів (data/characters/*.json)
        char_worlds: Dict[str, str] = {}
        if os.path.exists(self.characters_dir):
            migrated_chars = 0
            for fname in os.listdir(self.characters_dir):
                if fname.endswith(".json") and not fname.startswith("_"):
                    char_id = fname[:-5]
                    fpath = os.path.join(self.characters_dir, fname)
                    try:
                        data = self._read_json(fpath)
                        meta = data.setdefault("meta", {})
                        if not meta.get("world_id"):
                            meta["world_id"] = DEFAULT_WORLD_ID
                            self._write_json(fpath, data)
                            migrated_chars += 1
                        char_worlds[char_id] = meta["world_id"]
                    except Exception as e:
                        print(f"⚠️ [WorldManager] Помилка міграції персонажа {fname}: {e}")
            if migrated_chars > 0:
                print(f"🌍 [WorldManager] Проставлено world_id для {migrated_chars} персонажів.")

        # 3. Міграція існуючих кампаній (data/saves/*/metadata.json)
        if os.path.exists(self.saves_dir):
            migrated_campaigns = 0
            for entry in os.listdir(self.saves_dir):
                c_dir = os.path.join(self.saves_dir, entry)
                meta_path = os.path.join(c_dir, "metadata.json")
                if os.path.isdir(c_dir) and os.path.isfile(meta_path):
                    try:
                        meta = self._read_json(meta_path)
                        if not meta.get("world_id"):
                            linked_char = meta.get("char_id", "")
                            meta["world_id"] = char_worlds.get(linked_char, DEFAULT_WORLD_ID)
                            self._write_json(meta_path, meta)
                            migrated_campaigns += 1
                    except Exception as e:
                        print(f"⚠️ [WorldManager] Помилка міграції кампанії {entry}: {e}")
            if migrated_campaigns > 0:
                print(f"🌍 [WorldManager] Проставлено world_id для {migrated_campaigns} кампаній.")

    # ------------------------------------------------------------------
    # Читання даних світу (для сервісів і API)
    # ------------------------------------------------------------------

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

    # ------------------------------------------------------------------
    # CRUD операції Світів
    # ------------------------------------------------------------------

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

        # Базовий світ завжди перший, далі за датою оновлення (новіші вище)
        worlds.sort(key=lambda w: (not w.is_default, w.title.lower()))
        return worlds

    def get_world_detail(self, world_id: str, character_manager=None) -> WorldDetailResponse:
        """Повертає повні деталі світу: паспорт, ai_prompts, шаблон та список статей лору."""
        clean_id, w_dir = self._require_world_dir(world_id)
        data = self._read_json(os.path.join(w_dir, "world.json"))
        tpl = self.get_world_template(clean_id)
        counts = self._count_characters_by_world(character_manager)

        lore_dir = os.path.join(w_dir, "lore")
        articles: List[WorldLoreArticleInfo] = []
        total_bytes = 0
        total_tokens = 0

        if os.path.exists(lore_dir):
            for fname in sorted(os.listdir(lore_dir)):
                if fname.lower().endswith(ALLOWED_LORE_EXTS):
                    fpath = os.path.join(lore_dir, fname)
                    if os.path.isfile(fpath):
                        try:
                            text = self._read_text_safe(fpath)
                            size_b = os.path.getsize(fpath)
                            tokens = self._estimate_tokens(text)
                            articles.append(
                                WorldLoreArticleInfo(
                                    filename=fname,
                                    title=self._extract_article_title(fname, text),
                                    size_bytes=size_b,
                                    est_tokens=tokens,
                                )
                            )
                            total_bytes += size_b
                            total_tokens += tokens
                        except Exception as e:
                            print(f"⚠️ [WorldManager] Помилка індексації статті {fname}: {e}")

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

        # Шаблон персонажа (валідований через TemplateValidator)
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
            src_lore_dir = os.path.join(src_dir, "lore")
            if os.path.exists(src_lore_dir):
                for fname in os.listdir(src_lore_dir):
                    if fname.lower().endswith(ALLOWED_LORE_EXTS):
                        src_file = os.path.join(src_lore_dir, fname)
                        if os.path.isfile(src_file):
                            shutil.copy2(src_file, os.path.join(dst_lore_dir, fname))

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
        Видаляє кастомний світ.
        - Базовий світ default_dark_fantasy захищений (HTTP 403).
        - Якщо cascade=False і є залежні персонажі або кампанії — повертає HTTP 409 Conflict (WorldDeleteConflict).
        - Якщо cascade=True — каскадно видаляє кампанії, персонажів та папку світу.
        """
        clean_id, w_dir = self._require_world_dir(world_id)
        if clean_id == DEFAULT_WORLD_ID:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Базовий світ '{DEFAULT_WORLD_ID}' захищений від видалення."
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
            # 1. Видаляємо залежні кампанії
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

            # 2. Видаляємо залежних персонажів
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

    # ------------------------------------------------------------------
    # CRUD статей Лору світу
    # ------------------------------------------------------------------

    def get_lore_article(self, world_id: str, filename: str) -> LoreArticleResponse:
        clean_id, w_dir = self._require_world_dir(world_id)
        safe_name = self._validate_lore_filename(filename)
        fpath = os.path.join(w_dir, "lore", safe_name)

        if not os.path.isfile(fpath):
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Статтю '{safe_name}' у світі '{clean_id}' не знайдено."
            )

        content = self._read_text_safe(fpath)
        size_b = os.path.getsize(fpath)
        return LoreArticleResponse(
            world_id=clean_id,
            filename=safe_name,
            title=self._extract_article_title(safe_name, content),
            content=content,
            size_bytes=size_b,
            est_tokens=self._estimate_tokens(content),
        )

    def save_lore_article(self, world_id: str, filename: str, content: str) -> Dict[str, Any]:
        clean_id, w_dir = self._require_world_dir(world_id)
        safe_name = self._validate_lore_filename(filename)
        raw_bytes = content.encode("utf-8")
        if len(raw_bytes) > MAX_LORE_FILE_BYTES:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Розмір статті перевищує ліміт {MAX_LORE_FILE_BYTES} байт."
            )

        lore_dir = os.path.join(w_dir, "lore")
        os.makedirs(lore_dir, exist_ok=True)
        fpath = os.path.join(lore_dir, safe_name)

        with open(fpath, "wb") as f:
            f.write(raw_bytes)

        # Оновлюємо updated_at у world.json
        world_json_path = os.path.join(w_dir, "world.json")
        passport = self._read_json(world_json_path)
        passport["updated_at"] = datetime.now(timezone.utc).isoformat()
        self._write_json(world_json_path, passport)

        return {"status": "saved", "filename": safe_name, "size_bytes": len(raw_bytes)}

    def delete_lore_article(self, world_id: str, filename: str) -> Dict[str, Any]:
        clean_id, w_dir = self._require_world_dir(world_id)
        safe_name = self._validate_lore_filename(filename)
        fpath = os.path.join(w_dir, "lore", safe_name)

        if not os.path.isfile(fpath):
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Статтю '{safe_name}' у світі '{clean_id}' не знайдено."
            )

        os.remove(fpath)

        world_json_path = os.path.join(w_dir, "world.json")
        passport = self._read_json(world_json_path)
        passport["updated_at"] = datetime.now(timezone.utc).isoformat()
        self._write_json(world_json_path, passport)

        return {"status": "deleted", "filename": safe_name}
