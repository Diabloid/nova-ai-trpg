import os
import sys
import json
import shutil
from datetime import datetime, timezone
from typing import List, Optional, Dict, Any, Tuple
from fastapi import HTTPException, status

# Безпечне кодування консолі для Windows
if sys.stdout and hasattr(sys.stdout, "reconfigure"):
    try:
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass

from schemas.game_dto import CampaignSummary, HistoryMessage, PlayerState
from core.state_manager import GameState
from core.services.history_service import HistoryService
from core.services.chat_log_service import ChatLogService
from core.character_manager import CharacterManager

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SAVES_DIR = os.path.join(BASE_DIR, "data", "saves")


class CampaignManager:
    """
    Керує ігровими Кампаніями (чатами) у data/saves/{campaign_id}/.
    Кожна кампанія прив'язана до заготовки персонажа (char_id) та підтримує
    незалежні збереження, історію, статус закріплення (is_pinned) та авто-вступ.
    """
    def __init__(self, saves_dir: Optional[str] = None, character_manager: Optional[CharacterManager] = None):
        self.saves_dir = saves_dir or SAVES_DIR
        self.character_manager = character_manager or CharacterManager()
        os.makedirs(self.saves_dir, exist_ok=True)
        self._state_cache: Dict[str, GameState] = {}
        self._history_cache: Dict[str, HistoryService] = {}
        self._chat_log_cache: Dict[str, ChatLogService] = {}
        self._ensure_default_campaign_metadata()

    def _ensure_default_campaign_metadata(self):
        """Гарантує наявність metadata.json для дефолтної сесії."""
        default_dir = os.path.join(self.saves_dir, "default")
        if os.path.exists(default_dir):
            meta_path = os.path.join(default_dir, "metadata.json")
            if not os.path.exists(meta_path):
                now_iso = datetime.now(timezone.utc).isoformat()
                meta = {
                    "campaign_id": "default",
                    "char_id": "ayven_mage",
                    "title": "Основна пригода Айвена",
                    "current_location": "Вулиця покинутого селища",
                    "is_pinned": True,
                    "created_at": now_iso,
                    "last_played": now_iso
                }
                with open(meta_path, "w", encoding="utf-8") as f:
                    json.dump(meta, f, ensure_ascii=False, indent=4)

    def _sanitize_id(self, raw_id: str) -> str:
        clean = "".join(c for c in raw_id if c.isalnum() or c in ("-", "_")).strip().lower()
        return clean or "campaign"

    def get_campaign_dir(self, campaign_id: str) -> str:
        clean = self._sanitize_id(campaign_id)
        return os.path.join(self.saves_dir, clean)

    def get_campaign_session(self, campaign_id: str) -> Tuple[GameState, HistoryService, ChatLogService]:
        """Отримує GameState, HistoryService та ChatLogService для кампанії, кешуючи їх у пам'яті."""
        clean_id = self._sanitize_id(campaign_id)
        c_dir = self.get_campaign_dir(clean_id)
        os.makedirs(c_dir, exist_ok=True)

        savegame_path = os.path.join(c_dir, "savegame.json")
        history_path = os.path.join(c_dir, "history.json")
        chat_log_path = os.path.join(c_dir, "chat_log.json")

        if clean_id not in self._state_cache:
            self._state_cache[clean_id] = GameState(save_path=savegame_path)

        if clean_id not in self._history_cache:
            self._history_cache[clean_id] = HistoryService(history_file_path=history_path)

        if clean_id not in self._chat_log_cache:
            self._chat_log_cache[clean_id] = ChatLogService(
                chat_log_path=chat_log_path,
                legacy_history_path=history_path
            )

        return self._state_cache[clean_id], self._history_cache[clean_id], self._chat_log_cache[clean_id]

    def get_chat_log(self, campaign_id: str) -> ChatLogService:
        """Повертає ChatLogService для вказаної кампанії."""
        _, _, chat_log = self.get_campaign_session(campaign_id)
        return chat_log

    def touch_campaign_played(self, campaign_id: str, new_location: Optional[str] = None):
        """Оновлює дату останнього ходу та поточну локацію в metadata.json."""
        c_dir = self.get_campaign_dir(campaign_id)
        meta_path = os.path.join(c_dir, "metadata.json")
        if os.path.exists(meta_path):
            try:
                with open(meta_path, "r", encoding="utf-8") as f:
                    meta = json.load(f)
                meta["last_played"] = datetime.now(timezone.utc).isoformat()
                if new_location:
                    meta["current_location"] = new_location
                with open(meta_path, "w", encoding="utf-8") as f:
                    json.dump(meta, f, ensure_ascii=False, indent=4)
            except Exception as e:
                print(f"⚠️ Не вдалося оновити last_played для {campaign_id}: {e}")

    def list_campaigns_for_character(self, char_id: str) -> List[CampaignSummary]:
        """
        Повертає список кампаній персонажа, відсортований:
        закріплені (is_pinned == True) нагорі, далі за датою останнього ходу.
        """
        clean_char_id = self._sanitize_id(char_id)
        campaigns: List[CampaignSummary] = []

        if not os.path.exists(self.saves_dir):
            return campaigns

        for entry in os.listdir(self.saves_dir):
            c_dir = os.path.join(self.saves_dir, entry)
            if os.path.isdir(c_dir):
                meta_path = os.path.join(c_dir, "metadata.json")
                if os.path.exists(meta_path):
                    try:
                        with open(meta_path, "r", encoding="utf-8") as f:
                            meta = json.load(f)
                        
                        if meta.get("char_id", "").lower() == clean_char_id:
                            # Отримуємо актуальну локацію зі збереження
                            loc = meta.get("current_location", "Невідомий ліс")
                            save_file = os.path.join(c_dir, "savegame.json")
                            if os.path.exists(save_file):
                                try:
                                    with open(save_file, "r", encoding="utf-8") as sf:
                                        s_data = json.load(sf)
                                        loc = s_data.get("meta", {}).get("location") or loc
                                except Exception:
                                    pass

                            campaigns.append(CampaignSummary(
                                campaign_id=meta.get("campaign_id", entry),
                                char_id=clean_char_id,
                                title=meta.get("title", "Пригода"),
                                current_location=loc,
                                is_pinned=meta.get("is_pinned", False),
                                created_at=meta.get("created_at", ""),
                                last_played=meta.get("last_played", "")
                            ))
                    except Exception as e:
                        print(f"⚠️ Помилка зчитування метаданих кампанії {entry}: {e}")

        # Сортування: is_pinned (True йде першим), потім last_played спаданням
        campaigns.sort(key=lambda c: (not c.is_pinned, c.last_played), reverse=False)
        # Оскільки not c.is_pinned робить False першим (тобто True спочатку), але для дати нам треба спадання:
        campaigns.sort(key=lambda c: (0 if c.is_pinned else 1, c.last_played), reverse=False)
        # Більш явне сортування:
        pinned = [c for c in campaigns if c.is_pinned]
        unpinned = [c for c in campaigns if not c.is_pinned]
        pinned.sort(key=lambda c: c.last_played, reverse=True)
        unpinned.sort(key=lambda c: c.last_played, reverse=True)
        return pinned + unpinned

    async def create_campaign(
        self,
        char_id: str,
        title: Optional[str],
        narrator_generator
    ) -> CampaignSummary:
        """
        Створює нову кампанію на основі заготовки персонажа:
        1. Завантажує базовий стан героя;
        2. Ініціалізує папку data/saves/{campaign_id}/;
        3. Генерує вступний пост Оповідача (Intro Post) на основі біографії героя;
        4. Записує вступ як перше повідомлення в history.json.
        """
        clean_char_id = self._sanitize_id(char_id)
        if clean_char_id.startswith("_template"):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Заборонено створювати ігрову кампанію з системного шаблону '_template'!"
            )

        # 1. Завантажуємо базовий стан героя
        char_state = self.character_manager.get_character(clean_char_id)

        # 2. Формуємо унікальний ID кампанії
        now = datetime.now(timezone.utc)
        now_iso = now.isoformat()
        campaign_slug = self._sanitize_id(title) if title else "run"
        campaign_id = f"{clean_char_id}_{campaign_slug}_{int(now.timestamp())}"
        c_dir = self.get_campaign_dir(campaign_id)
        os.makedirs(c_dir, exist_ok=True)

        # 3. Копіюємо стан персонажа у savegame.json та savegame.prev.json кампанії
        savegame_path = os.path.join(c_dir, "savegame.json")
        savegame_prev_path = os.path.join(c_dir, "savegame.prev.json")
        with open(savegame_path, "w", encoding="utf-8") as f:
            json.dump(char_state.model_dump(), f, ensure_ascii=False, indent=4)
        with open(savegame_prev_path, "w", encoding="utf-8") as f:
            json.dump(char_state.model_dump(), f, ensure_ascii=False, indent=4)

        # 4. Авто-генерація вступного художнього посту Оповідача
        char_meta = char_state.meta
        intro_prompt = (
            f"Створи стартовий художній вступ (зав'язку нової пригоди) для початку гри. "
            f"Персонаж: {char_meta.name}. Передісторія: {char_meta.background or 'Мандрівник'}. "
            f"Стартова локація: {char_meta.location or 'Занедбана місцевість'}. "
            f"Зовнішність: {char_meta.appearance or 'Непримітний вигляд'}. "
            f"Опиши похмуру, напружену атмосферу навколо, в якому стані персонаж зустрічає цей момент, "
            f"та одну конкретну стартову подію чи загрозу, що вимагає негайної дії гравця. "
            f"Починай одразу з художнього тексту, без жодних привітань."
        )

        intro_text = await narrator_generator(intro_prompt, json.dumps(char_state.model_dump(), ensure_ascii=False))

        # 5. Ініціалізуємо history.json та chat_log.json зі вступним постом
        history_path = os.path.join(c_dir, "history.json")
        chat_log_path = os.path.join(c_dir, "chat_log.json")

        history_service = HistoryService(history_path)
        history_service.add_intro_post(intro_text)

        chat_log_service = ChatLogService(chat_log_path)
        chat_log_service.add_message(role="narrator", text=intro_text, timestamp=now_iso)

        self._history_cache[campaign_id] = history_service
        self._chat_log_cache[campaign_id] = chat_log_service
        self._state_cache[campaign_id] = GameState(savegame_path)

        # 6. Зберігаємо metadata.json
        campaign_title = title.strip() if title and title.strip() else f"Пригода {char_meta.name}"
        metadata = {
            "campaign_id": campaign_id,
            "char_id": clean_char_id,
            "title": campaign_title,
            "current_location": char_meta.location or "Невідомий ліс",
            "is_pinned": False,
            "created_at": now_iso,
            "last_played": now_iso
        }
        with open(os.path.join(c_dir, "metadata.json"), "w", encoding="utf-8") as f:
            json.dump(metadata, f, ensure_ascii=False, indent=4)

        return CampaignSummary(
            campaign_id=campaign_id,
            char_id=clean_char_id,
            title=campaign_title,
            current_location=char_meta.location or "Невідомий ліс",
            is_pinned=False,
            created_at=now_iso,
            last_played=now_iso
        )

    def pin_campaign(self, campaign_id: str, is_pinned: bool) -> CampaignSummary:
        """Змінює статус закріплення кампанії."""
        clean_id = self._sanitize_id(campaign_id)
        c_dir = self.get_campaign_dir(clean_id)
        meta_path = os.path.join(c_dir, "metadata.json")

        if not os.path.exists(meta_path):
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Кампанію '{campaign_id}' не знайдено."
            )

        with open(meta_path, "r", encoding="utf-8") as f:
            meta = json.load(f)

        meta["is_pinned"] = is_pinned
        with open(meta_path, "w", encoding="utf-8") as f:
            json.dump(meta, f, ensure_ascii=False, indent=4)

        return CampaignSummary.model_validate(meta)

    def delete_campaign(self, campaign_id: str) -> bool:
        """Видаляє кампанію з диска."""
        clean_id = self._sanitize_id(campaign_id)
        c_dir = self.get_campaign_dir(clean_id)

        if not os.path.exists(c_dir):
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Кампанію '{campaign_id}' не знайдено."
            )

        # Очищення кешу
        self._state_cache.pop(clean_id, None)
        self._history_cache.pop(clean_id, None)
        self._chat_log_cache.pop(clean_id, None)

        shutil.rmtree(c_dir, ignore_errors=True)
        return True

    def get_campaign_history(self, campaign_id: str) -> List[HistoryMessage]:
        """Повертає повну хронологічну історію повідомлень кампанії виключно з chat_log.json."""
        clean_id = self._sanitize_id(campaign_id)
        chat_log_service = self.get_chat_log(clean_id)
        return chat_log_service.get_history_messages()

    def rollback_campaign_turn(self, campaign_id: str) -> Tuple[str, Dict[str, Any]]:
        """
        Виконує відкат останнього ходу кампанії (Undo, v1.4.0):
        1. Видаляє останній пост Оповідача та дію гравця з chat_log.json;
        2. Видаляє останній хід з history.json;
        3. Відновлює стан героя з savegame.prev.json;
        4. Повертає (previous_user_input, current_state_dict).
        """
        clean_id = self._sanitize_id(campaign_id)
        c_dir = self.get_campaign_dir(clean_id)
        if not os.path.exists(c_dir):
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Кампанію '{campaign_id}' не знайдено."
            )

        state, hist, chat_log = self.get_campaign_session(clean_id)

        # 1. Відкат у chat_log.json
        prev_user_input = chat_log.rollback_last_turn() or ""

        # 2. Відкат у history.json
        hist_input = hist.rollback_last_turn()
        if not prev_user_input and hist_input:
            prev_user_input = hist_input

        # 3. Відкат збереження
        state.rollback_snapshot()

        # 4. Оновлюємо дату останнього оновлення та локацію
        new_loc = state.get_current_state().get("meta", {}).get("location")
        self.touch_campaign_played(clean_id, new_loc)

        return prev_user_input, state.get_current_state()
