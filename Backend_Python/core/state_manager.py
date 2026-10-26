import json
import os
import sys
from typing import Dict, Any, Optional

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

from core.state_parser import StateDelta

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DEFAULT_SAVE_PATH = os.path.join(BASE_DIR, "data", "saves", "savegame.json")

class GameState:
    def __init__(self, save_path: Optional[str] = None):
        self.save_path = save_path or DEFAULT_SAVE_PATH
        self.data: Dict[str, Any] = {}
        self.load()

    def _init_default_state(self):
        """Створює гнучкий стартовий шаблон, якщо збереження ще немає."""
        self.data = {
            "meta": {
                "name": "Мандрівник",
                "background": "Шукач пригод",
                "location": "Невідомий ліс"
            },
            "anatomy_and_health": {
                "overall_state": "Повний сил, але змерзлий",
                "injuries": []
            },
            "storage_and_equipment": {
                "worn": [],
                "containers": {
                    "Кишені": []
                }
            },
            "abilities": []
        }
        self.save()

    def load(self):
        if os.path.exists(self.save_path):
            try:
                with open(self.save_path, "r", encoding="utf-8") as f:
                    self.data = json.load(f)
                print(f"✅ Збереження успішно завантажено з {self.save_path}")
            except json.JSONDecodeError:
                print("⚠️ Помилка читання файлу збереження. Створюю базовий стан.")
                self._init_default_state()
        else:
            self._init_default_state()

    def save(self):
        os.makedirs(os.path.dirname(self.save_path), exist_ok=True)
        with open(self.save_path, "w", encoding="utf-8") as f:
            json.dump(self.data, f, ensure_ascii=False, indent=4)

    def get_current_state(self) -> dict:
        return self.data

    def update_from_llm(self, llm_json_str: str) -> dict:
        """Ювелірно застосовує дельту від ШІ до нашої бази даних."""
        try:
            delta = StateDelta.model_validate_json(llm_json_str)
        except Exception as e:
            print(f"❌ Помилка парсингу дельти: {e}\nСирий JSON: {llm_json_str}")
            return self.get_current_state()

        # 1. Оновлення Мети (Локації та ЗОВНІШНОСТІ)
        if delta.location_changed:
            self.data.setdefault("meta", {})["location"] = delta.location_changed
            
        if delta.appearance_changed:
            self.data.setdefault("meta", {})["appearance"] = delta.appearance_changed

        # 2. Оновлення Здоров'я
        if delta.new_overall_state:
            self.data.setdefault("anatomy_and_health", {})["overall_state"] = delta.new_overall_state
        
        injuries = self.data.setdefault("anatomy_and_health", {}).setdefault("injuries", [])
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
                self.data["anatomy_and_health"]["injuries"] = [i for i in injuries if i.get("location") != inj.location]

        # 3. Оновлення Інвентарю та Екіпірування
        storage = self.data.setdefault("storage_and_equipment", {})
        containers = storage.setdefault("containers", {})
        worn = storage.setdefault("worn", [])

        for item in delta.inventory_changes:
            if item.action in ["add", "update"]:
                container_name = item.container
                target_list = worn if container_name == "worn" else containers.setdefault(container_name, [])
                
                found = False
                for existing_item in target_list:
                    if existing_item.get("name") == item.item_name:
                        existing_item["desc"] = item.item_desc
                        found = True
                        break
                if not found:
                    target_list.append({"name": item.item_name, "desc": item.item_desc})
            
            elif item.action == "remove":
                # ГЛОБАЛЬНЕ ВИДАЛЕННЯ: знищуємо предмет всюди, ігноруючи назву контейнера від ШІ
                storage["worn"] = [i for i in storage.get("worn", []) if i.get("name") != item.item_name]
                for c_name in list(containers.keys()):
                    containers[c_name] = [i for i in containers[c_name] if i.get("name") != item.item_name]

        # 4. ОЧИЩЕННЯ: безжально видаляємо всі порожні контейнери (зникнуть порожні "Кишені")
        storage["containers"] = {k: v for k, v in storage.get("containers", {}).items() if len(v) > 0}

        self.save()
        return self.get_current_state()
