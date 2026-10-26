import os
import sys
from typing import Dict

# Безпечне кодування консолі для Windows
if sys.stdout and hasattr(sys.stdout, "reconfigure"):
    try:
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass


class PromptService:
    """
    Відповідає за читання, RAM-кешування та формування системних промптів,
    включаючи повний лор всесвіту (43 файли, 250 КБ).
    """
    def __init__(self, prompts_dir: str, lore_dir: str):
        self.prompts_dir = prompts_dir
        self.lore_dir = lore_dir
        self._prompt_cache: Dict[str, str] = {}
        self._cached_lore: str = ""
        self._lore_file_count: int = 0

        # Початкове завантаження в RAM
        self._load_all_lore_to_ram()
        self._preload_prompts()

    def _load_all_lore_to_ram(self):
        """Зчитує всі .txt та .md файли лору в RAM при ініціалізації."""
        combined_lore = []
        count = 0

        if not os.path.exists(self.lore_dir):
            os.makedirs(self.lore_dir, exist_ok=True)
            self._cached_lore = ""
            self._lore_file_count = 0
            return

        for filename in sorted(os.listdir(self.lore_dir)):
            if filename.endswith((".txt", ".md")):
                filepath = os.path.join(self.lore_dir, filename)
                try:
                    with open(filepath, "r", encoding="utf-8") as file:
                        combined_lore.append(f"--- {filename.upper()} ---\n{file.read()}\n")
                        count += 1
                except Exception as e:
                    print(f"⚠️ Помилка зчитування лору {filename}: {e}")

        self._cached_lore = "\n".join(combined_lore)
        self._lore_file_count = count
        lore_kb = len(self._cached_lore.encode("utf-8")) / 1024
        est_tokens = len(self._cached_lore) // 4
        print(f"📚 [PromptService] Завантажено в RAM {count} файлів лору ({lore_kb:.1f} КБ, ~{est_tokens} токенів)")

    def _preload_prompts(self):
        """Попереднє кешування основних шаблонів промптів."""
        for name in ["narrator_system.txt", "state_system.txt", "summary_system.txt"]:
            self.get_prompt(name)

    def get_prompt(self, filename: str) -> str:
        """Отримує промпт з RAM-кешу або читає з диска один раз."""
        if filename in self._prompt_cache:
            return self._prompt_cache[filename]

        filepath = os.path.join(self.prompts_dir, filename)
        try:
            with open(filepath, "r", encoding="utf-8") as file:
                content = file.read()
                self._prompt_cache[filename] = content
                return content
        except FileNotFoundError:
            err = f"Помилка: Файл промпту {filename} не знайдено."
            print(f"⚠️ {err}")
            return err

    def reload_lore(self):
        """Гаряче оновлення бази лору в RAM."""
        print("🔄 Оновлення лору в оперативній пам'яті...")
        self._load_all_lore_to_ram()

    def reload_prompts(self):
        """Очищення та повторне зчитування шаблонів промптів."""
        self._prompt_cache.clear()
        self._preload_prompts()
        print("🔄 Кеш промптів оновлено!")

    @property
    def cached_lore(self) -> str:
        return self._cached_lore

    @property
    def lore_file_count(self) -> int:
        return self._lore_file_count

    def build_narrator_system_prompt(self, player_state_str: str, summary_text: str) -> str:
        """Формує повний системний промпт для Оповідача."""
        system_lore = self.get_prompt("narrator_system.txt")
        world_bible = self._cached_lore
        summary_display = summary_text if summary_text else "Це самий початок історії. Попередніх подій ще не відбулося."

        return (
            f"{system_lore}\n\n"
            f"ГЛОБАЛЬНИЙ ЛОР СВІТУ:\n{world_bible}\n\n"
            f"ЩО БУЛО РАНІШЕ (КОРОТКИЙ ПЕРЕКАЗ):\n{summary_display}\n\n"
            f"ВАЖЛИВО! Поточний стан гравця:\n{player_state_str}"
        )

    def build_state_system_prompt(self, player_state_str: str) -> str:
        """Формує системний промпт для Аналізатора."""
        system_instruction = self.get_prompt("state_system.txt")
        return f"{system_instruction}\n\nВАЖЛИВО! Поточний стан гравця:\n{player_state_str}"

    def build_summary_system_prompt(self) -> str:
        """Повертає системний промпт для Архіватора/Сумаризатора."""
        return self.get_prompt("summary_system.txt")
