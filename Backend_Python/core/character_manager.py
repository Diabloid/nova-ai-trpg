import os
import sys
import json
from datetime import datetime, timezone
from typing import List, Optional, Dict, Any
from fastapi import HTTPException, status

# Безпечне кодування консолі для Windows
if sys.stdout and hasattr(sys.stdout, "reconfigure"):
    try:
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass

from schemas.game_dto import PlayerState, CharacterSummary

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CHARACTERS_DIR = os.path.join(BASE_DIR, "data", "characters")


class CharacterManager:
    """
    Керує заготовками персонажів (Character Blueprints) у data/characters/.
    Забезпечує захист системного шаблону _template.json.
    """
    def __init__(self, characters_dir: Optional[str] = None):
        self.characters_dir = characters_dir or CHARACTERS_DIR
        os.makedirs(self.characters_dir, exist_ok=True)
        self._ensure_system_template()
        self._ensure_default_character()

    def _ensure_system_template(self):
        """Створює захищений системний шаблон _template.json, якщо його немає."""
        template_path = os.path.join(self.characters_dir, "_template.json")
        if not os.path.exists(template_path):
            empty_template = {
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
                        "race_traits": ""
                    },
                    "biography": ""
                },
                "anatomy_and_health": {
                    "overall_state": "Повний сил",
                    "injuries": []
                },
                "storage_and_equipment": {
                    "worn": [],
                    "containers": {}
                },
                "abilities": [],
                "custom_blocks": {}
            }
            with open(template_path, "w", encoding="utf-8") as f:
                json.dump(empty_template, f, ensure_ascii=False, indent=4)

    def _ensure_default_character(self):
        """Створює базового персонажа Айвена, якщо немає жодного користувацького героя."""
        ayven_path = os.path.join(self.characters_dir, "ayven_mage.json")
        if not os.path.exists(ayven_path):
            ayven_data = {
                "meta": {
                    "name": "Айвен",
                    "background": "Найманець, маг вогню та вітру 3-го кола",
                    "location": "Вулиця покинутого селища",
                    "appearance": "22-річний юнак з довгим рудим волоссям. Має пірсинг у брові та проколоту мочку лівого вуха. Погляд зосереджений."
                },
                "anatomy_and_health": {
                    "overall_state": "Повний сил, Ефірне Ядро стабільне та спокійне.",
                    "injuries": []
                },
                "storage_and_equipment": {
                    "worn": [
                        {
                            "name": "Мантія мандрівного мага",
                            "desc": "Легка, але щільна тканина, що захищає від пилу та дощу."
                        },
                        {
                            "name": "Добротні шкіряні чоботи",
                            "desc": "Міцне взуття найманця для довгих переходів."
                        }
                    ],
                    "containers": {
                        "Права рука": [
                            {
                                "name": "Посох мага",
                                "desc": "Різьблений дерев'яний посох з навершям для точного спрямування заклять вогню та вітру."
                            }
                        ],
                        "Шкіряний рюкзак": [
                            {
                                "name": "Шкіряний гаманець",
                                "desc": "Містить 5 золотих та 35 срібних монет."
                            },
                            {
                                "name": "Особистий щоденник",
                                "desc": "Товстий зошит для записів контрактів і думок."
                            }
                        ]
                    }
                },
                "abilities": [
                    {
                        "name": "Магія вогню 3-го кола",
                        "desc": "Створення спрямованого вибухового полум'я."
                    },
                    {
                        "name": "Магія вітру (початкова)",
                        "desc": "Концентрація повітряних потоків для прискорення."
                    }
                ]
            }
            with open(ayven_path, "w", encoding="utf-8") as f:
                json.dump(ayven_data, f, ensure_ascii=False, indent=4)

    def _sanitize_char_id(self, char_id: str) -> str:
        clean = "".join(c for c in char_id if c.isalnum() or c in ("-", "_")).strip().lower()
        if not clean:
            clean = f"hero_{int(datetime.now(timezone.utc).timestamp())}"
        return clean

    def list_characters(self) -> List[CharacterSummary]:
        """Повертає список усіх створених персонажів (без системного _template)."""
        characters: List[CharacterSummary] = []
        if not os.path.exists(self.characters_dir):
            return characters

        for filename in sorted(os.listdir(self.characters_dir)):
            if filename.endswith(".json") and not filename.startswith("_"):
                char_id = filename[:-5]
                filepath = os.path.join(self.characters_dir, filename)
                try:
                    with open(filepath, "r", encoding="utf-8") as f:
                        data = json.load(f)
                    
                    mtime = os.path.getmtime(filepath)
                    iso_time = datetime.fromtimestamp(mtime, tz=timezone.utc).isoformat()
                    meta = data.get("meta", {})

                    characters.append(CharacterSummary(
                        char_id=char_id,
                        name=meta.get("name", char_id),
                        background=meta.get("background", ""),
                        appearance=meta.get("appearance", ""),
                        created_at=data.get("created_at") or iso_time
                    ))
                except Exception as e:
                    print(f"⚠️ Помилка зчитування заготовки {filename}: {e}")

        return characters

    def get_character(self, char_id: str) -> PlayerState:
        """Отримує повний стан заготовки персонажа."""
        clean_id = self._sanitize_char_id(char_id)
        filepath = os.path.join(self.characters_dir, f"{clean_id}.json")

        if not os.path.exists(filepath):
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Персонажа з ID '{char_id}' не знайдено."
            )

        with open(filepath, "r", encoding="utf-8") as f:
            data = json.load(f)
        return PlayerState.model_validate(data)

    def save_character(self, char_id: str, state: PlayerState) -> CharacterSummary:
        """Створює або перезаписує заготовку персонажа."""
        clean_id = self._sanitize_char_id(char_id)
        if clean_id.startswith("_template"):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Системний шаблон '_template' захищений від змін!"
            )

        filepath = os.path.join(self.characters_dir, f"{clean_id}.json")
        now_iso = datetime.now(timezone.utc).isoformat()

        payload = state.model_dump()
        payload["created_at"] = now_iso

        with open(filepath, "w", encoding="utf-8") as f:
            json.dump(payload, f, ensure_ascii=False, indent=4)

        return CharacterSummary(
            char_id=clean_id,
            name=state.meta.name,
            background=state.meta.background or "",
            appearance=state.meta.appearance or "",
            created_at=now_iso
        )

    def delete_character(self, char_id: str) -> bool:
        """Видаляє заготовку персонажа з диска."""
        clean_id = self._sanitize_char_id(char_id)
        if clean_id.startswith("_template"):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Системний шаблон '_template' не можна видалити!"
            )

        filepath = os.path.join(self.characters_dir, f"{clean_id}.json")
        if not os.path.exists(filepath):
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Персонажа з ID '{char_id}' не знайдено."
            )

        os.remove(filepath)
        return True
