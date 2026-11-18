import copy
import re
from typing import Any, Dict, List, Optional

from core.slugify import sanitize_icon_key, validate_and_normalize_meta_avatar

ALLOWED_ARCHETYPES = {"card_list", "container_map", "stat_grid", "long_text", "tag_list"}
ALLOWED_PLACEMENTS = {"drawer_column", "details", "header_badge"}
SERVICE_TOP_KEYS = {"meta", "_schema_meta", "created_at", "updated_at"}

HEX_COLOR_RE = re.compile(r"^#[0-9A-Fa-f]{6}$")
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

    @staticmethod
    def validate_hex_color(color: Optional[str], fallback: str = "#38BDF8") -> str:
        if isinstance(color, str):
            trimmed = color.strip()
            if HEX_COLOR_RE.fullmatch(trimmed):
                return trimmed.upper()
        return fallback

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

    def validate_and_normalize(
        self,
        template: Optional[Dict[str, Any]],
        world_id: str = "default_dark_fantasy",
        default_location: str = "Стартова локація",
    ) -> Dict[str, Any]:
        """Нормалізує структуру шаблону, _schema_meta, м'які якорі, іконки Lucide та кольори."""
        raw_copy = copy.deepcopy(dict(template or {}))
        result: Dict[str, Any] = {k: v for k, v in raw_copy.items() if v is not None}

        # 1. М'які якорі meta
        meta = result.get("meta")
        if not isinstance(meta, dict):
            meta = {}
        result["meta"] = meta

        meta["world_id"] = (world_id or meta.get("world_id") or "default_dark_fantasy").strip().lower()
        if "name" not in meta or meta["name"] is None:
            meta["name"] = ""
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

        # 2. Валідація та нормалізація _schema_meta
        raw_schema = result.get("_schema_meta")
        schema_meta: Dict[str, Any] = copy.deepcopy(raw_schema) if isinstance(raw_schema, dict) else {}
        schema_meta["version"] = 2

        raw_sections = schema_meta.get("sections")
        sections: Dict[str, Any] = copy.deepcopy(raw_sections) if isinstance(raw_sections, dict) else {}
        normalized_sections: Dict[str, Any] = {}

        idx = 0
        for sec_path, sec_info in sections.items():
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
            if top_key in SERVICE_TOP_KEYS:
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

        schema_meta["sections"] = normalized_sections
        result["_schema_meta"] = schema_meta
        return result

    def build_demo_preview_if_missing(
        self,
        template: Dict[str, Any],
        demo_state: Optional[Dict[str, Any]] = None,
        world_passport: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        """
        Формує реалістичний demo_state на основі валідованого шаблону для живого прев'ю на клієнті.
        Якщо demo_state вже передано — нормалізує його та доповнює порожні секції прикладами.
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

        # Гарантуємо ключі з шаблону
        for k, v in clean_tpl.items():
            if k not in preview or preview[k] is None:
                preview[k] = copy.deepcopy(v)

        p_meta = preview.setdefault("meta", {})
        p_meta["world_id"] = world_id
        if not p_meta.get("name"):
            p_meta["name"] = "Демо-мандрівник"
        if not p_meta.get("location"):
            p_meta["location"] = default_loc
        if not p_meta.get("background"):
            genre = passport.get("genre") or "пригодницького світу"
            p_meta["background"] = f"Персонаж жанру «{genre}»"
        if not p_meta.get("appearance"):
            p_meta["appearance"] = "Характерне спорядження та прикмети цього світу."

        has_anatomy_status = (
            isinstance(preview.get("anatomy_and_health"), dict)
            and bool(preview["anatomy_and_health"].get("overall_state"))
        )
        if not has_anatomy_status and not p_meta.get("overall_state"):
            p_meta["overall_state"] = "Повний сил"

        # Наповнюємо порожні секції за їхнім архетипом
        for sec_path, sec_info in sections.items():
            arch = (sec_info or {}).get("archetype")
            title = (sec_info or {}).get("title") or sec_path
            parts = sec_path.split(".")
            if len(parts) == 1:
                key = parts[0]
                val = preview.get(key)
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
        return preview
