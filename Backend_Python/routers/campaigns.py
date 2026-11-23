from typing import Any, Dict, List
from fastapi import APIRouter, Path, status
from schemas.game_dto import (
    CampaignSummary,
    CampaignCreateRequest,
    CampaignPinRequest,
    EditLastNarratorRequest,
    EditLastNarratorResponse,
    HistoryMessage,
    RollbackResponse,
    PlayerState
)
from dependencies import llm_controller, logger

router = APIRouter(prefix="/api/v1", tags=["Кампанії"])


@router.get(
    "/characters/{char_id}/campaigns",
    response_model=List[CampaignSummary],
    summary="Список усіх кампаній персонажа (закріплені вгорі)"
)
async def list_campaigns(char_id: str = Path(..., description="ID персонажа")):
    return llm_controller.campaign_manager.list_campaigns_for_character(char_id)


@router.post(
    "/characters/{char_id}/campaigns",
    response_model=CampaignSummary,
    status_code=status.HTTP_201_CREATED,
    summary="Створити нову кампанію + автогенерація стартового художнього посту"
)
async def create_campaign(
    char_id: str = Path(..., description="ID персонажа"),
    request: CampaignCreateRequest = CampaignCreateRequest()
):
    # Генератор оповіді для вступного посту з чистим контекстом і world_id обраного світу
    async def generate_intro(prompt: str, player_state_str: str, world_id: str = "default_dark_fantasy") -> str:
        return await llm_controller.generate_story(
            raw_text=prompt,
            player_state=player_state_str,
            recent_messages=[],
            summary_text="",
            world_id=world_id
        )

    summary = await llm_controller.campaign_manager.create_campaign(
        char_id=char_id,
        title=request.title,
        narrator_generator=generate_intro
    )
    logger.info(f"⚔️ Створено нову кампанію '{summary.title}' для персонажа '{char_id}' з художнім вступом!")
    return summary


@router.get(
    "/campaigns/{campaign_id}/history",
    response_model=List[HistoryMessage],
    summary="Отримати повну хронологічну історію повідомлень кампанії"
)
async def get_campaign_history(campaign_id: str = Path(..., description="ID кампанії")):
    return llm_controller.campaign_manager.get_campaign_history(campaign_id)


@router.put(
    "/campaigns/{campaign_id}/state",
    response_model=Dict[str, Any],
    summary="Ручне оновлення живого стану сейву (Студія: Режим B)"
)
async def update_campaign_state(
    campaign_id: str = Path(..., description="ID кампанії"),
    state: Dict[str, Any] = ...,
):
    return llm_controller.campaign_manager.update_campaign_state(campaign_id, state)


@router.post(
    "/campaigns/{campaign_id}/rollback",
    response_model=RollbackResponse,
    response_model_exclude_none=True,
    summary="Відкат останнього ходу кампанії на 1 крок назад (Undo)"
)
async def rollback_campaign_turn(campaign_id: str = Path(..., description="ID кампанії")):
    prev_input, state_dict, remaining_depth = llm_controller.campaign_manager.rollback_campaign_turn(campaign_id)
    return RollbackResponse(
        previous_user_input=prev_input,
        current_state=state_dict,
        message="Хід успішно відкочено на 1 крок назад",
        can_rollback=remaining_depth > 0,
        rollback_depth=remaining_depth
    )


@router.patch(
    "/campaigns/{campaign_id}/messages/last-narrator",
    response_model=EditLastNarratorResponse,
    response_model_exclude_none=True,
    summary="Редагувати текст останньої відповіді Оповідача (з опціональним перерахунком стану)"
)
async def edit_last_narrator_message(
    campaign_id: str = Path(..., description="ID кампанії"),
    request: EditLastNarratorRequest = ...,
):
    async def analyze_edited_state(intents, story_text: str, player_state: str, world_id: str):
        return await llm_controller.generate_state_json(
            intents=intents,
            story_text=story_text,
            player_state=player_state,
            session_id=campaign_id,
            world_id=world_id,
        )

    return await llm_controller.campaign_manager.edit_last_narrator_message(
        campaign_id=campaign_id,
        new_text=request.new_text,
        recalculate_state=request.recalculate_state,
        state_analyzer=analyze_edited_state,
    )


@router.patch(
    "/campaigns/{campaign_id}/pin",
    response_model=CampaignSummary,
    summary="Закріпити або відкріпити кампанію"
)
async def pin_campaign(
    campaign_id: str = Path(..., description="ID кампанії"),
    request: CampaignPinRequest = ...
):
    return llm_controller.campaign_manager.pin_campaign(campaign_id, request.is_pinned)


@router.delete(
    "/campaigns/{campaign_id}",
    summary="Видалити кампанію з диска"
)
async def delete_campaign(campaign_id: str = Path(..., description="ID кампанії")):
    llm_controller.campaign_manager.delete_campaign(campaign_id)
    return {"status": "deleted", "campaign_id": campaign_id}
