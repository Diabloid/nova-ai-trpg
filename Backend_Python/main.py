import os
import sys
import json
import logging
from typing import Dict, Any, Union, List, AsyncGenerator
from fastapi import FastAPI, status, Query
from fastapi.responses import JSONResponse, StreamingResponse
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

# Додаємо поточну директорію в sys.path
CURRENT_DIR = os.path.dirname(os.path.abspath(__file__))
if CURRENT_DIR not in sys.path:
    sys.path.insert(0, CURRENT_DIR)

from schemas.game_dto import (
    ActionRequest,
    ActionResponse,
    PlayerState,
    SessionInfo
)
from core.llm_manager import LLMController

# Логування
logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger("nova-backend")

app = FastAPI(
    title="NOVA AI TRPG Engine API",
    version="1.1.0",
    description=(
        "Офіційний бекенд дипломного проєкту NOVA AI TRPG.\n"
        "Реалізує: суворо послідовний пайплайн (Гравець -> Оповідач -> Аналізатор -> Стан),\n"
        "транзакційний відкат історії (Unit of Work), мультисесійність та токен-стрімінг (SSE)."
    )
)

llm_controller = LLMController()


# =========================================================================
# 1. Основний ендпоінт дії гравця (Non-streaming, POST /api/v1/action)
# =========================================================================

@app.post(
    "/api/v1/action",
    response_model=ActionResponse,
    status_code=status.HTTP_200_OK,
    summary="Виконання ігрового кроку гравця",
    description=(
        "Приймає дію гравця з розпарсеними намірами (ActionRequest), виконує транзакційний "
        "послідовний пайплайн Оповідач -> Аналізатор -> Стан -> Commit і повертає ActionResponse."
    )
)
async def process_action(request: ActionRequest) -> ActionResponse:
    session_id = request.session_id or "default"
    game_state = llm_controller.get_game_state(session_id)

    try:
        raw_text = request.raw_text
        intents = request.intents
        
        logger.info(f"🎮 [Сесія: {session_id}] Новий крок гравця. Текст: '{raw_text[:60]}...' | Намірів: {len(intents)}")
        
        current_state_dict = game_state.get_current_state()
        context_str = json.dumps(current_state_dict, ensure_ascii=False, indent=2)
        
        # 1. Послідовний крок 1: Оповідач (GM)
        story_text = await llm_controller.generate_story(raw_text, context_str, session_id=session_id)
        
        if story_text.startswith("*(Системне повідомлення)"):
            return ActionResponse(
                status="error",
                story=story_text,
                raw_llm_state=None,
                player_state=current_state_dict,
                error_message="Оповідач повернув помилку API або спрацював фільтр цензури."
            )

        # ТРАНЗАКЦІЙНІСТЬ (Крок A): Підготовлюємо хід у буфері сесії
        llm_controller.stage_turn(raw_text, story_text, session_id=session_id)
        
        # 2. Послідовний крок 2: Аналізатор стану
        state_json_str = await llm_controller.generate_state_json(intents, story_text, context_str)
        
        if '{"error"' in state_json_str:
            logger.warning(f"⚠️ Аналізатор повернув помилку: {state_json_str}. Відкат ходу сесії {session_id}...")
            llm_controller.rollback_staged_turn(session_id=session_id)
            return ActionResponse(
                status="error",
                story=story_text,
                raw_llm_state=state_json_str,
                player_state=current_state_dict,
                error_message="Аналізатор не зміг виділити валідні зміни стану. Відкат історії виконано."
            )

        # 3. Послідовний крок 3: Мутація збереженого стану
        new_state = game_state.update_from_llm(state_json_str)
        
        # ТРАНЗАКЦІЙНІСТЬ (Крок B): Commit в історію та збереження
        await llm_controller.commit_staged_turn(session_id=session_id)
        
        return ActionResponse(
            status="success",
            story=story_text,
            raw_llm_state=state_json_str,
            player_state=new_state,
            error_message=None
        )
    except Exception as e:
        logger.error(f"❌ Помилка пайплайну: {e}. Відкат ходу (Rollback)...", exc_info=True)
        llm_controller.rollback_staged_turn(session_id=session_id)
        return ActionResponse(
            status="error",
            story="Сталася внутрішня помилка сервера при обробці дії.",
            raw_llm_state=None,
            player_state=game_state.get_current_state(),
            error_message=f"Backend Error: {str(e)}"
        )


# =========================================================================
# 2. Потоковий стрімінг художнього тексту (Server-Sent Events / SSE)
# =========================================================================

