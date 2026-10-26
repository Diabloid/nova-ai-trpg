import os
import sys
import shutil
from typing import Dict, Tuple, List, Any, Optional

# Безпечне кодування консолі для Windows
if sys.stdout and hasattr(sys.stdout, "reconfigure"):
    try:
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass

from core.state_manager import GameState
from core.services.history_service import HistoryService

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SAVES_DIR = os.path.join(BASE_DIR, "data", "saves")


class SessionManager:
    """
    Керує незалежними ігровими сесіями та їхніми збереженнями (data/saves/{session_id}/).
    Дозволяє підтримувати ізольовані збереження для різних гравців або слотів гри.
    """
    def __init__(self, saves_dir: Optional[str] = None):
        self.saves_dir = saves_dir or SAVES_DIR
        os.makedirs(self.saves_dir, exist_ok=True)
        self._state_cache: Dict[str, GameState] = {}
        self._history_cache: Dict[str, HistoryService] = {}

    def _get_session_dir(self, session_id: str) -> str:
        # Безпека імені папки (тільки алфавітно-цифрові символи, дефіс, підкреслення)
        clean_id = "".join(c for c in session_id if c.isalnum() or c in ("-", "_")).strip()
        if not clean_id:
            clean_id = "default"
        return os.path.join(self.saves_dir, clean_id)

    def get_session(self, session_id: str = "default") -> Tuple[GameState, HistoryService]:
        """
        Повертає екземпляри (GameState, HistoryService) для вказаної сесії.
        Кешує їх в оперативній пам'яті для уникнення повторного зчитування.
        """
        clean_id = session_id if session_id else "default"
        session_dir = self._get_session_dir(clean_id)
        os.makedirs(session_dir, exist_ok=True)

        savegame_path = os.path.join(session_dir, "savegame.json")
        history_path = os.path.join(session_dir, "history.json")

        # Зворотна сумісність: якщо це default-сесія і в корені saves/ лежить старий файл
        root_save = os.path.join(self.saves_dir, "savegame.json")
        root_hist = os.path.join(self.saves_dir, "history.json")
        if clean_id == "default" and not os.path.exists(savegame_path) and os.path.exists(root_save):
            shutil.copy2(root_save, savegame_path)
            if os.path.exists(root_hist):
                shutil.copy2(root_hist, history_path)

        if clean_id not in self._state_cache:
            self._state_cache[clean_id] = GameState(save_path=savegame_path)

        if clean_id not in self._history_cache:
            self._history_cache[clean_id] = HistoryService(history_file_path=history_path)

        return self._state_cache[clean_id], self._history_cache[clean_id]

    def list_sessions(self) -> List[Dict[str, Any]]:
        """Повертає список доступних ігрових сесій та збережень."""
        sessions = []
        if not os.path.exists(self.saves_dir):
            return sessions

        for name in os.listdir(self.saves_dir):
            full_path = os.path.join(self.saves_dir, name)
            if os.path.isdir(full_path):
                save_file = os.path.join(full_path, "savegame.json")
                char_name = "Невідомо"
                location = "Невідомо"
                if os.path.exists(save_file):
                    try:
                        import json
                        with open(save_file, "r", encoding="utf-8") as f:
                            d = json.load(f)
                            char_name = d.get("meta", {}).get("name", "Мандрівник")
                            location = d.get("meta", {}).get("location", "Невідомо")
                    except Exception:
                        pass

                sessions.append({
                    "session_id": name,
                    "character_name": char_name,
                    "location": location,
                    "path": full_path
                })
        return sessions

    def reset_session(self, session_id: str) -> GameState:
        """Скидає стан вказаної сесії до дефолтного стартового шаблону."""
        clean_id = session_id if session_id else "default"
        session_dir = self._get_session_dir(clean_id)
        
        savegame_path = os.path.join(session_dir, "savegame.json")
        history_path = os.path.join(session_dir, "history.json")

        if os.path.exists(savegame_path):
            os.remove(savegame_path)
        if os.path.exists(history_path):
            os.remove(history_path)

        # Очищення кешу
        self._state_cache.pop(clean_id, None)
        self._history_cache.pop(clean_id, None)

        state, _ = self.get_session(clean_id)
        return state
