import json
import os
from datetime import datetime, timezone
from typing import Any, Callable, Dict, Tuple

from core.slugify import (
    ensure_unique_slug,
    is_strict_ascii_id,
    merge_legacy_background_into_biography,
    slugify_ascii,
)


def _read_json(path: str) -> Dict[str, Any]:
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


def _write_json(path: str, data: Dict[str, Any]) -> None:
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=4)


def migrate_legacy_characters(
    characters_dir: str,
    default_world_id: str = "default_dark_fantasy",
) -> Tuple[Dict[str, str], Dict[str, str]]:
    """
    Переводить не-ASCII файли персонажів у строгий ASCII-slug і гарантує meta.world_id.
    Повертає (char_worlds, char_id_map).
    """
    char_worlds: Dict[str, str] = {}
    char_id_map: Dict[str, str] = {}
    if not os.path.exists(characters_dir):
        return char_worlds, char_id_map

    files = sorted(
        f for f in os.listdir(characters_dir)
        if f.endswith(".json") and not f.startswith("_")
    )
    existing_ascii_ids = {
        f[:-5].lower() for f in files if is_strict_ascii_id(f[:-5])
    }

    migrated_worlds = 0
    renamed_chars = 0
    for fname in files:
        old_char_id = fname[:-5]
        fpath = os.path.join(characters_dir, fname)
        try:
            data = _read_json(fpath)
            needs_rename = not is_strict_ascii_id(old_char_id)
            if needs_rename:
                new_char_id = ensure_unique_slug(
                    slugify_ascii(old_char_id, default="hero"),
                    existing_ascii_ids,
                )
                existing_ascii_ids.add(new_char_id.lower())
                char_id_map[old_char_id] = new_char_id
                char_id_map[old_char_id.lower()] = new_char_id
                changed = True
            else:
                new_char_id = old_char_id
                changed = False

            meta = data.setdefault("meta", {})
            if not meta.get("world_id"):
                meta["world_id"] = default_world_id
                changed = True
                migrated_worlds += 1
            if merge_legacy_background_into_biography(meta):
                changed = True

            if needs_rename:
                for key in ("char_id", "character_id"):
                    if key in data:
                        data[key] = new_char_id
                    if key in meta:
                        meta[key] = new_char_id

            new_fpath = os.path.join(characters_dir, f"{new_char_id}.json")
            if changed:
                _write_json(new_fpath, data)
            if needs_rename:
                if os.path.abspath(new_fpath) != os.path.abspath(fpath) and os.path.isfile(fpath):
                    os.remove(fpath)
                renamed_chars += 1

            char_worlds[new_char_id] = meta["world_id"]
            char_worlds[new_char_id.lower()] = meta["world_id"]
        except Exception as e:
            print(f"⚠️ [WorldMigration] Помилка міграції персонажа {fname}: {e}")

    if renamed_chars > 0:
        print(f"🌍 [WorldMigration] Переведено {renamed_chars} не-ASCII персонажів у ASCII-slug.")
    if migrated_worlds > 0:
        print(f"🌍 [WorldMigration] Проставлено world_id для {migrated_worlds} персонажів.")
    return char_worlds, char_id_map


