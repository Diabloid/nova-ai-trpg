import os
import sys
import json
from typing import Optional, List, Dict, Any
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


class LLMController:
    """
    Фасад (Facade Pattern) та оркестратор підсистеми ШІ-генерації:
    об'єднує спеціалізовані сервіси (PromptService, HistoryService, NarratorService, StateAnalyzerService)
    та забезпечує транзакційність ігрового циклу.
    """
    def __init__(self):
        self.base_dir = BASE_DIR
        self.history_file = os.path.join(self.base_dir, "data", "saves", "history.json")
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

        # 1. Ініціалізація сервісів
        self.provider_service = LLMProviderService(self.config)
        self.prompt_service = PromptService(self.prompts_dir, self.lore_dir)
        self.history_service = HistoryService(self.history_file)
        self.narrator_service = NarratorService(self.provider_service, self.prompt_service, self.history_service)
        self.analyzer_service = StateAnalyzerService(self.provider_service, self.prompt_service)

    # Властивості для зворотної сумісності
    @property
    def summary(self) -> str:
        return self.history_service.summary

    @summary.setter
    def summary(self, val: str):
        self.history_service.summary = val

    @property
    def recent_messages(self) -> List[Dict[str, str]]:
        return self.history_service.recent_messages

    @property
    def _cached_lore(self) -> str:
        return self.prompt_service.cached_lore

    @property
    def _lore_file_count(self) -> int:
        return self.prompt_service.lore_file_count

    # Транзакційні методи управління ходом
    def stage_turn(self, raw_text: str, story_text: str):
        """Підготовлює хід для збереження після валідації стану."""
        self.history_service.stage_turn(raw_text, story_text)

    async def commit_staged_turn(self):
        """Фіксує хід в історії та зберігає на диск (Commit)."""
        await self.history_service.commit_staged_turn(
            llm_provider=self.provider_service,
            prompt_service=self.prompt_service
        )

    def rollback_staged_turn(self):
        """Відкочує підготовлений хід у разі збою на етапі аналізу чи запису (Rollback)."""
        self.history_service.rollback_staged_turn()

    # Генерація Оповідача
    async def generate_story(self, raw_text: str, player_state: str) -> str:
        """1-й крок пайплайну: генерація реакції Оповідача."""
        return await self.narrator_service.generate_story(raw_text, player_state)

    # Генерація Аналізатора стану
    async def generate_state_json(self, intents: list, story_text: str, player_state: str) -> str:
        """2-й крок пайплайну: витягування JSON дельти стану."""
        json_str, _ = await self.analyzer_service.analyze_state_changes(intents, story_text, player_state)
        return json_str

    # Гаряче оновлення
    def reload_lore(self):
        self.prompt_service.reload_lore()

    def reload_prompts(self):
        self.prompt_service.reload_prompts()
