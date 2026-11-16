from typing import List
from fastapi import APIRouter, Path, status
from schemas.game_dto import (
    CampaignSummary,
    CampaignCreateRequest,
    CampaignPinRequest,
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


@router.post(
    "/campaigns/{campaign_id}/rollback",
    response_model=RollbackResponse,
    response_model_exclude_none=True,
    summary="Відкат останнього ходу кампанії на 1 крок назад (Undo)"
)
async def rollback_campaign_turn(campaign_id: str = Path(..., description="ID кампанії")):
    prev_input, state_dict = llm_controller.campaign_manager.rollback_campaign_turn(campaign_id)
    msg = "Хід успішно відкочено на 1 крок назад" if prev_input else "Немає ходів гравця для відкату"
    return RollbackResponse(
        previous_user_input=prev_input,
        current_state=state_dict,
        message=msg
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