def migrate_legacy_campaigns(
    saves_dir: str,
    char_worlds: Dict[str, str],
    char_id_map: Dict[str, str],
    default_world_id: str = "default_dark_fantasy",
) -> None:
    """
    Переводить не-ASCII папки кампаній у строгий ASCII-slug і синхронізує
    metadata.json, savegame.json та savegame.prev.json без втрати історії й логів.
    """
    if not os.path.exists(saves_dir):
        return

    entries = sorted(
        e for e in os.listdir(saves_dir)
        if os.path.isdir(os.path.join(saves_dir, e))
    )
    existing_ascii_dirs = {
        e.lower() for e in entries if is_strict_ascii_id(e)
    }

    renamed_campaigns = 0
    updated_meta_count = 0
    for entry in entries:
        c_dir = os.path.join(saves_dir, entry)
        try:
            needs_rename = not is_strict_ascii_id(entry)
            if needs_rename:
                new_campaign_id = ensure_unique_slug(
                    slugify_ascii(entry, default="campaign", max_length=96),
                    existing_ascii_dirs,
                )
                existing_ascii_dirs.add(new_campaign_id.lower())
                new_c_dir = os.path.join(saves_dir, new_campaign_id)
                os.rename(c_dir, new_c_dir)
                c_dir = new_c_dir
                actual_campaign_id = new_campaign_id
                renamed_campaigns += 1
            else:
                actual_campaign_id = entry

            resolved_char_id = ""
            resolved_world_id = default_world_id

            meta_path = os.path.join(c_dir, "metadata.json")
            if os.path.isfile(meta_path):
                meta = _read_json(meta_path)
                meta_changed = False

                if meta.get("campaign_id") != actual_campaign_id:
                    meta["campaign_id"] = actual_campaign_id
                    meta_changed = True

                old_char_id = str(meta.get("char_id") or "").strip()
                resolved_char_id = (
                    char_id_map.get(old_char_id)
                    or char_id_map.get(old_char_id.lower())
                    or ""
                )
                if not resolved_char_id and old_char_id:
                    resolved_char_id = (
                        old_char_id
                        if is_strict_ascii_id(old_char_id)
                        else slugify_ascii(old_char_id, default="hero")
                    )

                if resolved_char_id != old_char_id:
                    meta["char_id"] = resolved_char_id
                    meta_changed = True

                resolved_world_id = (
                    meta.get("world_id")
                    or char_worlds.get(resolved_char_id)
                    or char_worlds.get(resolved_char_id.lower())
                    or default_world_id
                )
                if meta.get("world_id") != resolved_world_id:
                    meta["world_id"] = resolved_world_id
                    meta_changed = True

                if meta_changed:
                    _write_json(meta_path, meta)
                    updated_meta_count += 1

            for save_name in ("savegame.json", "savegame.prev.json"):
                save_path = os.path.join(c_dir, save_name)
                if not os.path.isfile(save_path):
                    continue
                s_data = _read_json(save_path)
                if not isinstance(s_data, dict):
                    continue
                s_changed = False

                if "campaign_id" in s_data and s_data["campaign_id"] != actual_campaign_id:
                    s_data["campaign_id"] = actual_campaign_id
                    s_changed = True

                if resolved_char_id:
                    for key in ("char_id", "character_id"):
                        if key in s_data and s_data[key] != resolved_char_id:
                            s_data[key] = resolved_char_id
                            s_changed = True

                s_meta = s_data.get("meta")
                if isinstance(s_meta, dict):
                    if not s_meta.get("world_id"):
                        s_meta["world_id"] = resolved_world_id
                        s_changed = True
                    if merge_legacy_background_into_biography(s_meta):
                        s_changed = True
                    if resolved_char_id:
                        for key in ("char_id", "character_id"):
                            if key in s_meta and s_meta[key] != resolved_char_id:
                                s_meta[key] = resolved_char_id
                                s_changed = True

                if s_changed:
                    _write_json(save_path, s_data)
        except Exception as e:
            print(f"⚠️ [WorldMigration] Помилка міграції кампанії {entry}: {e}")

    if renamed_campaigns > 0:
        print(f"🌍 [WorldMigration] Переведено {renamed_campaigns} не-ASCII кампаній у ASCII-slug.")
    if updated_meta_count > 0:
        print(f"🌍 [WorldMigration] Синхронізовано метадані для {updated_meta_count} кампаній.")


