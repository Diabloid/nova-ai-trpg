import os
import sys
import json
from typing import List, Dict, Optional, Any

# Безпечне кодування консолі для Windows
if sys.stdout and hasattr(sys.stdout, "reconfigure"):
    try:
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass


class HistoryService:
    """
    Відповідає виключно за управління внутрішнім робочим контекстом діалогу LLM
    (recent_messages), сумаризацією (summary), персистентністю в history.json
    та транзакційністю ходів.
    НЕ використовується для виведення історії в UI клієнта (для цього створено ChatLogService).
    """
    def __init__(self, history_file_path: str):
        self.history_file_path = history_file_path
        self.summary: str = ""
        self.recent_messages: List[Dict[str, str]] = []
        self._staged_turn: Optional[Dict[str, str]] = None

        self.load()

    def load(self):
        """Завантажує робочий буфер LLM з history.json."""
        if os.path.exists(self.history_file_path):
            try:
                with open(self.history_file_path, "r", encoding="utf-8") as f:
                    data = json.load(f)
                    self.summary = data.get("summary", "")
                    self.recent_messages = data.get("recent_messages", [])

                print(f"🧠 [HistoryService] Завантажено контекст LLM: {len(self.recent_messages)} робочих повідомлень.")
            except Exception as e:
                print(f"⚠️ [HistoryService] Помилка читання історії: {e}")
                self.summary = ""
                self.recent_messages = []
        else:
            self.summary = ""
            self.recent_messages = []

    def save(self):
        """Зберігає виключно контекст LLM (summary + recent_messages) на диск."""
        os.makedirs(os.path.dirname(self.history_file_path), exist_ok=True)
        with open(self.history_file_path, "w", encoding="utf-8") as f:
            json.dump({
                "summary": self.summary,
                "recent_messages": self.recent_messages
            }, f, ensure_ascii=False, indent=4)

    def add_intro_post(self, intro_text: str):
        """Додає початковий вступний пост Оповідача в робочий буфер LLM."""
        self.recent_messages = [{"role": "assistant", "content": intro_text}]
        self.save()

    # ==========================================
    # Транзакційний механізм (Stage / Commit / Rollback)
    # ==========================================

    def stage_turn(self, user_content: str, assistant_content: str):
        """Тимчасово фіксує хід у буфері оперативної пам'яті."""
        self._staged_turn = {
            "user": user_content,
            "assistant": assistant_content
        }
        print("📝 [HistoryService] Хід підготовлено (Staged), очікується валідація стану.")

    def rollback_staged_turn(self):
        """Скасовує підготовлений хід."""
        if self._staged_turn:
            print("↩️ [HistoryService] Відкат транзакції: підготовлений хід відкинуто.")
            self._staged_turn = None

    async def commit_staged_turn(self, llm_provider=None, prompt_service=None, chat_log_service=None):
        """
        Фіксує хід у робочій пам'яті LLM, синхронізує з ChatLogService (якщо передано)
        та зберігає стан history.json на диску.
        """
        if not self._staged_turn:
            return

        u_text = self._staged_turn["user"]
        a_text = self._staged_turn["assistant"]

        # Синхронізація з повним нестислим логом чату для клієнта
        if chat_log_service:
            chat_log_service.add_turn(player_text=u_text, narrator_text=a_text)

        # Робочий ковзний буфер для генерацій LLM
        self.recent_messages.append({"role": "user", "content": u_text})
        self.recent_messages.append({"role": "assistant", "content": a_text})

        self._staged_turn = None

        if llm_provider and prompt_service:
            await self._compress_history_if_needed(llm_provider, prompt_service)

        self.save()
        print("💾 [HistoryService] Хід зафіксовано (Committed) у буфері LLM.")

    async def _compress_history_if_needed(self, llm_provider, prompt_service):
        """Архіватор історії: стискає перші 6 робочих повідомлень при перевищенні 20."""
        MAX_MESSAGES = 20
        COMPRESS_COUNT = 6

        if len(self.recent_messages) > MAX_MESSAGES:
            print("🔄 [HistoryService] Запуск ШІ-Архіватора для компресії робочого контексту...")
            to_compress = self.recent_messages[:COMPRESS_COUNT]
            archivist_system = prompt_service.build_summary_system_prompt()
            chat_to_summarize = "\n".join([f"{m['role'].upper()}: {m['content']}" for m in to_compress])

            user_prompt = (
                f"ПОТОЧНИЙ ПЕРЕКАЗ:\n{self.summary if self.summary else 'Ще немає.'}\n\n"
                f"НОВІ ПОДІЇ ДЛЯ ДОДАВАННЯ:\n{chat_to_summarize}"
            )

            messages = [
                {"role": "system", "content": archivist_system},
                {"role": "user", "content": user_prompt}
            ]

            new_summary = await llm_provider.execute_with_fallback(
                "story",
                messages,
                temperature=0.3,
                max_tokens=600
            )

            if "error" not in new_summary.lower():
                self.summary = new_summary.strip()
                # Зменшуємо recent_messages для оптимізації вікна токенів
                self.recent_messages = self.recent_messages[COMPRESS_COUNT:]
                print("✅ [HistoryService] Робочий контекст успішно стиснуто!")
            else:
                print("⚠️ [HistoryService] Помилка архіватора, компресію відкладено.")
