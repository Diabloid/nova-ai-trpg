import os
import sys
import json
from typing import Optional, List, Dict, Any, AsyncGenerator
from dotenv import load_dotenv

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

from core.services.llm_provider_service import LLMProviderService
from core.services.prompt_service import PromptService
from core.services.history_service import HistoryService
from core.services.narrator_service import NarratorService
from core.services.state_analyzer_service import StateAnalyzerService
from core.session_manager import SessionManager


class LLMController:
    """
    Фасад (Facade Pattern) та оркестратор підсистеми ШІ-генерації:
    об'єднує спеціалізовані сервіси (PromptService, HistoryService, NarratorService, StateAnalyzerService),
    підтримує мультисесійність через SessionManager та токен-стрімінг для SSE.
    """
    def __init__(self):
        self.base_dir = BASE_DIR
        self.prompts_dir = os.path.join(self.base_dir, "data", "prompts")
        self.lore_dir = os.path.join(self.base_dir, "data", "lore")
        
        # Завантаження конфігурації провайдерів
        config_path = os.path.join(self.base_dir, "data", "config", "providers.json")
        try:
            with open(config_path, "r", encoding="utf-8") as f:
                self.config = json.load(f)
        except FileNotFoundError:
            print(f"❌ КРИТИЧНА ПОМИЛКА: Файл {config_path} не знайдено!")
            self.config = {"story": [], "state": []}

        # 1. Спільні сервіси провайдерів, промптів та сесій
        self.provider_service = LLMProviderService(self.config)
        self.prompt_service = PromptService(self.prompts_dir, self.lore_dir)
        self.session_manager = SessionManager(os.path.join(self.base_dir, "data", "saves"))
        self.analyzer_service = StateAnalyzerService(self.provider_service, self.prompt_service)

    def _get_history(self, session_id: str = "default") -> HistoryService:
        _, hist = self.session_manager.get_session(session_id)
        return hist

    def get_game_state(self, session_id: str = "default"):
        state, _ = self.session_manager.get_session(session_id)
        return state

    # Властивості для зворотної сумісності (з дефолтної сесії)
    @property
    def summary(self) -> str:
        return self._get_history("default").summary

    @summary.setter
    def summary(self, val: str):
        self._get_history("default").summary = val

    @property
    def recent_messages(self) -> List[Dict[str, str]]:
        return self._get_history("default").recent_messages

    @property
    def _cached_lore(self) -> str:
        return self.prompt_service.cached_lore

    @property
    def _lore_file_count(self) -> int:
        return self.prompt_service.lore_file_count

    # Транзакційні методи управління ходом (з підтримкою session_id)
    def stage_turn(self, raw_text: str, story_text: str, session_id: str = "default"):
        """Підготовлює хід у буфері відповідної сесії."""
        hist = self._get_history(session_id)
        hist.stage_turn(raw_text, story_text)

    async def commit_staged_turn(self, session_id: str = "default"):
        """Фіксує хід в історії сесії та зберігає на диск (Commit)."""
        hist = self._get_history(session_id)
        await hist.commit_staged_turn(
            llm_provider=self.provider_service,
            prompt_service=self.prompt_service
        )

    def rollback_staged_turn(self, session_id: str = "default"):
        """Відкочує підготовлений хід відповідної сесії (Rollback)."""
        hist = self._get_history(session_id)
        hist.rollback_staged_turn()

    # Генерація Оповідача (Non-streaming)
    async def generate_story(self, raw_text: str, player_state: str, session_id: str = "default") -> str:
        """1-й крок пайплайну: генерація повної реакції Оповідача."""
        hist = self._get_history(session_id)
        narrator = NarratorService(self.provider_service, self.prompt_service, hist)
        return await narrator.generate_story(raw_text, player_state)

    # Генерація Оповідача (Streaming SSE)
    async def stream_story(
        self,
        raw_text: str,
        player_state: str,
        session_id: str = "default"
    ) -> AsyncGenerator[str, None]:
        """Стрімінг реакції Оповідача токен за токеном (Server-Sent Events)."""
        hist = self._get_history(session_id)
        narrator = NarratorService(self.provider_service, self.prompt_service, hist)
        async for chunk in narrator.stream_story(
            raw_text,
            player_state,
            recent_messages=hist.recent_messages,
            summary_text=hist.summary
        ):
            yield chunk

    # Генерація Аналізатора стану
    async def generate_state_json(self, intents: list, story_text: str, player_state: str) -> str:
        """2-й крок пайплайну: витягування JSON дельти стану."""
        json_str, _ = await self.analyzer_service.analyze_state_changes(intents, story_text, player_state)
        return json_str

    # Гаряче оновлення лору та промптів
    def reload_lore(self):
        self.prompt_service.reload_lore()

    def reload_prompts(self):
        self.prompt_service.reload_prompts()
