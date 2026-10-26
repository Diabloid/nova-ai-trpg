import os
import sys
import json
import re
from typing import Optional, List, Dict, Any
from dotenv import load_dotenv
from openai import AsyncOpenAI

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
load_dotenv(dotenv_path=os.path.join(BASE_DIR, ".env"))


class LLMController:
    def __init__(self):
        self.base_dir = BASE_DIR
        self.history_file = os.path.join(self.base_dir, "data", "saves", "history.json")
        self.prompts_dir = os.path.join(self.base_dir, "data", "prompts")
        self.lore_dir = os.path.join(self.base_dir, "data", "lore")
        
        self.summary = ""
        self.recent_messages: List[Dict[str, str]] = []
        self._prompt_cache: Dict[str, str] = {}
        self._cached_lore: str = ""
        self._lore_file_count: int = 0

        # Завантаження конфігурації провайдерів
        config_path = os.path.join(self.base_dir, "data", "config", "providers.json")
        try:
            with open(config_path, "r", encoding="utf-8") as f:
                self.config = json.load(f)
        except FileNotFoundError:
            print(f"❌ КРИТИЧНА ПОМИЛКА: Файл {config_path} не знайдено!")
            self.config = {"story": [], "state": []}

        # 1. Завантаження історії
        self._load_history()

        # 2. Кешування 43 файлів лору в RAM при старті сервера (Оптимізація I/O)
        self._load_all_lore_to_ram()

        # 3. Кешування системних промптів у RAM
        self._preload_prompts()

    def _load_history(self):
        if os.path.exists(self.history_file):
            try:
                with open(self.history_file, "r", encoding="utf-8") as f:
                    data = json.load(f)
                    self.summary = data.get("summary", "")
                    self.recent_messages = data.get("recent_messages", [])
                print(f"✅ Історію завантажено: {len(self.recent_messages)} повідомлень, переказ: {'Є' if self.summary else 'Немає'}")
            except Exception as e:
                print(f"⚠️ Помилка читання історії: {e}")

    def _save_history(self):
        os.makedirs(os.path.dirname(self.history_file), exist_ok=True)
        with open(self.history_file, "w", encoding="utf-8") as f:
            json.dump({"summary": self.summary, "recent_messages": self.recent_messages}, f, ensure_ascii=False, indent=4)

    def _load_all_lore_to_ram(self):
        """Зчитує всі .txt та .md файли лору в оперативну пам'ять (RAM) ОДИН РАЗ при ініціалізації."""
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
                    print(f"⚠️ Помилка кешування файлу лору {filename}: {e}")

        self._cached_lore = "\n".join(combined_lore)
        self._lore_file_count = count
        lore_size_kb = len(self._cached_lore.encode("utf-8")) / 1024
        est_tokens = len(self._cached_lore) // 4
        print(f"📚 [Кеш Лору] Завантажено в RAM {count} файлів лору ({lore_size_kb:.1f} КБ, ~{est_tokens} токенів)")

    def reload_lore(self):
        """Гаряче перезавантаження лору з диска в RAM за потреби."""
        print("🔄 Оновлення кешу лору в RAM...")
        self._load_all_lore_to_ram()

    def _preload_prompts(self):
        """Кешує основні системні шаблони промптів у RAM."""
        for prompt_name in ["narrator_system.txt", "state_system.txt", "summary_system.txt"]:
            self._read_prompt(prompt_name)

    def _read_prompt(self, filename: str) -> str:
        """Повертає промпт з RAM-кешу, або зчитує з диска один раз."""
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

    def reload_prompts(self):
        """Очищує кеш промптів для повторного зчитування."""
        self._prompt_cache.clear()
        self._preload_prompts()
        print("🔄 Кеш промптів оновлено!")

    async def _compress_history_if_needed(self):
        MAX_MESSAGES = 20  # Ліміт (10 пар)
        COMPRESS_COUNT = 6 # Скільки старих повідомлень беремо (3 пари)

        if len(self.recent_messages) > MAX_MESSAGES:
            print("🔄 Запуск ШІ-Архіватора...")
            to_compress = self.recent_messages[:COMPRESS_COUNT]
            
            archivist_system = self._read_prompt("summary_system.txt")
            chat_to_summarize = "\n".join([f"{m['role'].upper()}: {m['content']}" for m in to_compress])
            
            user_prompt = f"ПОТОЧНИЙ ПЕРЕКАЗ:\n{self.summary if self.summary else 'Ще немає.'}\n\nНОВІ ПОДІЇ ДЛЯ ДОДАВАННЯ:\n{chat_to_summarize}"
            
            messages = [
                {"role": "system", "content": archivist_system},
                {"role": "user", "content": user_prompt}
            ]
            
            new_summary = await self._execute_with_fallback("story", messages, temperature=0.3, max_tokens=600)
            
            if "error" not in new_summary.lower():
                self.summary = new_summary.strip()
                # Видаляємо стиснуті повідомлення з оперативної пам'яті
                self.recent_messages = self.recent_messages[COMPRESS_COUNT:]
                print("✅ Історію стиснуто і переписано!")
            else:
                print("⚠️ Помилка архіватора, відкладаємо стиснення.")

    async def _execute_with_fallback(
        self,
        provider_type: str,
        messages: list,
        temperature: float,
        max_tokens: int,
        response_format: Optional[dict] = None
    ) -> str:
        """
        Багаторівневий маршрутизатор: Провайдер -> Моделі на ньому -> Наступний провайдер.
        Підтримує опціональний response_format={"type": "json_object"} з безпечним відкатом.
        """
        providers = self.config.get(provider_type, [])
        
        for provider in providers:
            api_key = os.getenv(provider["env_key"])
            if not api_key:
                print(f"⚠️ Пропуск {provider['name']}: Ключ {provider['env_key']} відсутній у .env")
                continue
                
            client = AsyncOpenAI(base_url=provider["url"], api_key=api_key)
            
            for model in provider["models"]:
                create_params: Dict[str, Any] = {
                    "model": model,
                    "messages": messages,
                    "temperature": temperature,
                    "max_tokens": max_tokens,
                }
                if response_format:
                    create_params["response_format"] = response_format

                try:
                    response = await client.chat.completions.create(**create_params)
                    content = response.choices[0].message.content
                    return content if content else '{"error": "Порожня відповідь від ШІ"}'
                except Exception as e:
                    err_msg = str(e)
                    # Якщо провайдер/модель відхиляє саме response_format — пробуємо без нього для цієї моделі
                    if response_format and ("response_format" in err_msg.lower() or "json_object" in err_msg.lower()):
                        print(f"⚠️ {provider['name']} ({model}) не підтримує response_format ({err_msg}). Повторюємо запит без нього...")
                        try:
                            create_params_fallback = dict(create_params)
                            del create_params_fallback["response_format"]
                            response = await client.chat.completions.create(**create_params_fallback)
                            content = response.choices[0].message.content
                            return content if content else '{"error": "Порожня відповідь від ШІ"}'
                        except Exception as e_retry:
                            print(f"❌ {provider['name']} ({model}) відмовив і без response_format: {e_retry}")
                    else:
                        print(f"❌ {provider['name']} ({model}) відмовив. Причина: {err_msg}. Пробую наступну модель...")
                    continue
                    
        return '{"error": "Усі резервні API-провайдери та їхні моделі недоступні."}'

    async def generate_story(self, raw_text: str, player_state: str) -> str:
        """
        1-й крок пайплайну: Оповідач генерує художній опис реакції світу на дію гравця.
        Використовує RAM-кешований повний лор світу (43 файли) без звернень до диска.
        """
        system_lore = self._read_prompt("narrator_system.txt")
        world_bible = self._cached_lore
        summary_text = self.summary if self.summary else "Це самий початок історії. Попередніх подій ще не відбулося."
        
        full_system_prompt = (
            f"{system_lore}\n\n"
            f"ГЛОБАЛЬНИЙ ЛОР СВІТУ:\n{world_bible}\n\n"
            f"ЩО БУЛО РАНІШЕ (КОРОТКИЙ ПЕРЕКАЗ):\n{summary_text}\n\n"
            f"ВАЖЛИВО! Поточний стан гравця:\n{player_state}"
        )

        estimated_tokens = len(full_system_prompt) // 4
        print(f"\n📊 [Оповідач] Запуск генерації. Оціночна вага системного контексту (RAM): ~{estimated_tokens} токенів")
        
        messages = [{"role": "system", "content": full_system_prompt}]
        messages.extend(self.recent_messages)
        
        # Оповідач отримує весь текст, щоб розуміти атмосферу і думки
        messages.append({"role": "user", "content": raw_text})
        
        raw_response = await self._execute_with_fallback("story", messages, temperature=0.7, max_tokens=1000)

        if '{"error"' in raw_response:
            print("⚠️ ПЕРЕХОПЛЕНО ПОМИЛКУ API АБО ЦЕНЗУРУ!")
            # Повертаємо текст помилки, але НЕ записуємо його в історію
            return "*(Системне повідомлення): ШІ відмовився відповідати. Ймовірно, спрацював фільтр цензури (через жорстокість чи ненормативну лексику), або API перевантажене. Спробуй перефразувати дію.*"
        
        # Дебаг сирої відповіді
        print("\n" + "="*40)
        print("🎭 [СИРА ВІДПОВІДЬ ОПОВІДАЧА]:")
        print(repr(raw_response))
        print("="*40 + "\n")
        
        # Санітизація екзотичних символів та форматування абзаців
        clean_text = raw_response.replace("μ", "м").replace("ვ", "в")
        clean_text = re.sub(r'(?<!\n)\n(?!\n)', ' ', clean_text)
        
        self.recent_messages.append({"role": "user", "content": raw_text})
        self.recent_messages.append({"role": "assistant", "content": clean_text})

        await self._compress_history_if_needed()
        self._save_history()
        
        return clean_text

    async def generate_state_json(self, intents: list, story_text: str, player_state: str) -> str:
        """
        2-й крок пайплайну: Аналізатор виділяє дельту змін стану (здоров'я, локація, інвентар).
        Працює суворо послідовно після Оповідача, використовуючи response_format={"type": "json_object"}.
        """
        system_instruction = self._read_prompt("state_system.txt")
        full_system_prompt = f"{system_instruction}\n\nВАЖЛИВО! Поточний стан гравця:\n{player_state}"
        
        # Фільтрація: тільки action та speech (thought та ooc ігноруються)
        actions = []
        speech = []
        
        for intent in intents:
            if isinstance(intent, dict):
                intent_type = intent.get("type", "")
                intent_content = intent.get("content", "")
            else:
                intent_type = getattr(intent, "type", "")
                intent_content = getattr(intent, "content", "")
            
            if intent_type == "action":
                actions.append(intent_content)
            elif intent_type == "speech":
                speech.append(intent_content)

        actions_str = " | ".join(actions) if actions else "ГРАВЕЦЬ НЕ РОБИВ ЖОДНИХ ФІЗИЧНИХ ДІЙ"
        speech_str = " | ".join(speech) if speech else "ГРАВЕЦЬ МОВЧИТЬ"

        strict_user_context = (
            f"УВАГА: Аналізуй інвентар та здоров'я ТІЛЬКИ на основі фізичних дій гравця та відповіді Оповідача.\n"
            f"ФІЗИЧНІ ДІЇ ГРАВЦЯ: {actions_str}\n"
            f"ПРЯМА МОВА ГРАВЦЯ: {speech_str}\n"
            f"(Думки та позаігрові коментарі вилучені з контексту, щоб ти не зробив помилок).\n\n"
            f"РЕЗУЛЬТАТ ВІД ОПОВІДАЧА: {story_text}"
        )

        messages = [
            {"role": "system", "content": full_system_prompt},
            {"role": "user", "content": strict_user_context}
        ]
        
        # Надійний запит зі строгим json_object форматом
        raw_response = await self._execute_with_fallback(
            "state",
            messages,
            temperature=0.0,
            max_tokens=1000,
            response_format={"type": "json_object"}
        )
        
        print("\n" + "="*40)
        print("🧠 [СИРА ВІДПОВІДЬ АНАЛІЗАТОРА (JSON Mode)]:")
        print(raw_response)
        print("="*40 + "\n")

        # Очищення від можливих markdown-тегів ```json ... ```
        cleaned = raw_response.strip()
        if cleaned.startswith("```json"):
            cleaned = cleaned[7:]
        if cleaned.startswith("```"):
            cleaned = cleaned[3:]
        if cleaned.endswith("```"):
            cleaned = cleaned[:-3]
        cleaned = cleaned.strip()

        # Виділення блоку JSON якщо навколо є супровідний текст
        start = cleaned.find('{')
        end = cleaned.rfind('}')
        
        if start != -1 and end != -1:
            json_candidate = cleaned[start:end+1]
            try:
                # Перевіряємо валідність JSON
                json.loads(json_candidate)
                return json_candidate
            except json.JSONDecodeError:
                print(f"⚠️ Попередження: JSON потребує коригування, повертаємо знайдений фрагмент.")
                return json_candidate
            
        return '{"error": "ШІ не повернув валідний JSON. Сира відповідь: ' + raw_response.replace('"', "'") + '"}'
