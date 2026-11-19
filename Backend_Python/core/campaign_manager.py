import copy
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
from core.world_manager import WorldManager, DEFAULT_WORLD_ID
from core.slugify import slugify_ascii, ensure_unique_slug, sanitize_strict_ascii_id

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SAVES_DIR = os.path.join(BASE_DIR, "data", "saves")
MAX_TURN_SNAPSHOTS = 100


class CampaignManager:
    """
    Керує ігровими Кампаніями (чатами) у data/saves/{campaign_id}/.
    Кожна кампанія прив'язана до заготовки персонажа (char_id) та підтримує
    незалежні збереження, історію, статус закріплення (is_pinned) та авто-вступ.
    """
    def __init__(
        self,
        saves_dir: Optional[str] = None,
        character_manager: Optional[CharacterManager] = None,
        world_manager: Optional[WorldManager] = None,
    ):
        self.saves_dir = saves_dir or SAVES_DIR
        self.character_manager = character_manager or CharacterManager()
        self.world_manager = world_manager or WorldManager(saves_dir=self.saves_dir, characters_dir=self.character_manager.characters_dir)
        os.makedirs(self.saves_dir, exist_ok=True)
        self._state_cache: Dict[str, GameState] = {}
        self._history_cache: Dict[str, HistoryService] = {}
        self._chat_log_cache: Dict[str, ChatLogService] = {}
        self._world_cache: Dict[str, str] = {}
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
                    "world_id": DEFAULT_WORLD_ID,
                    "title": "Основна пригода Айвена",
                    "current_location": "Вулиця покинутого селища",
                    "is_pinned": True,
                    "created_at": now_iso,
                    "last_played": now_iso
                }
                with open(meta_path, "w", encoding="utf-8") as f:
                    json.dump(meta, f, ensure_ascii=False, indent=4)

    def get_campaign_world_id(self, campaign_id: str) -> str:
        """Повертає world_id для кампанії з кешу, metadata.json або пов'язаного персонажа."""
        clean_id = self._sanitize_id(campaign_id)
        if clean_id in self._world_cache:
            return self._world_cache[clean_id]

        c_dir = self.get_campaign_dir(clean_id)
        meta_path = os.path.join(c_dir, "metadata.json")
        world_id: Optional[str] = None
        char_id: Optional[str] = None

        if os.path.isfile(meta_path):
            try:
                with open(meta_path, "r", encoding="utf-8") as f:
                    meta = json.load(f)
                world_id = meta.get("world_id")
                char_id = meta.get("char_id")
            except Exception:
                pass

        if not world_id and char_id:
            try:
                char_state = self.character_manager.get_character(char_id)
                world_id = char_state.get("meta", {}).get("world_id")
            except Exception:
                pass

        resolved = world_id or DEFAULT_WORLD_ID
        self._world_cache[clean_id] = resolved
        return resolved

    def _sanitize_id(self, raw_id: str) -> str:
        return sanitize_strict_ascii_id(raw_id, default="campaign", max_length=96)

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
                                world_id=meta.get("world_id") or DEFAULT_WORLD_ID,
                                title=meta.get("title", "Пригода"),
                                current_location=loc,
                                is_pinned=meta.get("is_pinned", False),
                                created_at=meta.get("created_at", ""),
                                last_played=meta.get("last_played", ""),
                                rollback_depth=self.get_rollback_depth(meta.get("campaign_id", entry))
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

        # 1. Завантажуємо базовий стан героя та world_id
        char_state = self.character_manager.get_character(clean_char_id)
        char_meta = char_state.get("meta", {}) if isinstance(char_state, dict) else {}
        world_id = char_meta.get("world_id") or DEFAULT_WORLD_ID

        world_passport = (
            self.world_manager.get_world_passport(world_id)
            if self.world_manager and self.world_manager.world_exists(world_id)
            else {}
        )
        world_ai = world_passport.get("ai_prompts") or {}
        world_tone = world_ai.get("world_tone") or "Відповідна до канону та жанру світу напружена атмосфера"
        starting_locations = world_passport.get("starting_locations") or []

        # 2. Формуємо унікальний ASCII ID кампанії
        now = datetime.now(timezone.utc)
        now_iso = now.isoformat()
        char_slug = slugify_ascii(clean_char_id, default="hero", max_length=24)
        title_slug = slugify_ascii(title, default="run", max_length=24) if title else "run"
        existing_saves = os.listdir(self.saves_dir) if os.path.exists(self.saves_dir) else []
        campaign_id = ensure_unique_slug(f"{char_slug}_{title_slug}_{int(now.timestamp())}", existing_saves)
        c_dir = self.get_campaign_dir(campaign_id)
        os.makedirs(c_dir, exist_ok=True)

        # 3. Копіюємо стан персонажа у savegame.json та ініціалізуємо порожній стек turn_snapshots.json
        savegame_path = os.path.join(c_dir, "savegame.json")
        state_dump = dict(char_state)
        with open(savegame_path, "w", encoding="utf-8") as f:
            json.dump(state_dump, f, ensure_ascii=False, indent=4)
        self._save_turn_snapshots(c_dir, [])

        # 4. Авто-генерація вступного художнього посту Оповідача в тоні обраного світу
        raw_loc = char_meta.get("location")
        start_location = (
            raw_loc
            if raw_loc and raw_loc != "Невідомий ліс"
            else (starting_locations[0] if starting_locations else (raw_loc or "Стартова локація"))
        )
        char_name = char_meta.get("name") or clean_char_id
        intro_prompt = (
            f"Створи стартовий художній вступ (зав'язку нової пригоди) для початку гри у світі '{world_passport.get('title', world_id)}'. "
            f"Персонаж: {char_name}. Біографія та походження: {char_meta.get('biography') or char_meta.get('background') or 'Мандрівник'}. "
            f"Стартова локація: {start_location}. "
            f"Зовнішність: {char_meta.get('appearance') or 'Непримітний вигляд'}. "
            f"Тон світу: {world_tone}. "
            f"Опиши відповідну світу атмосферу навколо, в якому стані персонаж зустрічає цей момент, "
            f"та одну конкретну стартову подію чи виклик, що вимагає негайної дії гравця. "
            f"Починай одразу з художнього тексту, без жодних привітань."
        )

        # Очищаємо службові поля перед передачею в LLM
        clean_state_dict = dict(state_dump)
        clean_state_dict.pop("_schema_meta", None)
        if isinstance(clean_state_dict.get("meta"), dict):
            clean_meta = dict(clean_state_dict["meta"])
            clean_meta.pop("avatar", None)
            clean_state_dict["meta"] = clean_meta

        intro_text = await narrator_generator(
            intro_prompt,
            json.dumps(clean_state_dict, ensure_ascii=False),
            world_id,
        )

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
        self._world_cache[campaign_id] = world_id

        # 6. Зберігаємо metadata.json
        campaign_title = title.strip() if title and title.strip() else f"Пригода {char_name}"
        metadata = {
            "campaign_id": campaign_id,
            "char_id": clean_char_id,
            "world_id": world_id,
            "title": campaign_title,
            "current_location": start_location,
            "is_pinned": False,
            "created_at": now_iso,
            "last_played": now_iso
        }
        with open(os.path.join(c_dir, "metadata.json"), "w", encoding="utf-8") as f:
            json.dump(metadata, f, ensure_ascii=False, indent=4)

        return CampaignSummary(
            campaign_id=campaign_id,
            char_id=clean_char_id,
            world_id=world_id,
            title=campaign_title,
            current_location=start_location,
            is_pinned=False,
            created_at=now_iso,
            last_played=now_iso,
            rollback_depth=0
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

        meta["rollback_depth"] = self.get_rollback_depth(clean_id)
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
        self._world_cache.pop(clean_id, None)

        shutil.rmtree(c_dir, ignore_errors=True)
        return True

    def update_campaign_state(self, campaign_id: str, new_state: Dict[str, Any]) -> Dict[str, Any]:
        """
        Ручне оновлення живого стану сейву кампанії (Режим B, v2.0.0):
        - Перевіряє існування кампанії (404, якщо не існує);
        - Синхронно оновлює кеш _state_cache та savegame.json через replace_state (зі snapshot);
        - Синхронізує current_location і last_played у metadata.json.
        """
        clean_id = self._sanitize_id(campaign_id)
        c_dir = self.get_campaign_dir(clean_id)
        has_meta = os.path.isfile(os.path.join(c_dir, "metadata.json"))
        has_save = os.path.isfile(os.path.join(c_dir, "savegame.json"))
        if not (os.path.isdir(c_dir) and (has_meta or has_save)):
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Кампанію '{campaign_id}' не знайдено."
            )

        game_state, _, _ = self.get_campaign_session(clean_id)
        saved_state = game_state.replace_state(new_state)

        new_location = (saved_state.get("meta") or {}).get("location")
        self.touch_campaign_played(clean_id, new_location)
        return saved_state

    def get_campaign_history(self, campaign_id: str) -> List[HistoryMessage]:
        """Повертає повну хронологічну історію повідомлень кампанії виключно з chat_log.json."""
        clean_id = self._sanitize_id(campaign_id)
        chat_log_service = self.get_chat_log(clean_id)
        return chat_log_service.get_history_messages()

    def _snapshots_path(self, c_dir: str) -> str:
        return os.path.join(c_dir, "turn_snapshots.json")

    def _load_turn_snapshots(self, c_dir: str) -> Optional[List[Dict[str, Any]]]:
        """Повертає список знімків або None, якщо файл turn_snapshots.json ще не створений (legacy-сейв)."""
        path = self._snapshots_path(c_dir)
        if not os.path.exists(path):
            return None
        try:
            with open(path, "r", encoding="utf-8") as f:
                data = json.load(f)
            return data if isinstance(data, list) else []
        except Exception as e:
            print(f"[CampaignManager] Помилка читання turn_snapshots.json: {e}")
            return []

    def _save_turn_snapshots(self, c_dir: str, snapshots: List[Dict[str, Any]]) -> None:
        """Зберігає стек знімків (обрізаючи до MAX_TURN_SNAPSHOTS) атомарно через тимчасовий файл."""
        trimmed = snapshots[-MAX_TURN_SNAPSHOTS:] if len(snapshots) > MAX_TURN_SNAPSHOTS else snapshots
        path = self._snapshots_path(c_dir)
        tmp_path = path + ".tmp"
        with open(tmp_path, "w", encoding="utf-8") as f:
            json.dump(trimmed, f, ensure_ascii=False, indent=2)
        os.replace(tmp_path, path)

    def _count_player_turns_for_dir(self, c_dir: str, clean_id: str) -> int:
        if clean_id in self._chat_log_cache:
            return self._chat_log_cache[clean_id].count_player_turns()
        chat_path = os.path.join(c_dir, "chat_log.json")
        if not os.path.exists(chat_path):
            return 0
        try:
            with open(chat_path, "r", encoding="utf-8") as f:
                data = json.load(f)
            if isinstance(data, list):
                return sum(1 for m in data if isinstance(m, dict) and m.get("role") == "player")
        except Exception:
            pass
        return 0

    def get_rollback_depth(self, campaign_id: str, chat_log_service: Optional[ChatLogService] = None) -> int:
        """Повертає доступну кількість послідовних кроків відкату для кампанії."""
        clean_id = self._sanitize_id(campaign_id)
        c_dir = self.get_campaign_dir(clean_id)
        if not os.path.exists(c_dir):
            return 0

        player_turns = (
            chat_log_service.count_player_turns()
            if chat_log_service is not None
            else self._count_player_turns_for_dir(c_dir, clean_id)
        )
        if player_turns <= 0:
            return 0

        snapshots = self._load_turn_snapshots(c_dir)
        if snapshots is not None:
            return min(len(snapshots), player_turns)

        # Legacy fallback: старі кампанії без turn_snapshots.json мають 1 крок через savegame.prev.json
        if os.path.exists(os.path.join(c_dir, "savegame.prev.json")):
            return 1
        return 0

    def push_turn_snapshot(
        self,
        campaign_id: str,
        state_snapshot: Dict[str, Any],
        history_snapshot: Dict[str, Any]
    ) -> int:
        """Додає pre-turn знімок (стан + історія) у LIFO-стек turn_snapshots.json після успішного ходу."""
        clean_id = self._sanitize_id(campaign_id)
        c_dir = self.get_campaign_dir(clean_id)
        if not os.path.exists(c_dir):
            return 0

        snapshots = self._load_turn_snapshots(c_dir)
        if snapshots is None:
            snapshots = []

        snapshots.append({
            "state": copy.deepcopy(state_snapshot),
            "history": copy.deepcopy(history_snapshot)
        })
        if len(snapshots) > MAX_TURN_SNAPSHOTS:
            snapshots = snapshots[-MAX_TURN_SNAPSHOTS:]

        self._save_turn_snapshots(c_dir, snapshots)
        return len(snapshots)

    def rollback_campaign_turn(self, campaign_id: str) -> Tuple[str, Dict[str, Any], int]:
        """
        Виконує багатокроковий атомарний відкат ходу кампанії (LIFO через turn_snapshots.json):
        1. Забороняє відкат вступного поста або порожнього стеку (HTTP 409 Conflict);
        2. Відновлює chat_log.json (видаляючи лише останню пару player + narrator);
        3. Відновлює history.json (включно з summary та recent_messages) і savegame.json зі знімка;
        4. Повертає (previous_user_input, current_state_dict, remaining_depth).
        """
        clean_id = self._sanitize_id(campaign_id)
        c_dir = self.get_campaign_dir(clean_id)
        if not os.path.exists(c_dir):
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Кампанію '{campaign_id}' не знайдено."
            )

        state, hist, chat_log = self.get_campaign_session(clean_id)

        if chat_log.count_player_turns() <= 0:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Немає ходів гравця для відкату: вступне повідомлення не можна видалити."
            )

        snapshots = self._load_turn_snapshots(c_dir)

        if snapshots is not None:
            if len(snapshots) == 0:
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail="Стек знімків порожній: попередні кроки для відкату відсутні."
                )

            snapshot = snapshots.pop()
            prev_user_input = chat_log.rollback_last_turn() or ""

            hist_snap = snapshot.get("history")
            if isinstance(hist_snap, dict):
                hist.restore_snapshot(hist_snap)
            else:
                hist_input = hist.rollback_last_turn()
                if not prev_user_input and hist_input:
                    prev_user_input = hist_input

            state_snap = snapshot.get("state")
            if isinstance(state_snap, dict):
                state.restore_state_dict(state_snap)

            self._save_turn_snapshots(c_dir, snapshots)
            remaining_depth = self.get_rollback_depth(clean_id, chat_log_service=chat_log)
        else:
            # Одноразовий legacy fallback через savegame.prev.json
            prev_path = os.path.join(c_dir, "savegame.prev.json")
            if not os.path.exists(prev_path):
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail="Немає доступних знімків для відкату."
                )

            prev_user_input = chat_log.rollback_last_turn() or ""
            hist_input = hist.rollback_last_turn()
            if not prev_user_input and hist_input:
                prev_user_input = hist_input

            state.rollback_snapshot()
            self._save_turn_snapshots(c_dir, [])
            try:
                os.remove(prev_path)
            except OSError:
                pass
            remaining_depth = 0

        # Оновлюємо дату останнього оновлення та локацію
        new_loc = state.get_current_state().get("meta", {}).get("location")
        self.touch_campaign_played(clean_id, new_loc)

        return prev_user_input, state.get_current_state(), remaining_depth
