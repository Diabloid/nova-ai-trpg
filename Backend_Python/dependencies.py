import logging
from core.llm_manager import LLMController

logger = logging.getLogger("nova-backend")

# Єдиний екземпляр фасаду LLMController (Singleton для всього застосунку)
llm_controller = LLMController()


def get_llm_controller() -> LLMController:
    """FastAPI Dependency для інжекції інстансу контролера."""
    return llm_controller
