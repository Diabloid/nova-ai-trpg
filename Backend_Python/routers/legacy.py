from typing import List, Dict, Any, Union
from fastapi import APIRouter
from schemas.game_dto import SessionInfo, PlayerState
from dependencies import llm_controller

router = APIRouter(prefix="/api/v1", tags=["Сумісність"])


@router.get(
    "/sessions",
    response_model=List[SessionInfo],
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


@router.post(
    "/sessions/{session_id}/reset",
    response_model=Union[PlayerState, Dict[str, Any]],
    summary="Скидання ігрової кампанії (Legacy)",
    deprecated=True
)
async def reset_session_legacy(session_id: str):
    # Скидає стан кампанії
    state = llm_controller.get_game_state(session_id)
    state._init_default_state()
    return state.get_current_state()
