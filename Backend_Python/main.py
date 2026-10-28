import os
import sys
import json
import logging
from datetime import datetime, timezone
from typing import Dict, Any, Union, List, AsyncGenerator, Optional
from contextlib import asynccontextmanager
from fastapi import FastAPI, status, Query, HTTPException, Path
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
    CharacterSummary,
    CampaignSummary,
    CampaignCreateRequest,
    CampaignPinRequest,
    HistoryMessage,
    RollbackResponse,
    CharacterDialogRequest,
    CharacterDialogResponse,
    CharacterFinalizeRequest,
    SessionInfo
)
from core.llm_manager import LLMController

# Логування
logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger("nova-backend")

llm_controller = LLMController()


@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    Керування життєвим циклом додатку (Lifespan):
    Виконується СТРОГО ОДИН РАЗ під час старту робочого worker-процесу Uvicorn.
    """
    logger.info("⏳ Ініціалізація бази знань та лору всесвіту...")
    llm_controller.prompt_service.ensure_lore_loaded()
    logger.info("🔍 Динамічне опитування та евристичне ранжування ШІ-моделей Odirouter...")
    await llm_controller.refresh_ai_models()
    logger.info("🚀 NOVA AI TRPG Engine API успішно запущено та готовий до гри!")
    yield
    logger.info("🛑 Зупинка NOVA AI TRPG Engine API...")


app = FastAPI(
    title="NOVA AI TRPG Engine API",
    version="1.4.0",
    lifespan=lifespan,
    description=(
        "Офіційний бекенд дипломного проєкту NOVA AI TRPG (API v1.4.0).\n\n"
        "Архітектура:\n"
        "- Персонажі (Blueprints): створення, редагування, Character Wizard з AI Творцем Долі.\n"
        "- Кампанії (Campaigns / Чати): мультисесійність за кожним героєм, авто-генерація вступного наративу (Intro Post), закріплення (Pin).\n"
        "- Ігровий цикл: суворо послідовний пайплайн (Гравець -> Оповідач -> Аналізатор -> Стан) з транзакційним відкатом (Unit of Work) та SSE-стрімінгом."
    )
)


# =========================================================================
# 👤 1. Управління заготовками персонажів (Character Blueprints)
# =========================================================================

@app.get(
    "/api/v1/characters",
    response_model=List[CharacterSummary],
    tags=["Персонажі"],
    summary="Отримати список усіх заготовок героїв"
)
async def list_characters():
    return llm_controller.character_manager.list_characters()


@app.get(
    "/api/v1/characters/{char_id}",
    response_model=PlayerState,
    tags=["Персонажі"],
    summary="Отримати повний стан заготовки персонажа"
)
async def get_character(char_id: str = Path(..., description="ID персонажа")):
    return llm_controller.character_manager.get_character(char_id)


@app.post(
    "/api/v1/characters",
    response_model=CharacterSummary,
    status_code=status.HTTP_201_CREATED,
    tags=["Персонажі"],
    summary="Створити нову заготовку персонажа вручну"
)
async def create_character(state: PlayerState, char_id: Optional[str] = Query(default=None)):
    target_id = char_id or state.meta.name.strip().lower().replace(" ", "_")
    return llm_controller.character_manager.save_character(target_id, state)


@app.put(
    "/api/v1/characters/{char_id}",
    response_model=PlayerState,
    tags=["Персонажі"],
    summary="Редагувати заготовку героя"
)
async def update_character(
    char_id: str = Path(..., description="ID персонажа"),
    state: PlayerState = ...
):
    llm_controller.character_manager.save_character(char_id, state)
    return state


@app.delete(
    "/api/v1/characters/{char_id}",
    tags=["Персонажі"],
    summary="Видалити заготовку персонажа"
)
async def delete_character(char_id: str = Path(..., description="ID персонажа")):
    llm_controller.character_manager.delete_character(char_id)
    return {"status": "deleted", "char_id": char_id}


# =========================================================================
# 🧙‍♂️ 2. Створення персонажа з AI (Character Wizard)
# =========================================================================

@app.post(
    "/api/v1/character/dialog",
    response_model=CharacterDialogResponse,
    tags=["Character Wizard"],
    summary="Інтерактивний крок діалогу з Творцем Долі (з Live Preview)"
)
async def character_wizard_dialog(request: CharacterDialogRequest):
    reply, draft_state = await llm_controller.dialog_with_creator(
        message=request.message,
        history=request.history,
        include_draft=request.include_draft
    )
    return CharacterDialogResponse(reply=reply, draft_state=draft_state)


@app.post(
    "/api/v1/character/finalize",
    response_model=PlayerState,
    tags=["Character Wizard"],
    summary="Згенерувати та зберегти фінальний лист героя за результатами діалогу"
)
async def character_wizard_finalize(request: CharacterFinalizeRequest):
    try:
        player_state = await llm_controller.finalize_character_concept(
            dialog_summary=request.dialog_summary,
            history=request.history
        )
    except Exception as e:
        logger.error(f"❌ Помилка генерації листа героя через ШІ: {e}")
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=f"Не вдалося згенерувати лист героя через збій ШІ-провайдерів: {e}"
        )

    # Зберігаємо створеного персонажа в базу
    target_char_id = request.char_id or player_state.meta.name.strip().lower().replace(" ", "_")
    llm_controller.character_manager.save_character(target_char_id, player_state)
    logger.info(f"✨ Створено нового героя з AI: '{player_state.meta.name}' (ID: {target_char_id})")
    return player_state


# =========================================================================
# ⚔ 3. Менеджмент Кампаній (Campaigns / Чати)
# =========================================================================

@app.get(
    "/api/v1/characters/{char_id}/campaigns",
    response_model=List[CampaignSummary],
    tags=["Кампанії"],
    summary="Список усіх кампаній персонажа (закріплені вгорі)"
)
async def list_campaigns(char_id: str = Path(..., description="ID персонажа")):
    return llm_controller.campaign_manager.list_campaigns_for_character(char_id)


@app.post(
    "/api/v1/characters/{char_id}/campaigns",
    response_model=CampaignSummary,
    status_code=status.HTTP_201_CREATED,
    tags=["Кампанії"],
    summary="Створити нову кампанію + автогенерація стартового художнього посту"
)
async def create_campaign(
    char_id: str = Path(..., description="ID персонажа"),
    request: CampaignCreateRequest = CampaignCreateRequest()
):
    # Генератор оповіді для вступного посту з чистим контекстом (без залишків минулих сесій)
    async def generate_intro(prompt: str, player_state_str: str) -> str:
        return await llm_controller.generate_story(
            raw_text=prompt,
            player_state=player_state_str,
            recent_messages=[],
            summary_text=""
        )

    summary = await llm_controller.campaign_manager.create_campaign(
        char_id=char_id,
        title=request.title,
        narrator_generator=generate_intro
    )
    logger.info(f"⚔️ Створено нову кампанію '{summary.title}' для персонажа '{char_id}' з художнім вступом!")
    return summary


@app.get(
    "/api/v1/campaigns/{campaign_id}/history",
    response_model=List[HistoryMessage],
    tags=["Кампанії"],
    summary="Отримати повну хронологічну історію повідомлень кампанії"
)
async def get_campaign_history(campaign_id: str = Path(..., description="ID кампанії")):
    return llm_controller.campaign_manager.get_campaign_history(campaign_id)


@app.post(
    "/api/v1/campaigns/{campaign_id}/rollback",
    response_model=RollbackResponse,
    tags=["Кампанії"],
    summary="Відкат останнього ходу кампанії на 1 крок назад (Undo)"
)
async def rollback_campaign_turn(campaign_id: str = Path(..., description="ID кампанії")):
    prev_input, state_dict = llm_controller.campaign_manager.rollback_campaign_turn(campaign_id)
    msg = "Хід успішно відкочено на 1 крок назад" if prev_input else "Немає ходів гравця для відкату"
    return RollbackResponse(
        previous_user_input=prev_input,
        current_state=PlayerState.model_validate(state_dict),
        message=msg
    )


@app.patch(
    "/api/v1/campaigns/{campaign_id}/pin",
    response_model=CampaignSummary,
    tags=["Кампанії"],
    summary="Закріпити або відкріпити кампанію"
)
async def pin_campaign(
    campaign_id: str = Path(..., description="ID кампанії"),
    request: CampaignPinRequest = ...
):
    return llm_controller.campaign_manager.pin_campaign(campaign_id, request.is_pinned)


@app.delete(
    "/api/v1/campaigns/{campaign_id}",
    tags=["Кампанії"],
    summary="Видалити кампанію з диска"
)
async def delete_campaign(campaign_id: str = Path(..., description="ID кампанії")):
    llm_controller.campaign_manager.delete_campaign(campaign_id)
    return {"status": "deleted", "campaign_id": campaign_id}


# =========================================================================
# 🎲 4. Ігровий цикл (Gameplay Action Pipeline)
# =========================================================================

@app.post(
    "/api/v1/action",
    response_model=ActionResponse,
    status_code=status.HTTP_200_OK,
    tags=["Геймплей"],
    summary="Виконання ігрового кроку гравця (REST)",
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
        
        logger.info(f"🎮 [Кампанія: {session_id}] Хід гравця. Текст: '{raw_text[:60]}...' | Намірів: {len(intents)}")
        
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
            logger.warning(f"⚠️ Аналізатор повернув помилку: {state_json_str}. Відкат ходу кампанії {session_id}...")
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
        
        # Оновлюємо локацію у метаданих кампанії
        new_location = new_state.get("meta", {}).get("location")
        llm_controller.campaign_manager.touch_campaign_played(session_id, new_location)
        
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
# 5. Потоковий стрімінг художнього тексту (Server-Sent Events / SSE)
# =========================================================================

@app.post(
    "/api/v1/action/stream",
    tags=["Геймплей"],
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

            new_location = new_state.get("meta", {}).get("location")
            llm_controller.campaign_manager.touch_campaign_played(session_id, new_location)

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
# 6. Ендпоінт стану персонажа (GET /api/v1/state)
# =========================================================================

@app.get(
    "/api/v1/state",
    response_model=Union[PlayerState, Dict[str, Any]],
    tags=["Геймплей"],
    summary="Отримання повного поточного стану гравця в кампанії",
    description="Повертає актуальний об'єкт PlayerState для заданої кампанії."
)
async def get_current_state(session_id: str = Query(default="default", description="ID кампанії (session_id)")):
    game_state = llm_controller.get_game_state(session_id)
    return game_state.get_current_state()


# =========================================================================
# 7. Зворотна сумісність для сесій (Старі роути)
# =========================================================================

@app.get(
    "/api/v1/sessions",
    response_model=List[SessionInfo],
    tags=["Сумісність"],
    summary="Отримання списку всіх кампаній (Legacy)",
    deprecated=True
)
async def get_sessions_legacy():
    # Повертає список кампаній, перетворених у SessionInfo
    all_campaigns = []
    for char in llm_controller.character_manager.list_characters():
        for c in llm_controller.campaign_manager.list_campaigns_for_character(char.char_id):
            all_campaigns.append(SessionInfo(
                session_id=c.campaign_id,
                character_name=char.name,
                location=c.current_location,
                path=llm_controller.campaign_manager.get_campaign_dir(c.campaign_id)
            ))
    return all_campaigns


@app.post(
    "/api/v1/sessions/{session_id}/reset",
    response_model=Union[PlayerState, Dict[str, Any]],
    tags=["Сумісність"],
    summary="Скидання ігрової кампанії (Legacy)",
    deprecated=True
)
async def reset_session_legacy(session_id: str):
    # Скидає стан кампанії
    state = llm_controller.get_game_state(session_id)
    state._init_default_state()
    return state.get_current_state()


if __name__ == "__main__":
    uvicorn.run("main:app", host="127.0.0.1", port=8000, reload=True)