def _ensure_default_world_files(
    worlds_dir: str,
    default_world_id: str,
    passport_factory: Callable[[str], Dict[str, Any]],
    schema_meta_factory: Callable[[], Dict[str, Any]],
) -> None:
    now_iso = datetime.now(timezone.utc).isoformat()
    default_dir = os.path.join(worlds_dir, default_world_id)
    default_lore_dir = os.path.join(default_dir, "lore")
    world_json_path = os.path.join(default_dir, "world.json")
    template_json_path = os.path.join(default_dir, "character_template.json")

    os.makedirs(default_lore_dir, exist_ok=True)

    if not os.path.exists(world_json_path):
        _write_json(world_json_path, passport_factory(now_iso))
        print(f"🌍 [WorldMigration] Створено паспорт базового світу '{default_world_id}'")

    if not os.path.exists(template_json_path):
        tpl_data = {
            "meta": {
                "world_id": default_world_id,
                "name": "",
                "first_name": "",
                "last_name": "",
                "patronymic": "",
                "titles": "",
                "age": "",
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
            "_schema_meta": schema_meta_factory(),
        }
        _write_json(template_json_path, tpl_data)
        print(f"🌍 [WorldMigration] Створено character_template.json для '{default_world_id}'")


def _normalize_world_templates(
    worlds_dir: str,
    default_world_id: str,
    template_validator: Any,
) -> None:
    if not os.path.exists(worlds_dir):
        return

    for entry in sorted(os.listdir(worlds_dir)):
        w_dir = os.path.join(worlds_dir, entry)
        w_tpl = os.path.join(w_dir, "character_template.json")
        w_meta_path = os.path.join(w_dir, "world.json")
        if not os.path.isfile(w_tpl):
            continue
        try:
            tpl_json = _read_json(w_tpl)
            if not isinstance(tpl_json, dict):
                continue
            default_loc = "Стартова локація"
            if os.path.isfile(w_meta_path):
                try:
                    w_meta = _read_json(w_meta_path)
                    locs = w_meta.get("starting_locations") or []
                    if locs:
                        default_loc = locs[0]
                except Exception:
                    pass
            if entry == default_world_id:
                # Для еталонного світу прибираємо лише legacy background без зміни авторської схеми
                if isinstance(tpl_json.get("meta"), dict) and merge_legacy_background_into_biography(tpl_json["meta"]):
                    _write_json(w_tpl, tpl_json)
            else:
                normalized_tpl = template_validator.validate_and_normalize(
                    tpl_json,
                    world_id=entry,
                    default_location=default_loc,
                )
                if normalized_tpl != tpl_json:
                    _write_json(w_tpl, normalized_tpl)
        except Exception as e:
            print(f"⚠️ [WorldMigration] Помилка очищення шаблону світу {entry}: {e}")


def migrate_if_needed(
    worlds_dir: str,
    characters_dir: str,
    saves_dir: str,
    template_validator: Any,
    default_world_id: str,
    passport_factory: Callable[[str], Dict[str, Any]],
    schema_meta_factory: Callable[[], Dict[str, Any]],
) -> None:
    """
    Ідемпотентна авто-ініціалізація та міграція пакетів світів, персонажів і кампаній:
    1. Гарантує наявність базового світу (lore/, world.json, character_template.json).
    2. Очищає й нормалізує шаблони світів та системний _template.json.
    3. Переводить не-ASCII персонажів і кампаній у ASCII-slug та мігрує legacy-поля.
    """
    _ensure_default_world_files(
        worlds_dir=worlds_dir,
        default_world_id=default_world_id,
        passport_factory=passport_factory,
        schema_meta_factory=schema_meta_factory,
    )
    _normalize_world_templates(
        worlds_dir=worlds_dir,
        default_world_id=default_world_id,
        template_validator=template_validator,
    )

    legacy_sys_tpl = os.path.join(characters_dir, "_template.json")
    if os.path.isfile(legacy_sys_tpl):
        try:
            sys_tpl = _read_json(legacy_sys_tpl)
            if isinstance(sys_tpl, dict) and isinstance(sys_tpl.get("meta"), dict):
                if merge_legacy_background_into_biography(sys_tpl["meta"]):
                    _write_json(legacy_sys_tpl, sys_tpl)
        except Exception as e:
            print(f"⚠️ [WorldMigration] Помилка очищення _template.json: {e}")

    char_worlds, char_id_map = migrate_legacy_characters(
        characters_dir=characters_dir,
        default_world_id=default_world_id,
    )
    migrate_legacy_campaigns(
        saves_dir=saves_dir,
        char_worlds=char_worlds,
        char_id_map=char_id_map,
        default_world_id=default_world_id,
    )
