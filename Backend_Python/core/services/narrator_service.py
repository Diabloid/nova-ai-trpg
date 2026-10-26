import re
import sys
from typing import Optional, AsyncGenerator, List, Dict
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
    Підтримує як звичайну генерацію, так і Server-Sent Events (SSE) стрімінг токенів.
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

    def _build_messages(
        self,
        raw_text: str,
        player_state_str: str,
        recent_messages: Optional[List[Dict[str, str]]] = None,
        summary_text: Optional[str] = None
    ) -> List[Dict[str, str]]:
        active_summary = summary_text if summary_text is not None else self.history_service.summary
        active_history = recent_messages if recent_messages is not None else self.history_service.recent_messages

        full_system_prompt = self.prompt_service.build_narrator_system_prompt(
            player_state_str=player_state_str,
            summary_text=active_summary
        )

        messages = [{"role": "system", "content": full_system_prompt}]
        messages.extend(active_history)
        messages.append({"role": "user", "content": raw_text})
        return messages

    async def generate_story(self, raw_text: str, player_state_str: str) -> str:
        """Повна генерація тексту (Non-streaming)."""
        messages = self._build_messages(raw_text, player_state_str)

        raw_response = await self.provider_service.execute_with_fallback(
            provider_type="story",
            messages=messages,
            temperature=0.7,
            max_tokens=1000
        )

        if '{"error"' in raw_response:
            return (
                "*(Системне повідомлення): ШІ відмовився відповідати. "
                "Ймовірно, спрацював фільтр цензури або API перевантажене. Спробуй перефразувати дію.*"
            )

        clean_text = raw_response.replace("μ", "м").replace("ვ", "в")
        clean_text = re.sub(r'(?<!\n)\n(?!\n)', ' ', clean_text)
        return clean_text.strip()

    async def stream_story(
        self,
        raw_text: str,
        player_state_str: str,
        recent_messages: Optional[List[Dict[str, str]]] = None,
        summary_text: Optional[str] = None
    ) -> AsyncGenerator[str, None]:
        """Стрімінг художньої оповіді токен за токеном у реальному часі (SSE)."""
        messages = self._build_messages(raw_text, player_state_str, recent_messages, summary_text)

        async for chunk in self.provider_service.stream_with_fallback(
            provider_type="story",
            messages=messages,
            temperature=0.7,
            max_tokens=1000
        ):
            # Санітизація окремих токенів
            clean_chunk = chunk.replace("μ", "м").replace("ვ", "в")
            yield clean_chunk
