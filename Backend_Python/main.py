import os
import sys
import json
import logging
from typing import Dict, Any, Union
from fastapi import FastAPI, status
from fastapi.responses import JSONResponse
import uvicorn

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

# Додаємо поточну директорію в sys.path для надійних відносних імпортів
CURRENT_DIR = os.path.dirname(os.path.abspath(__file__))
if CURRENT_DIR not in sys.path:
    sys.path.insert(0, CURRENT_DIR)

from schemas.game_dto import ActionRequest, ActionResponse, PlayerState
from core.llm_manager import LLMController
from core.state_manager import GameState

# Налаштування логування
logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger("nova-backend")

app = FastAPI(
    title="NOVA AI TRPG Engine API",
    version="1.0.0",
    description="Офіційний бекенд дипломного проєкту NOVA AI TRPG. Реалізує суворо послідовний пайплайн Оповідач -> Аналізатор -> Стан."
)

llm_controller = LLMController()
game_state = GameState()


@app.post(
    "/api/v1/action",
    response_model=ActionResponse,
    status_code=status.HTTP_200_OK,
    summary="Виконання ігрового кроку гравця",
    description=(
        "Приймає дію гравця з розпарсеними намірами (ActionRequest), виконує послідовну генерацію "
        "Оповідача, аналіз змін стану та повертає фінальний результат (ActionResponse) згідно з API_CONTRACT.md."
    )
)
async def process_action(request: ActionRequest) -> ActionResponse:
    try:
        raw_text = request.raw_text
        intents = request.intents
        
        logger.info(f"🎮 Новий крок гравця. Текст: '{raw_text[:60]}...' | Намірів: {len(intents)}")
        
        current_state_dict = game_state.get_current_state()
        context_str = json.dumps(current_state_dict, ensure_ascii=False, indent=2)
        
        # 1. Послідовний крок 1: Оповідач (GM) генерує реакцію світу на основі лору та контексту
        story_text = await llm_controller.generate_story(raw_text, context_str)
        
        # 2. Послідовний крок 2: Аналізатор оцінює ТІЛЬКИ наслідки фізичних дій та опису Оповідача
        state_json_str = await llm_controller.generate_state_json(intents, story_text, context_str)
        
        # 3. Послідовний крок 3: Оновлення збереженого стану персонажа
        new_state = game_state.update_from_llm(state_json_str)
        
        return ActionResponse(
            status="success",
            story=story_text,
            raw_llm_state=state_json_str,
            player_state=new_state,
            error_message=None
        )
    except Exception as e:
        logger.error(f"❌ Помилка обробки кроку гравця: {e}", exc_info=True)
        return ActionResponse(
            status="error",
            story="Сталася внутрішня помилка сервера при обробці дії.",
            raw_llm_state=None,
            player_state=game_state.get_current_state(),
            error_message=f"Backend Error: {str(e)}"
        )


@app.get(
    "/api/v1/state",
    response_model=Union[PlayerState, Dict[str, Any]],
    summary="Отримання повного поточного стану гравця",
    description="Повертає актуальний об'єкт PlayerState зі збереження."
)
async def get_current_state():
    return game_state.get_current_state()


if __name__ == "__main__":
    uvicorn.run("main:app", host="127.0.0.1", port=8000, reload=True)
