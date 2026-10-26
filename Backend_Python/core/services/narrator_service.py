import re
import sys
from typing import Optional
from core.services.llm_provider_service import LLMProviderService
from core.services.prompt_service import PromptService
from core.services.history_service import HistoryService

# Безпечне кодування консолі для Windows
if sys.stdout and hasattr(sys.stdout, "reconfigure"):
    try:
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass


class NarratorService:
    """
    1-й крок пайплайну: Генерація художньої оповіді від імені Мастера Гри (GM).
    Використовує повний лор з RAM-кешу, історію діалогу та поточний стан гравця.
    """
    def __init__(
        self,
        provider_service: LLMProviderService,
        prompt_service: PromptService,
        history_service: HistoryService
    ):
        self.provider_service = provider_service
        self.prompt_service = prompt_service
        self.history_service = history_service

    async def generate_story(self, raw_text: str, player_state_str: str) -> str:
        """
        Формує запит до моделі Оповідача та повертає очищений художній текст.
        """
        full_system_prompt = self.prompt_service.build_narrator_system_prompt(
            player_state_str=player_state_str,
            summary_text=self.history_service.summary
        )

        estimated_tokens = len(full_system_prompt) // 4
        print(f"\n📊 [NarratorService] Генерація художньої реакції. Вага системного контексту: ~{estimated_tokens} токенів")

        messages = [{"role": "system", "content": full_system_prompt}]
        messages.extend(self.history_service.recent_messages)
        messages.append({"role": "user", "content": raw_text})

        raw_response = await self.provider_service.execute_with_fallback(
            provider_type="story",
            messages=messages,
            temperature=0.7,
            max_tokens=1000
        )

        if '{"error"' in raw_response:
            print("⚠️ [NarratorService] Перехоплено помилку API або цензуру!")
            return (
                "*(Системне повідомлення): ШІ відмовився відповідати. "
                "Ймовірно, спрацював фільтр цензури або API перевантажене. Спробуй перефразувати дію.*"
            )

        # Дебаг сирої відповіді
        print("\n" + "="*40)
        print("🎭 [СИРА ВІДПОВІДЬ ОПОВІДАЧА]:")
        print(repr(raw_response))
        print("="*40 + "\n")

        # Санітизація артефактів шрифтів та нормалізація абзаців
        clean_text = raw_response.replace("μ", "м").replace("ვ", "в")
        clean_text = re.sub(r'(?<!\n)\n(?!\n)', ' ', clean_text)

        return clean_text.strip()
