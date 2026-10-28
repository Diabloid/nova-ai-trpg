import os
import sys
import json
from datetime import datetime, timezone
from typing import List, Dict, Optional, Any

# Безпечне кодування консолі для Windows
if sys.stdout and hasattr(sys.stdout, "reconfigure"):
    try:
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass

from schemas.game_dto import HistoryMessage


class ChatLogService:
    """
    Відповідає за збереження та надання повного, нестисненого хронологічного
    журналу повідомлень гри (chat_log.json) для клієнтського інтерфейсу (як у Telegram).
    На відміну від history.json (який слугує ковзним буфером для LLM),
    цей журнал зберігає ВСІ репліки від початку кампанії і ніколи не стискається нейромережею.
    """
    def __init__(self, chat_log_path: str, legacy_history_path: Optional[str] = None):
        self.chat_log_path = chat_log_path
        self.legacy_history_path = legacy_history_path
        self.messages: List[Dict[str, str]] = []
        self.load()

    def load(self):
        """Завантажує повний лог чату або мігрує з legacy history.json."""
        if os.path.exists(self.chat_log_path):
            try:
                with open(self.chat_log_path, "r", encoding="utf-8") as f:
                    data = json.load(f)
                    if isinstance(data, list):
                        self.messages = data
                    else:
                        self.messages = []
                print(f"📖 [ChatLogService] Завантажено {len(self.messages)} повідомлень із chat_log.json.")
                return
            except Exception as e:
                print(f"⚠️ [ChatLogService] Помилка читання {self.chat_log_path}: {e}")
                self.messages = []

        # Авто-міграція з legacy history.json при першому запуску після відокремлення
        if self.legacy_history_path and os.path.exists(self.legacy_history_path):
            try:
                with open(self.legacy_history_path, "r", encoding="utf-8") as f:
                    h_data = json.load(f)

                migrated: List[Dict[str, str]] = []
                # Варіант 1: поле messages
                raw_msgs = h_data.get("messages")
                if raw_msgs and isinstance(raw_msgs, list):
                    for m in raw_msgs:
                        role = m.get("role", "narrator")
                        if role in ("assistant", "gm"):
                            role = "narrator"
                        elif role in ("user",):
                            role = "player"
                        migrated.append({
                            "role": role,
                            "text": m.get("text") or m.get("content", ""),
                            "timestamp": m.get("timestamp") or datetime.now(timezone.utc).isoformat()
                        })

                # Варіант 2: якщо messages порожній, але є recent_messages
                if not migrated and h_data.get("recent_messages"):
                    now_iso = datetime.now(timezone.utc).isoformat()
                    for m in h_data.get("recent_messages", []):
                        role = "player" if m.get("role") == "user" else "narrator"
                        migrated.append({
                            "role": role,
                            "text": m.get("content", ""),
                            "timestamp": now_iso
                        })

                if migrated:
                    self.messages = migrated
                    self.save()
                    print(f"📦 [ChatLogService] Успішно мігровано {len(self.messages)} повідомлень у chat_log.json.")
                    return
            except Exception as e:
                print(f"⚠️ [ChatLogService] Помилка міграції з legacy history.json: {e}")

        self.messages = []

    def save(self):
        """Зберігає повний лог повідомлень на диск."""
        os.makedirs(os.path.dirname(self.chat_log_path), exist_ok=True)
        with open(self.chat_log_path, "w", encoding="utf-8") as f:
            json.dump(self.messages, f, ensure_ascii=False, indent=4)

    def add_message(self, role: str, text: str, timestamp: Optional[str] = None):
        """
        Додає одне повідомлення (вступний пост, репліка чи системне повідомлення)
        у повний журнал чату.
        """
        clean_role = role.lower()
        if clean_role in ("user", "player"):
            clean_role = "player"
        elif clean_role in ("system",):
            clean_role = "system"
        else:
            clean_role = "narrator"

        ts = timestamp or datetime.now(timezone.utc).isoformat()
        self.messages.append({
            "role": clean_role,
            "text": text,
            "timestamp": ts
        })
        self.save()

    def add_turn(self, player_text: str, narrator_text: str, timestamp: Optional[str] = None):
        """
        Додає завершений ігровий хід (дія гравця + відповідь Оповідача)
        у хронологічному порядку.
        """
        ts = timestamp or datetime.now(timezone.utc).isoformat()
        self.messages.append({
            "role": "player",
            "text": player_text,
            "timestamp": ts
        })
        self.messages.append({
            "role": "narrator",
            "text": narrator_text,
            "timestamp": ts
        })
        self.save()

    def rollback_last_turn(self) -> Optional[str]:
        """
        Видаляє останній завершений хід (останнє повідомлення Оповідача та дію гравця)
        із повного нестисненого журналу chat_log.json (Undo).
        Повертає текст скасованої дії гравця для повернення в поле введення.
        """
        last_player_text: Optional[str] = None
        # Стандартна послідовність: в кінці пара (player, narrator)
        if (
            len(self.messages) >= 2
            and self.messages[-1].get("role") == "narrator"
            and self.messages[-2].get("role") == "player"
        ):
            self.messages.pop()  # видаляємо narrator
            player_msg = self.messages.pop()  # видаляємо player
            last_player_text = player_msg.get("text", "")
            self.save()
            print("↩️ [ChatLogService] Останній хід успішно видалено з chat_log.json.")
        elif self.messages:
            # Нестандартна ситуація (наприклад, одиночний хід без пари)
            removed = self.messages.pop()
            if self.messages and self.messages[-1].get("role") == "player":
                player_msg = self.messages.pop()
                last_player_text = player_msg.get("text", "")
            elif removed.get("role") == "player":
                last_player_text = removed.get("text", "")
            self.save()

        return last_player_text

    def get_messages(self) -> List[Dict[str, str]]:
        """Повертає сирий список словників повідомлень."""
        return self.messages

    def get_history_messages(self) -> List[HistoryMessage]:
        """Повертає типізований список HistoryMessage згідно з API контрактом."""
        result: List[HistoryMessage] = []
        now_iso = datetime.now(timezone.utc).isoformat()
        for m in self.messages:
            role = m.get("role", "narrator")
            if role in ("assistant", "gm"):
                role = "narrator"
            elif role in ("user",):
                role = "player"

            result.append(HistoryMessage(
                role=role,
                text=m.get("text") or m.get("content", ""),
                timestamp=m.get("timestamp") or now_iso
            ))
        return result
