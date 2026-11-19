import copy
import re
from typing import Any, Dict, List, Optional

from core.slugify import (
    sanitize_icon_key,
    validate_and_normalize_meta_avatar,
    merge_legacy_background_into_biography,
    validate_hex_color,
)
from core.services.key_translator import KeyTranslatorService

ALLOWED_ARCHETYPES = {"card_list", "container_map", "stat_grid", "long_text", "tag_list"}
ALLOWED_PLACEMENTS = {"drawer_column", "details", "header_badge"}
SERVICE_TOP_KEYS = {"meta", "_schema_meta", "created_at", "updated_at"}
TECH_ITEM_KEYS = {"id", "uid", "uuid", "_id"}
DUPLICATE_BIO_SECTIONS = {"biography_notes", "personal_notes_bio", "bio_notes"}

# Мінімальна нормалізація очевидних англ. технічних ключів у header_badge / stat_grid / картках
TECH_KEY_LABELS_UK = {
    "hp": "HP",
    "style_rank": "Ранг стилю",
    "ammo": "Боєприпаси",
    "demonic_corruption": "Скверна",
    "quantity": "Кількість",
    "weight": "Вага",
    "cost": "Вартість",
    "value": "Значення",
    "rarity": "Рідкість",
    "level": "Рівень",
    "relation": "Ставлення",
}

DEFAULT_PALETTE = ["#38BDF8", "#A855F7", "#F59E0B", "#10B981", "#EF4444", "#06B6D4"]

ARCHETYPE_DEFAULT_ICONS = {
    "card_list": "layers",
    "container_map": "backpack",
    "stat_grid": "activity",
    "long_text": "scroll-text",
    "tag_list": "tags",
}


