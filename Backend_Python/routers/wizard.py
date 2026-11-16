from fastapi import APIRouter, HTTPException, status
from schemas.game_dto import (
    CharacterDialogRequest,
    CharacterDialogResponse,
    CharacterFinalizeRequest,
    PlayerState
)
from dependencies import llm_controller, logger

router = APIRouter(prefix="/api/v1/character", tags=["Character Wizard"])


@router.post(
    "/dialog",
    response_model=CharacterDialogResponse,
    summary="Інтерактивний крок діалогу з Творцем Долі (з Live Preview)"
)
async def character_wizard_dialog(request: CharacterDialogRequest):
    reply, draft_state = await llm_controller.dialog_with_creator(
        message=request.message,
        history=request.history,
        include_draft=request.include_draft,
        world_id=request.world_id
    )
    return CharacterDialogResponse(reply=reply, draft_state=draft_state)


@router.post(
    "/sync-draft",
    response_model=PlayerState,
    summary="Синхронізувати та перерахувати залежні поля після ручного редагування прев'ю (Live Sync, v1.5.0)"
)
async def character_wizard_sync_draft(request: PlayerState):
    """
    Приймає поточний стан PlayerState з ручними правками користувача
    та перераховує взаємозалежні атрибути (вміння, травми/шрами, титули, речі).
    """
    return await llm_controller.sync_character_draft(request)


@router.post(
    "/finalize",
    response_model=PlayerState,
    summary="Згенерувати та зберегти фінальний лист героя за результатами діалогу (з підтримкою draft_state)"
)
async def character_wizard_finalize(request: CharacterFinalizeRequest):
    try:
        player_state = await llm_controller.finalize_character_concept(
            dialog_summary=request.dialog_summary,
            history=request.history,
            draft_state=request.draft_state,
            world_id=request.world_id
        )
    except Exception as e:
        logger.error(f"❌ Помилка генерації листа героя через ШІ: {e}")
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=f"Не вдалося згенерувати лист героя через збій ШІ-провайдерів: {e}"
        )

    # Зберігаємо створеного персонажа в базу (для нового ID — ASCII-slugify)
    target_char_id = request.char_id or llm_controller.character_manager.generate_new_char_id(player_state.meta.name)
    llm_controller.character_manager.save_character(target_char_id, player_state)
    logger.info(f"✨ Створено нового героя з AI: '{player_state.meta.name}' (ID: {target_char_id})")
    return player_state
