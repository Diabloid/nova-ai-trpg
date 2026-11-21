import copy
import json
import os
import sys
from datetime import datetime, timezone
from typing import Dict, Any, Optional, List, Tuple, Set
from core.slugify import validate_and_normalize_meta_avatar, slugify_ascii, sanitize_icon_key, validate_hex_color
from core.services.key_translator import KeyTranslatorService
from core.state_parser import StateDelta, DynamicListChange, NewSectionSpec

# Безпечне кодування консолі для Windows
if sys.stdout and hasattr(sys.stdout, "reconfigure"):
    try:
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass
if sys.stderr and hasattr(sys.stderr, "reconfigure"):
    try:
        sys.stderr.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DEFAULT_SAVE_PATH = os.path.join(BASE_DIR, "data", "saves", "savegame.json")

PROTECTED_PATHS = {"_schema_meta", "meta.world_id", "meta.avatar", "created_at", "updated_at"}
MAX_NEW_SECTIONS_PER_TURN = 2
ARCHETYPE_DEFAULTS: Dict[str, Any] = {
    "card_list": [],
    "tag_list": [],
    "stat_grid": {},
    "container_map": {},
    "long_text": "",
}


class GameState:
    """
    Керує станом персонажа, персистентністю та schema-aware застосуванням змін.
    Підтримує як класичні фентезі-секції (anatomy_and_health, storage_and_equipment),
    так і довільні динамічні шаблони світів (field_updates, section_changes).
    """

    def __init__(
        self,
        save_path: Optional[str] = None,
        initial_state: Optional[Dict[str, Any]] = None,
        key_translator: Optional[KeyTranslatorService] = None,
    ):
        self.save_path = save_path or DEFAULT_SAVE_PATH
        self.data: Dict[str, Any] = {}
        self._initial_state = initial_state
        self.key_translator = key_translator or KeyTranslatorService()
        self.load()

    def _init_default_state(self):
        """Створює мінімальний нейтральний скелет стану без фентезі-хардкоду."""
        if isinstance(self._initial_state, dict) and self._initial_state:
            self.data = copy.deepcopy(self._initial_state)
        else:
            self.data = {
                "meta": {
                    "world_id": "default_dark_fantasy",
                    "name": "Мандрівник",
                    "location": "Стартова локація",
                    "overall_state": "Повний сил",
                }
            }
        self.save()

    def load(self):
        """Завантажує збереження з файлу."""
        if os.path.exists(self.save_path):
            try:
                with open(self.save_path, "r", encoding="utf-8") as f:
                    self.data = json.load(f)
                print(f"✅ [GameState] Збереження завантажено з {self.save_path}")
            except json.JSONDecodeError:
                print("⚠️ [GameState] Помилка читання файлу збереження. Створюю базовий стан.")
                self._init_default_state()
        else:
            self._init_default_state()

    def save(self):
        """Зберігає поточний стан у JSON."""
        os.makedirs(os.path.dirname(self.save_path), exist_ok=True)
        with open(self.save_path, "w", encoding="utf-8") as f:
            json.dump(self.data, f, ensure_ascii=False, indent=4)

    def create_snapshot(self):
        """Зберігає копію поточного стану у savegame.prev.json перед мутацією."""
        prev_path = self.save_path.replace("savegame.json", "savegame.prev.json")
        try:
            with open(prev_path, "w", encoding="utf-8") as f:
                json.dump(self.data, f, ensure_ascii=False, indent=4)
        except Exception as e:
            print(f"⚠️ [GameState] Не вдалося створити snapshot: {e}")

    def rollback_snapshot(self) -> bool:
        """Відновлює стан із savegame.prev.json (Undo)."""
        prev_path = self.save_path.replace("savegame.json", "savegame.prev.json")
        if os.path.exists(prev_path):
            try:
                with open(prev_path, "r", encoding="utf-8") as f:
                    self.data = json.load(f)
                self.save()
                print(f"↩️ [GameState] Стан успішно відновлено з попереднього снепшоту {prev_path}")
                return True
            except Exception as e:
                print(f"⚠️ [GameState] Помилка відновлення снепшоту: {e}")
        return False

    def get_current_state(self) -> dict:
        """Повертає повний стан персонажа без спотворень чи примусового сплощення."""
        return self.data

    def capture_snapshot_dict(self) -> Dict[str, Any]:
        """Повертає глибоку копію поточного стану для стеку знімків чи атомарної транзакції."""
        return copy.deepcopy(self.data)

    def restore_state_dict(self, state_dict: Dict[str, Any]) -> Dict[str, Any]:
        """Атомарно відновлює стан персонажа з переданого словника-знімка."""
        self.data = copy.deepcopy(state_dict)
        self.save()
        return self.get_current_state()

    def create_manual_backup(self):
        """Зберігає бекап поточного стану у savegame.manual_prev.json для ручного редагування."""
        manual_path = self.save_path.replace("savegame.json", "savegame.manual_prev.json")
        try:
            with open(manual_path, "w", encoding="utf-8") as f:
                json.dump(self.data, f, ensure_ascii=False, indent=4)
        except Exception as e:
            print(f"⚠️ [GameState] Не вдалося створити manual backup: {e}")

    def replace_state(self, new_state: Dict[str, Any]) -> Dict[str, Any]:
        """
        Повністю замінює живий стан кампанії (Режим B — «Редагувати лист»):
        1. Створює резерв у savegame.manual_prev.json (не чіпаючи стек відкату ходів turn_snapshots.json);
        2. Очищає верхньорівневі None-ключі та гарантує meta як словник;
        3. Страхує meta.world_id і created_at, оновлює updated_at;
        4. Дозволяє оновлювати/видаляти meta.avatar, будь-які секції та _schema_meta.
        """
        raw_copy = copy.deepcopy(dict(new_state or {}))
        payload: Dict[str, Any] = {k: v for k, v in raw_copy.items() if v is not None}

        if not isinstance(payload.get("meta"), dict):
            payload["meta"] = {}

        prev_meta = self.data.get("meta") if isinstance(self.data.get("meta"), dict) else {}
        if not payload["meta"].get("world_id"):
            payload["meta"]["world_id"] = prev_meta.get("world_id") or "default_dark_fantasy"
        validate_and_normalize_meta_avatar(payload["meta"])

        now_iso = datetime.now(timezone.utc).isoformat()
        if not payload.get("created_at"):
            payload["created_at"] = self.data.get("created_at") or now_iso
        payload["updated_at"] = now_iso

        # Створюємо окремий manual backup, не зсуваючи ігровий стек відкату ходів
        self.create_manual_backup()
        self.data = payload
        self.save()
        return self.get_current_state()

    # ------------------------------------------------------------------
    # Schema-aware хелпери для довільних шаблонів
    # ------------------------------------------------------------------

    def _get_sections_meta(self) -> Dict[str, Any]:
        schema_meta = self.data.get("_schema_meta")
        if isinstance(schema_meta, dict) and isinstance(schema_meta.get("sections"), dict):
            return schema_meta["sections"]
        return {}

    def _is_protected_path(self, path: str) -> bool:
        if not path:
            return True
        clean = path.strip()
        return clean in PROTECTED_PATHS or clean.startswith("_schema_meta.")

    def _get_by_dot_path(self, dot_path: str) -> Any:
        node: Any = self.data
        for part in dot_path.split("."):
            if isinstance(node, dict) and part in node:
                node = node[part]
            else:
                return None
        return node

    def _find_container_map_path(self) -> Optional[str]:
        """Шукає шлях секції з archetype == 'container_map' у _schema_meta."""
        for sec_path, sec_info in self._get_sections_meta().items():
            if isinstance(sec_info, dict) and sec_info.get("archetype") == "container_map":
                return sec_path
        return None

    def _detect_card_keys(self, items: List[Any]) -> Tuple[str, str]:
        """Адаптивно визначає ключі заголовка й опису елементів card_list."""
        for item in items:
            if isinstance(item, dict):
                name_key = next((k for k in ("name", "title", "location") if k in item), "name")
                desc_key = next((k for k in ("desc", "description", "type", "effect") if k in item), "desc")
                return name_key, desc_key
        return "name", "desc"

    def _mutate_card_list(
        self,
        target_list: List[Any],
        action: str,
        name: str,
        desc: str = "",
        item_fields: Optional[Dict[str, Any]] = None,
    ) -> List[Any]:
        name_key, desc_key = self._detect_card_keys(target_list)
        if action in ("add", "update"):
            found = False
            for existing in target_list:
                if isinstance(existing, dict):
                    existing_name = existing.get(name_key) or existing.get("name") or existing.get("title") or existing.get("location")
                    if existing_name == name:
                        if desc:
                            existing[desc_key] = desc
                        if isinstance(item_fields, dict):
                            existing.update(item_fields)
                        found = True
                        break
            if not found:
                new_obj: Dict[str, Any] = {name_key: name}
                if desc:
                    new_obj[desc_key] = desc
                if isinstance(item_fields, dict):
                    new_obj.update(item_fields)
                target_list.append(new_obj)
        elif action == "remove":
            target_list[:] = [
                item for item in target_list
                if (
                    (item.get(name_key) or item.get("name") or item.get("title") or item.get("location"))
                    if isinstance(item, dict)
                    else str(item)
                ) != name
            ]
        return target_list

    def _apply_new_section(self, spec: NewSectionSpec) -> Optional[str]:
        """
        Безпечно створює нову секцію у self.data та реєструє її в _schema_meta.sections.
        Повертає нормалізований шлях або None, якщо шлях захищено чи невалідно.
        """
        raw_path = (spec.path or "").strip()
        raw_top = raw_path.split(".")[0].strip().lower() if raw_path else ""
        if raw_top in ("_schema_meta", "schema_meta", "meta", "created_at", "updated_at") or raw_top.startswith("_"):
            return None

        parts = [slugify_ascii(p, default="") for p in raw_path.split(".") if p.strip()]
        parts = [p for p in parts if p]
        if not parts:
            fallback_slug = slugify_ascii(spec.title or "", default="")
            if fallback_slug:
                parts = [fallback_slug]
            else:
                return None

        clean_path = ".".join(parts)
        if self._is_protected_path(clean_path) or parts[0] in ("_schema_meta", "schema_meta", "meta", "created_at", "updated_at"):
            return None

        node: Any = self.data
        for part in parts[:-1]:
            if part not in node or not isinstance(node[part], dict):
                node[part] = {}
            node = node[part]
        leaf = parts[-1]
        if leaf not in node or node[leaf] is None:
            node[leaf] = copy.deepcopy(ARCHETYPE_DEFAULTS.get(spec.archetype, []))

        schema_meta = self.data.get("_schema_meta")
        if not isinstance(schema_meta, dict):
            schema_meta = {"version": 2, "sections": {}}
            self.data["_schema_meta"] = schema_meta
        schema_meta.setdefault("version", 2)
        sections = schema_meta.setdefault("sections", {})
        if not isinstance(sections, dict):
            sections = {}
            schema_meta["sections"] = sections

        if clean_path not in sections:
            next_order = max(
                (
                    s.get("order", 0)
                    for s in sections.values()
                    if isinstance(s, dict) and isinstance(s.get("order"), int)
                ),
                default=0,
            ) + 1
            raw_title = (spec.title or clean_path).strip()
            resolved_title = (
                raw_title
                if self.key_translator.has_cyrillic(raw_title)
                else self.key_translator.translate_key_sync(raw_title)
            )
            sections[clean_path] = {
                "title": resolved_title,
                "icon": sanitize_icon_key(spec.icon, default="sparkles"),
                "color": validate_hex_color(spec.color, fallback="#38BDF8"),
                "archetype": spec.archetype,
                "placement": spec.placement,
                "order": next_order,
            }

        return clean_path

    def _apply_section_change(self, change: DynamicListChange) -> None:
        if self._is_protected_path(change.section_path):
            return

        sections_meta = self._get_sections_meta()
        parts = change.section_path.split(".")
        top_key = parts[0]

        # Забороняємо створення нових кореневих гілок, яких немає в шаблоні
        if top_key not in self.data and top_key not in sections_meta:
            return

        # Перевіряємо, чи це container_map (напр. inventory_containers.Рюкзак)
        parent_path = ".".join(parts[:-1]) if len(parts) > 1 else ""
        parent_arch = (sections_meta.get(parent_path) or {}).get("archetype") if parent_path else None
        if parent_arch == "container_map" or parent_path == "storage_and_equipment.containers":
            parent_dict = self._get_by_dot_path(parent_path)
            if isinstance(parent_dict, dict):
                sub_key = parts[-1]
                c_list = parent_dict.setdefault(sub_key, [])
                if isinstance(c_list, list):
                    self._mutate_card_list(c_list, change.action, change.name, change.desc or "", change.item_fields)
            return

        # Звичайний список (tag_list або card_list)
        node: Any = self.data
        for part in parts[:-1]:
            if isinstance(node, dict) and part in node and isinstance(node[part], dict):
                node = node[part]
            else:
                return

        leaf_key = parts[-1]
        if leaf_key not in node:
            node[leaf_key] = []
        target = node[leaf_key]
        if not isinstance(target, list):
            return

        sec_arch = (sections_meta.get(change.section_path) or {}).get("archetype")
        if not sec_arch:
            if target and all(isinstance(x, str) for x in target):
                sec_arch = "tag_list"
            elif change.desc or change.item_fields:
                sec_arch = "card_list"
            else:
                sec_arch = "card_list"

        if sec_arch == "tag_list":
            if change.action in ("add", "update"):
                if change.name not in target:
                    target.append(change.name)
            elif change.action == "remove":
                target[:] = [x for x in target if str(x) != change.name]
        else:
            self._mutate_card_list(target, change.action, change.name, change.desc or "", change.item_fields)

    def _apply_legacy_inventory(self, delta: StateDelta) -> None:
        if not delta.inventory_changes:
            return

        # Перевіряємо, чи є класичний storage_and_equipment, або container_map у _schema_meta
        has_classic = isinstance(self.data.get("storage_and_equipment"), dict)
        custom_container_path = None if has_classic else self._find_container_map_path()

        if custom_container_path:
            # Перенаправляємо у кастомний container_map без створення фентезі-секцій
            node: Any = self.data
            parts = custom_container_path.split(".")
            for part in parts[:-1]:
                node = node.setdefault(part, {})
            containers = node.setdefault(parts[-1], {})
            if not isinstance(containers, dict):
                return
            preexisting: Set[str] = set(containers.keys())

            for item in delta.inventory_changes:
                if item.action in ("add", "update"):
                    c_list = containers.setdefault(item.container, [])
                    self._mutate_card_list(c_list, item.action, item.item_name, item.item_desc or "")
                elif item.action == "remove":
                    for c_name in list(containers.keys()):
                        self._mutate_card_list(containers[c_name], "remove", item.item_name)

            # Зберігаємо порожні контейнери шаблону/існуючі до ходу
            for k in list(containers.keys()):
                if len(containers[k]) == 0 and k not in preexisting:
                    del containers[k]
            return

        # Класичний storage_and_equipment (default_dark_fantasy)
        storage = self.data.setdefault("storage_and_equipment", {})
        containers = storage.setdefault("containers", {})
        worn = storage.setdefault("worn", [])
        preexisting = set(containers.keys())

        for item in delta.inventory_changes:
            if item.action in ["add", "update"]:
                container_name = item.container
                target_list = worn if container_name == "worn" else containers.setdefault(container_name, [])
                self._mutate_card_list(target_list, item.action, item.item_name, item.item_desc or "")
            elif item.action == "remove":
                storage["worn"] = [
                    i for i in storage.get("worn", [])
                    if (i.get("name") if isinstance(i, dict) else str(i)) != item.item_name
                ]
                for c_name in list(containers.keys()):
                    containers[c_name] = [
                        i for i in containers[c_name]
                        if (i.get("name") if isinstance(i, dict) else str(i)) != item.item_name
                    ]

        # Залишаємо існуючі/шаблонні порожні контейнери, видаляємо лише тимчасово створені порожні
        storage["containers"] = {
            k: v for k, v in storage.get("containers", {}).items()
            if len(v) > 0 or k in preexisting
        }

    # ------------------------------------------------------------------
    # Головний метод мутації стану від Аналізатора
    # ------------------------------------------------------------------

    def update_from_llm(self, llm_json_str: str) -> dict:
        """Ювелірно застосовує StateDelta v2 від ШІ до поточного стану (100% schema-aware)."""
        self.create_snapshot()
        try:
            delta = StateDelta.model_validate_json(llm_json_str)
        except Exception as e:
            print(f"❌ [GameState] Помилка парсингу дельти: {e}\nСирий JSON: {llm_json_str}")
            return self.get_current_state()

        # 1. Базові скалярні якорі (Meta)
        if delta.location_changed:
            if isinstance(self.data.get("meta"), dict):
                self.data["meta"]["location"] = delta.location_changed
            elif "location" in self.data:
                self.data["location"] = delta.location_changed
            else:
                self.data.setdefault("meta", {})["location"] = delta.location_changed

        if delta.appearance_changed:
            self.data.setdefault("meta", {})["appearance"] = delta.appearance_changed

        if delta.new_overall_state:
            if isinstance(self.data.get("anatomy_and_health"), dict):
                self.data["anatomy_and_health"]["overall_state"] = delta.new_overall_state
            else:
                self.data.setdefault("meta", {})["overall_state"] = delta.new_overall_state

        # 2. Класичні травми (лише якщо anatomy_and_health існує в шаблоні)
        if delta.injury_changes and isinstance(self.data.get("anatomy_and_health"), dict):
            injuries = self.data["anatomy_and_health"].setdefault("injuries", [])
            for inj in delta.injury_changes:
                if inj.action in ["add", "worsen"]:
                    found = False
                    for existing_inj in injuries:
                        if existing_inj.get("location") == inj.location:
                            existing_inj["type"] = inj.type_and_desc
                            found = True
                            break
                    if not found:
                        injuries.append({"location": inj.location, "type": inj.type_and_desc})
                elif inj.action == "heal":
                    self.data["anatomy_and_health"]["injuries"] = [
                        i for i in injuries if i.get("location") != inj.location
                    ]

        # 3. Класичний інвентар або перенаправлення у container_map
        self._apply_legacy_inventory(delta)

        # 3.5. Керована поява нових секцій (new_sections, макс. 2 за хід) до field_updates/section_changes
        new_section_aliases: Dict[str, str] = {}
        created_sections_count = 0
        for spec in delta.new_sections:
            if created_sections_count >= MAX_NEW_SECTIONS_PER_TURN:
                break
            created_path = self._apply_new_section(spec)
            if created_path:
                created_sections_count += 1
                if spec.path:
                    new_section_aliases[spec.path.strip().lower()] = created_path
                if spec.title:
                    new_section_aliases[spec.title.strip().lower()] = created_path

        # 4. Точкові скалярні оновлення (field_updates)
        for dot_path, value in delta.field_updates.items():
            resolved_dot_path = dot_path
            if dot_path and new_section_aliases:
                raw_parts = dot_path.split(".")
                alias_hit = new_section_aliases.get(raw_parts[0].strip().lower())
                if alias_hit:
                    resolved_dot_path = ".".join([alias_hit] + raw_parts[1:])

            if self._is_protected_path(resolved_dot_path):
                continue
            parts = resolved_dot_path.split(".")
            top_key = parts[0]
            if top_key not in self.data and top_key != "meta":
                continue
            node: Any = self.data
            valid = True
            for part in parts[:-1]:
                if part not in node:
                    node[part] = {}
                if not isinstance(node[part], dict):
                    valid = False
                    break
                node = node[part]
            if valid:
                node[parts[-1]] = value

        # 5. Універсальні зміни секцій/списків/контейнерів (section_changes)
        for sec_change in delta.section_changes:
            if sec_change.section_path and new_section_aliases:
                raw_parts = sec_change.section_path.split(".")
                alias_hit = new_section_aliases.get(raw_parts[0].strip().lower())
                if alias_hit and alias_hit != raw_parts[0]:
                    sec_change = sec_change.model_copy(
                        update={"section_path": ".".join([alias_hit] + raw_parts[1:])}
                    )
            self._apply_section_change(sec_change)

        # 6. Оновлюємо _schema_meta.field_labels для будь-яких нових англомовних ключів
        self.key_translator.populate_field_labels_sync(self.data)

        self.save()
        return self.get_current_state()
