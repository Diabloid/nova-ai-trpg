import os
import sys
import json
from typing import Optional, List, Dict, Any, AsyncGenerator, Tuple
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
from core.services.chat_log_service import ChatLogService
from core.services.narrator_service import NarratorService
from core.services.state_analyzer_service import StateAnalyzerService
from core.services.character_wizard_service import CharacterWizardService
from core.character_manager import CharacterManager
from core.campaign_manager import CampaignManager
from schemas.game_dto import PlayerState


class LLMController:
    """
    Фасад (Facade Pattern) та оркестратор підсистеми ШІ-генерації:
    об'єднує модульні сервіси промптів, провайдерів, менеджер персонажів (CharacterManager),
    менеджер кампаній (CampaignManager), CharacterWizardService та генерацію вступних постів.
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

        # 1. Сервіси ядра
        self.provider_service = LLMProviderService(self.config)
        self.prompt_service = PromptService(self.prompts_dir, self.lore_dir)
        self.analyzer_service = StateAnalyzerService(self.provider_service, self.prompt_service)
        self.character_wizard_service = CharacterWizardService(self.provider_service, self.prompt_service)

        # 2. Менеджери сутностей (Персонажі та Кампанії)
        self.character_manager = CharacterManager(os.path.join(self.base_dir, "data", "characters"))
        self.campaign_manager = CampaignManager(
            saves_dir=os.path.join(self.base_dir, "data", "saves"),
            character_manager=self.character_manager
        )

    def _get_history(self, session_id: str = "default") -> HistoryService:
        _, hist, _ = self.campaign_manager.get_campaign_session(session_id)
        return hist

    def _get_chat_log(self, session_id: str = "default") -> ChatLogService:
        _, _, chat_log = self.campaign_manager.get_campaign_session(session_id)
        return chat_log

    def get_game_state(self, session_id: str = "default"):
        state, _, _ = self.campaign_manager.get_campaign_session(session_id)
        return state

    # Властивості для зворотної сумісності (дефолтна кампанія)
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

    # Транзакційні методи ходу в кампанії
    def stage_turn(self, raw_text: str, story_text: str, session_id: str = "default"):
        """Підготовлює хід у буфері відповідної кампанії."""
        hist = self._get_history(session_id)
        hist.stage_turn(raw_text, story_text)

    async def commit_staged_turn(self, session_id: str = "default"):
        """Фіксує хід в історії кампанії (робочий контекст LLM + повний нестислий chat_log) та зберігає на диск."""
        hist = self._get_history(session_id)
        chat_log = self._get_chat_log(session_id)
        await hist.commit_staged_turn(
            llm_provider=self.provider_service,
            prompt_service=self.prompt_service,
            chat_log_service=chat_log
        )
        self.campaign_manager.touch_campaign_played(session_id)

    def rollback_staged_turn(self, session_id: str = "default"):
        """Відкочує підготовлений хід (Rollback)."""
        hist = self._get_history(session_id)
        hist.rollback_staged_turn()

    # Генерація Оповідача (Non-streaming)
    async def generate_story(
        self,
        raw_text: str,
        player_state: str,
        session_id: str = "default",
        recent_messages: Optional[List[Dict[str, str]]] = None,
        summary_text: Optional[str] = None
    ) -> str:
        """1-й крок пайплайну: генерація повної реакції Оповідача."""
        hist = self._get_history(session_id)
        narrator = NarratorService(self.provider_service, self.prompt_service, hist)
        return await narrator.generate_story(
            raw_text,
            player_state,
            recent_messages=recent_messages,
            summary_text=summary_text
        )

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

    # =========================================================================
    # 🧙‍♂️ Character Wizard (Створення персонажа з AI) — Делегування в CharacterWizardService
    # =========================================================================

    async def dialog_with_creator(
        self,
        message: str,
        history: List[Dict[str, str]],
        include_draft: bool = False
    ) -> Tuple[str, Optional[PlayerState]]:
        """Крок інтерактивного діалогу зі створення героя через Творця Долі (v1.3.0)."""
        return await self.character_wizard_service.dialog_with_creator(
            message=message,
            history=history,
            include_draft=include_draft
        )

    async def finalize_character_concept(
        self,
        dialog_summary: Optional[str] = None,
        history: Optional[List[Dict[str, str]]] = None
    ) -> PlayerState:
        """Перетворює узгоджений діалог створення на валідний об'єкт PlayerState."""
        return await self.character_wizard_service.finalize_character_concept(dialog_summary, history)

    # Гаряче оновлення
    def reload_lore(self):
        self.prompt_service.reload_lore()

    def reload_prompts(self):
        self.prompt_service.reload_prompts()