@app.post(
    "/api/v1/action/stream",
    summary="Потокове виконання кроку гравця через Server-Sent Events (SSE)",
    description=(
        "Стрімить токени Оповідача в реальному часі (event: story_chunk),\n"
        "після чого послідовно запускає Аналізатор і повертає оновлений стан (event: complete)."
    )
)
async def process_action_stream(request: ActionRequest):
    session_id = request.session_id or "default"
    game_state = llm_controller.get_game_state(session_id)

    async def sse_event_generator() -> AsyncGenerator[str, None]:
        story_accumulator: List[str] = []
        raw_text = request.raw_text
        intents = request.intents

        try:
            current_state_dict = game_state.get_current_state()
            context_str = json.dumps(current_state_dict, ensure_ascii=False, indent=2)

            # 1. Стрімінг Оповідача токен за токеном
            async for token in llm_controller.stream_story(raw_text, context_str, session_id=session_id):
                story_accumulator.append(token)
                chunk_payload = json.dumps({"chunk": token}, ensure_ascii=False)
                yield f"event: story_chunk\ndata: {chunk_payload}\n\n"

            full_story = "".join(story_accumulator).strip()

            if full_story.startswith("*(Системне повідомлення)"):
                err_payload = json.dumps({
                    "status": "error",
                    "error_message": "Помилка Оповідача при стрімінгу",
                    "player_state": current_state_dict
                }, ensure_ascii=False)
                yield f"event: error\ndata: {err_payload}\n\n"
                return

            # ТРАНЗАКЦІЙНІСТЬ (Stage)
            llm_controller.stage_turn(raw_text, full_story, session_id=session_id)

            # 2. Сповіщення клієнта про запуск Аналізатора
            status_payload = json.dumps({"message": "Аналізую зміни інвентарю та здоров'я..."}, ensure_ascii=False)
            yield f"event: state_analyzing\ndata: {status_payload}\n\n"

            # 3. Аналізатор стану
            state_json_str = await llm_controller.generate_state_json(intents, full_story, context_str)

            if '{"error"' in state_json_str:
                llm_controller.rollback_staged_turn(session_id=session_id)
                err_payload = json.dumps({
                    "status": "error",
                    "story": full_story,
                    "error_message": "Аналізатор повернув невалідний JSON",
                    "player_state": current_state_dict
                }, ensure_ascii=False)
                yield f"event: error\ndata: {err_payload}\n\n"
                return

            # 4. Мутація стану та Commit
            new_state = game_state.update_from_llm(state_json_str)
            await llm_controller.commit_staged_turn(session_id=session_id)

            # 5. Фінальний івент успіху
            complete_payload = json.dumps({
                "status": "success",
                "story": full_story,
                "raw_llm_state": state_json_str,
                "player_state": new_state,
                "error_message": None
            }, ensure_ascii=False)
            yield f"event: complete\ndata: {complete_payload}\n\n"

        except Exception as e:
            logger.error(f"❌ Помилка під час SSE стрімінгу: {e}", exc_info=True)
            llm_controller.rollback_staged_turn(session_id=session_id)
            err_payload = json.dumps({
                "status": "error",
                "error_message": f"Stream Error: {str(e)}"
            }, ensure_ascii=False)
            yield f"event: error\ndata: {err_payload}\n\n"

    return StreamingResponse(
        sse_event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no"
        }
    )


# =========================================================================
# 3. Ендпоінт стану персонажа (GET /api/v1/state)
# =========================================================================

@app.get(
    "/api/v1/state",
    response_model=Union[PlayerState, Dict[str, Any]],
    summary="Отримання повного поточного стану гравця",
    description="Повертає актуальний об'єкт PlayerState для заданої сесії."
)
async def get_current_state(session_id: str = Query(default="default", description="ID сесії")):
    game_state = llm_controller.get_game_state(session_id)
    return game_state.get_current_state()


# =========================================================================
# 4. Ендпоінти управління сесіями (Multi-session)
# =========================================================================

@app.get(
    "/api/v1/sessions",
    response_model=List[SessionInfo],
    summary="Отримання списку всіх збережених ігрових сесій",
    description="Сканує папку data/saves/ та повертає доступні слоти збережень."
)
async def get_sessions():
    return llm_controller.session_manager.list_sessions()


@app.post(
    "/api/v1/sessions/{session_id}/reset",
    response_model=Union[PlayerState, Dict[str, Any]],
    summary="Скидання ігрової сесії",
    description="Скидає стан ігрової сесії до стартового стану за замовчуванням."
)
async def reset_session(session_id: str):
    state = llm_controller.session_manager.reset_session(session_id)
    return state.get_current_state()


if __name__ == "__main__":
    uvicorn.run("main:app", host="127.0.0.1", port=8000, reload=True)
