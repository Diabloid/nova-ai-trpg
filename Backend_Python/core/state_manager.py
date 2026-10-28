import json
import os
import sys
from typing import Dict, Any, Optional
from core.state_parser import StateDelta

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


class GameState:
    """
    Керує станом персонажа, персистентністю та застосуванням змін від Аналізатора.
    Зберігає та повертає повноцінну багату модель даних (об'єкти предметів {name, desc} та травм {location, type}).
    """
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
                "location": "Невідомий ліс",
                "appearance": "Пошарпаний плащ, уважний погляд"
            },
            "anatomy_and_health": {
                "overall_state": "Повний сил, але змерзлий",
                "injuries": []
            },
            "storage_and_equipment": {
                "worn": [
                    {
                        "name": "Простий одяг мандрівника",
                        "desc": "Зручний лляний одяг, що не сковує рухів."
                    },
                    {
                        "name": "Шкіряні чоботи",
                        "desc": "Міцне взуття для переходів бездоріжжям."
                    }
                ],
                "containers": {
                    "Кишені": [
                        {
                            "name": "Кресало",
                            "desc": "Для розведення вогнища."
                        },
                        {
                            "name": "Мідна монета (5 шт)",
                            "desc": "Дрібні гроші на їжу."
                        }
                    ]
                }
            },
            "abilities": [
                "Базове виживання",
                "Гостре чуття"
            ]
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

    def update_from_llm(self, llm_json_str: str) -> dict:
        """Ювелірно застосовує дельту від ШІ до нашої бази даних."""
        # Фіксуємо снепшот перед застосуванням мутації
        self.create_snapshot()
        try:
            delta = StateDelta.model_validate_json(llm_json_str)
        except Exception as e:
            print(f"❌ [GameState] Помилка парсингу дельти: {e}\nСирий JSON: {llm_json_str}")
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
                    if isinstance(existing_item, dict) and existing_item.get("name") == item.item_name:
                        existing_item["desc"] = item.item_desc
                        found = True
                        break
                if not found:
                    target_list.append({"name": item.item_name, "desc": item.item_desc})
            
            elif item.action == "remove":
                # ГЛОБАЛЬНЕ ВИДАЛЕННЯ: знищуємо предмет всюди, ігноруючи назву контейнера від ШІ
                storage["worn"] = [
                    i for i in storage.get("worn", [])
                    if (i.get("name") if isinstance(i, dict) else str(i)) != item.item_name
                ]
                for c_name in list(containers.keys()):
                    containers[c_name] = [
                        i for i in containers[c_name]
                        if (i.get("name") if isinstance(i, dict) else str(i)) != item.item_name
                    ]

        # 4. ОЧИЩЕННЯ: видаляємо всі порожні контейнери
        storage["containers"] = {k: v for k, v in storage.get("containers", {}).items() if len(v) > 0}

        self.save()
        return self.get_current_state()