class TemplateValidator:
    """
    Валідатор та нормалізатор динамічних шаблонів персонажів (v2.0.0):
    - Гарантує наявність meta (world_id, name, location та хоча б одного статус-якоря);
    - Перевіряє і добудовує _schema_meta (version=2, 5 архетипів, 3 розміщення);
    - Санітизує всі icon виключно в ключі lucide-react (без Unicode-емодзі) і страхує HEX-кольори;
    - Очищає зайві None верхнього рівня та генерує реалістичний demo_state при потребі.
    """

    def __init__(self, key_translator: Optional[KeyTranslatorService] = None):
        self.key_translator = key_translator or KeyTranslatorService()

    @staticmethod
    def validate_hex_color(color: Optional[str], fallback: str = "#38BDF8") -> str:
        return validate_hex_color(color, fallback=fallback)

    @staticmethod
    def _get_by_dot_path(data: Dict[str, Any], dot_path: str) -> Any:
        node: Any = data
        for part in dot_path.split("."):
            if isinstance(node, dict) and part in node:
                node = node[part]
            else:
                return None
        return node

    @staticmethod
    def _prettify_title(key: str) -> str:
        leaf = key.split(".")[-1].replace("_", " ").strip()
        return leaf[:1].upper() + leaf[1:] if leaf else "Секція"

    @staticmethod
    def _infer_archetype(value: Any, key: str = "") -> str:
        lower_key = key.lower()
        if isinstance(value, list):
            if value and all(isinstance(x, str) for x in value):
                return "tag_list"
            if any(hint in lower_key for hint in ("skill", "perk", "tag", "protocol")):
                if not value:
                    return "tag_list"
            return "card_list"
        if isinstance(value, dict):
            if any(hint in lower_key for hint in ("container", "inventory", "gear", "bag", "backpack")):
                return "container_map"
            if value and any(isinstance(v, list) for v in value.values()):
                return "container_map"
            return "stat_grid"
        if isinstance(value, str):
            return "long_text"
        return "stat_grid"

    @staticmethod
    def _infer_placement(sec_path: str, archetype: str) -> str:
        lower = sec_path.lower()
        if archetype == "long_text" or any(h in lower for h in ("bio", "contact", "reputation", "note", "custom_blocks")):
            return "details"
        if archetype == "stat_grid" and any(h in lower for h in ("vital", "resource", "status", "stat", "header")):
            return "header_badge"
        return "drawer_column"

    @staticmethod
    def _set_by_dot_path(data: Dict[str, Any], dot_path: str, value: Any) -> None:
        parts = dot_path.split(".")
        node: Any = data
        for part in parts[:-1]:
            if part not in node or not isinstance(node[part], dict):
                node[part] = {}
            node = node[part]
        node[parts[-1]] = value

    @classmethod
    def _strip_tech_keys_from_item(cls, item: Any) -> Any:
        if not isinstance(item, dict):
            return item
        cleaned: Dict[str, Any] = {}
        for k, v in item.items():
            k_lower = str(k).strip().lower()
            if k_lower in TECH_ITEM_KEYS:
                continue
            target_key = TECH_KEY_LABELS_UK.get(k_lower, k)
            cleaned[target_key] = v
        return cleaned

    @classmethod
    def _flatten_tag_list(cls, items: Any) -> List[str]:
        if isinstance(items, str):
            s = items.strip()
            return [s] if s else []
        if not isinstance(items, list):
            return []
        flat: List[str] = []
        for item in items:
            if isinstance(item, str):
                s = item.strip()
                if s:
                    flat.append(s)
            elif isinstance(item, dict):
                head = str(item.get("name") or item.get("title") or item.get("label") or "").strip()
                details: List[str] = []
                for k, v in item.items():
                    k_low = str(k).strip().lower()
                    if k_low in TECH_ITEM_KEYS or k_low in ("name", "title", "label"):
                        continue
                    v_str = str(v).strip() if v is not None else ""
                    if v_str:
                        details.append(v_str)
                if head and details:
                    flat.append(f"{head} — {', '.join(details)}")
                elif head:
                    flat.append(head)
                elif details:
                    flat.append(", ".join(details))
            elif item is not None:
                s = str(item).strip()
                if s:
                    flat.append(s)
        return flat

    @classmethod
    def _normalize_stat_grid(cls, val: Any) -> Dict[str, Any]:
        if isinstance(val, list):
            grid: Dict[str, Any] = {}
            for entry in val:
                if isinstance(entry, dict):
                    raw_k = str(entry.get("title") or entry.get("name") or entry.get("label") or "").strip()
                    if not raw_k:
                        continue
                    k_label = TECH_KEY_LABELS_UK.get(raw_k.lower(), raw_k)
                    v_val = entry.get("value")
                    v_max = entry.get("max")
                    if v_val is not None and v_max is not None:
                        grid[k_label] = f"{v_val}/{v_max}"
                    elif v_val is not None:
                        grid[k_label] = v_val
                    else:
                        grid[k_label] = 0
            return grid
        if isinstance(val, dict):
            grid = {}
            for k, v in val.items():
                k_low = str(k).strip().lower()
                if k_low in TECH_ITEM_KEYS:
                    continue
                grid[k] = v
            return grid
        return {}

    @classmethod
    def _sanitize_section_data_for_preview(cls, val: Any, archetype: str) -> Any:
        if archetype == "tag_list":
            return cls._flatten_tag_list(val)
        if archetype == "card_list":
            if not isinstance(val, list):
                return []
            return [cls._strip_tech_keys_from_item(x) for x in val]
        if archetype == "container_map":
            if not isinstance(val, dict):
                return {}
            return {
                c_name: ([cls._strip_tech_keys_from_item(x) for x in c_items] if isinstance(c_items, list) else [])
                for c_name, c_items in val.items()
            }
        if archetype == "stat_grid":
            return cls._normalize_stat_grid(val)
        if archetype == "long_text":
            return str(val).strip() if val is not None else ""
        return val

    def validate_and_normalize(
        self,
        template: Optional[Dict[str, Any]],
        world_id: str = "default_dark_fantasy",
        default_location: str = "Стартова локація",
    ) -> Dict[str, Any]:
        """Нормалізує структуру шаблону, _schema_meta, м'які якорі, іконки Lucide та чистить його до порожнього скелета."""
        raw_copy = copy.deepcopy(dict(template or {}))
        result: Dict[str, Any] = {k: v for k, v in raw_copy.items() if v is not None}

        # 1. М'які якорі meta (шаблон має містити порожні текстові поля, крім world_id/location/overall_state)
        meta = result.get("meta")
        if not isinstance(meta, dict):
            meta = {}
        result["meta"] = meta

        meta["world_id"] = (world_id or meta.get("world_id") or "default_dark_fantasy").strip().lower()
        merge_legacy_background_into_biography(meta)
        meta["name"] = ""
        meta["appearance"] = ""
        meta["biography"] = ""
        if not meta.get("location"):
            meta["location"] = default_location or "Стартова локація"

        # Перевірка статус-якоря (meta.overall_state або anatomy_and_health.overall_state)
        has_anatomy_status = (
            isinstance(result.get("anatomy_and_health"), dict)
            and bool(result["anatomy_and_health"].get("overall_state"))
        )
        if not has_anatomy_status and not meta.get("overall_state"):
            meta["overall_state"] = "Нормальний стан"

        if "avatar" in meta:
            av = meta.get("avatar")
            if isinstance(av, str) and not av.strip().startswith("data:image/"):
                meta["avatar"] = sanitize_icon_key(av, default="user")
            else:
                validate_and_normalize_meta_avatar(meta)

        # Видаляємо дублюючі біо-секції на кшталт biography_notes (канонічне поле — meta.biography)
        for dup_key in list(result.keys()):
            if dup_key.lower() in DUPLICATE_BIO_SECTIONS:
                result.pop(dup_key, None)

        # 2. Валідація та нормалізація _schema_meta
        raw_schema = result.get("_schema_meta")
        schema_meta: Dict[str, Any] = copy.deepcopy(raw_schema) if isinstance(raw_schema, dict) else {}
        schema_meta["version"] = 2

        raw_sections = schema_meta.get("sections")
        sections: Dict[str, Any] = copy.deepcopy(raw_sections) if isinstance(raw_sections, dict) else {}
        normalized_sections: Dict[str, Any] = {}

        idx = 0
        for sec_path, sec_info in sections.items():
            if sec_path.split(".")[0].lower() in DUPLICATE_BIO_SECTIONS:
                continue
            info = copy.deepcopy(sec_info) if isinstance(sec_info, dict) else {}
            val = self._get_by_dot_path(result, sec_path)
            arch = info.get("archetype")
            if arch not in ALLOWED_ARCHETYPES:
                arch = self._infer_archetype(val, sec_path)

            placement = info.get("placement")
            if placement not in ALLOWED_PLACEMENTS:
                placement = self._infer_placement(sec_path, arch)

            default_icon = ARCHETYPE_DEFAULT_ICONS.get(arch, "layers")
            icon = sanitize_icon_key(info.get("icon"), default=default_icon)
            color = self.validate_hex_color(info.get("color"), fallback=DEFAULT_PALETTE[idx % len(DEFAULT_PALETTE)])
            order = info.get("order") if isinstance(info.get("order"), int) else (idx + 1)

            normalized_sections[sec_path] = {
                "title": (info.get("title") or self._prettify_title(sec_path)).strip(),
                "icon": icon,
                "color": color,
                "archetype": arch,
                "placement": placement,
                "order": order,
            }
            idx += 1

        # 3. Авто-виявлення секцій верхнього рівня, яких бракує в _schema_meta.sections
        existing_paths = set(normalized_sections.keys())
        for top_key, top_val in result.items():
            if top_key in SERVICE_TOP_KEYS or top_key.lower() in DUPLICATE_BIO_SECTIONS:
                continue
            already_covered = (
                top_key in existing_paths
                or any(p.startswith(f"{top_key}.") for p in existing_paths)
            )
            if already_covered:
                continue

            arch = self._infer_archetype(top_val, top_key)
            placement = self._infer_placement(top_key, arch)
            default_icon = ARCHETYPE_DEFAULT_ICONS.get(arch, "layers")
            normalized_sections[top_key] = {
                "title": self._prettify_title(top_key),
                "icon": default_icon,
                "color": DEFAULT_PALETTE[idx % len(DEFAULT_PALETTE)],
                "archetype": arch,
                "placement": placement,
                "order": idx + 1,
            }
            idx += 1

        # Якщо в meta є biography, але вона не в sections — додаємо в details
        if "biography" in meta and "meta.biography" not in normalized_sections:
            normalized_sections["meta.biography"] = {
                "title": "Біографія",
                "icon": "scroll-text",
                "color": "#64748B",
                "archetype": "long_text",
                "placement": "details",
                "order": idx + 1,
            }

        # 4. Очищаємо секції character_template до порожнього скелета (приклади мають бути лише в demo_state)
        for sec_path, sec_info in normalized_sections.items():
            arch = sec_info.get("archetype")
            cur_val = self._get_by_dot_path(result, sec_path)
            if arch in ("card_list", "tag_list"):
                self._set_by_dot_path(result, sec_path, [])
            elif arch == "long_text":
                self._set_by_dot_path(result, sec_path, "")
            elif arch == "container_map":
                if isinstance(cur_val, dict):
                    empty_containers = {c_name: [] for c_name in cur_val.keys()}
                else:
                    empty_containers = {}
                self._set_by_dot_path(result, sec_path, empty_containers)
            elif arch == "stat_grid":
                if cur_val is not None:
                    self._set_by_dot_path(result, sec_path, self._normalize_stat_grid(cur_val))

        schema_meta["sections"] = normalized_sections
        result["_schema_meta"] = schema_meta
        self.key_translator.populate_field_labels_sync(result)
        return result

    def build_demo_preview_if_missing(
        self,
        template: Dict[str, Any],
        demo_state: Optional[Dict[str, Any]] = None,
        world_passport: Optional[Dict[str, Any]] = None,
        fallback_examples: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        """
        Формує реалістичний demo_state на основі валідованого шаблону для живого прев'ю на клієнті.
        Чистить id/uid/uuid, конвертує об'єкти всередині tag_list у плоскі рядки та
        за потреби переносить непорожні приклади із fallback_examples (сирого шаблону).
        """
        passport = world_passport or {}
        world_id = passport.get("world_id") or (template.get("meta") or {}).get("world_id") or "default_dark_fantasy"
        locs = passport.get("starting_locations") or []
        default_loc = locs[0] if locs else (template.get("meta") or {}).get("location") or "Стартова локація"

        clean_tpl = self.validate_and_normalize(template, world_id=world_id, default_location=default_loc)
        schema_meta = clean_tpl.get("_schema_meta") or {}
        sections = schema_meta.get("sections") or {}

        preview = copy.deepcopy(demo_state) if isinstance(demo_state, dict) and demo_state else copy.deepcopy(clean_tpl)
        preview = {k: v for k, v in preview.items() if v is not None}

        # Видаляємо дублікати біографії (з переносом тексту в meta.biography, якщо треба)
        dup_bio_texts: List[str] = []
        for dup_key in list(preview.keys()):
            if dup_key.lower() in DUPLICATE_BIO_SECTIONS:
                val = preview.pop(dup_key, None)
                if isinstance(val, str) and val.strip():
                    dup_bio_texts.append(val.strip())

        # Якщо передано сирий шаблон із прикладами — підхоплюємо приклади для порожніх секцій preview
        if isinstance(fallback_examples, dict):
            for sec_path in sections.keys():
                ex_val = self._get_by_dot_path(fallback_examples, sec_path)
                cur_val = self._get_by_dot_path(preview, sec_path)
                is_empty = cur_val is None or cur_val == "" or cur_val == [] or cur_val == {}
                ex_has_data = ex_val not in (None, "", [], {})
                if is_empty and ex_has_data:
                    self._set_by_dot_path(preview, sec_path, copy.deepcopy(ex_val))

        # Гарантуємо ключі з шаблону
        for k, v in clean_tpl.items():
            if k not in preview or preview[k] is None:
                preview[k] = copy.deepcopy(v)

        p_meta = preview.setdefault("meta", {})
        p_meta["world_id"] = world_id
        merge_legacy_background_into_biography(p_meta)
        if not p_meta.get("biography") and dup_bio_texts:
            p_meta["biography"] = "\n\n".join(dup_bio_texts)
        if not p_meta.get("name"):
            p_meta["name"] = "Демо-мандрівник"
        if not p_meta.get("location"):
            p_meta["location"] = default_loc
        if not p_meta.get("appearance"):
            p_meta["appearance"] = "Характерне спорядження та прикмети цього світу."

        has_anatomy_status = (
            isinstance(preview.get("anatomy_and_health"), dict)
            and bool(preview["anatomy_and_health"].get("overall_state"))
        )
        if not has_anatomy_status and not p_meta.get("overall_state"):
            p_meta["overall_state"] = "Повний сил"

        # Санітизуємо та наповнюємо секції за їхнім архетипом
        for sec_path, sec_info in sections.items():
            arch = (sec_info or {}).get("archetype")
            title = (sec_info or {}).get("title") or sec_path
            parts = sec_path.split(".")
            if len(parts) == 1:
                key = parts[0]
                val = self._sanitize_section_data_for_preview(preview.get(key), arch)
                preview[key] = val
                if arch == "card_list" and (not isinstance(val, list) or len(val) == 0):
                    preview[key] = [{"name": f"Приклад: {title}", "desc": "Демонстраційний елемент картки."}]
                elif arch == "tag_list" and (not isinstance(val, list) or len(val) == 0):
                    preview[key] = ["Базова навичка", "Орієнтація в світі"]
                elif arch == "container_map":
                    if not isinstance(val, dict) or len(val) == 0:
                        preview[key] = {"Основне спорядження": [{"name": "Стартовий предмет", "desc": "Приклад екіпірування."}]}
                    else:
                        first_container = next(iter(val.keys()))
                        if isinstance(val[first_container], list) and len(val[first_container]) == 0:
                            val[first_container].append({"name": "Стартовий предмет", "desc": "Приклад предмета в контейнері."})
                elif arch == "stat_grid" and (not isinstance(val, dict) or len(val) == 0):
                    preview[key] = {"Ресурс": "100/100", "Репутація": "Нейтральна"}
                elif arch == "long_text" and (not isinstance(val, str) or not val.strip()):
                    preview[key] = f"Коротка примітка для розділу «{title}»."
            elif sec_path == "meta.biography" and not p_meta.get("biography"):
                world_title = passport.get("title") or "цього світу"
                p_meta["biography"] = f"Історія героя, що починає свій шлях на теренах {world_title}."

        preview["_schema_meta"] = copy.deepcopy(schema_meta)
        self.key_translator.populate_field_labels_sync(preview)
        return preview
