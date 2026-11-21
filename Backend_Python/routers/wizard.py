from typing import Any, Dict, List
from fastapi import APIRouter, HTTPException, status
from core.template_presets import get_template_presets
from schemas.game_dto import (
    CharacterDialogRequest,
    CharacterDialogResponse,
    CharacterSyncRequest,
    CharacterFinalizeRequest,
    PlayerState,
    TemplatePreset,
    TranslateKeysRequest,
    TranslateKeysResponse,
)
from dependencies import llm_controller, logger

router = APIRouter(prefix="/api/v1/character", tags=["Character Wizard"])
templates_router = APIRouter(prefix="/api/v1/templates", tags=["Character Wizard"])


@templates_router.get(
    "/presets",
    response_model=List[TemplatePreset],
    summary="Список вбудованих жанрових пресетів анкет персонажів"
)
async def list_template_presets():
    return get_template_presets()


@templates_router.post(
    "/translate-keys",
    response_model=TranslateKeysResponse,
    summary="Разовий кешований TRPG-переклад не-кириличних ключів анкети"
)
async def translate_template_keys(request: TranslateKeysRequest):
    labels = await llm_controller.translate_template_keys(request.keys)
    return TranslateKeysResponse(labels=labels)


@router.post(
    "/dialog",
    response_model=CharacterDialogResponse,
    response_model_exclude_none=True,
    summary="Інтерактивний крок діалогу з Творцем Долі (з Live Preview)"
)
async def character_wizard_dialog(request: CharacterDialogRequest):
    reply, draft_state, unlocked_fields = await llm_controller.dialog_with_creator(
        message=request.message,
        history=request.history,
        include_draft=request.include_draft,
        draft_state=request.draft_state,
        locked_fields=request.locked_fields,
        world_id=request.world_id,
        template_override=request.template_override
    )
    if isinstance(draft_state, PlayerState):
        draft_payload: Any = draft_state.model_dump(exclude_none=True)
    else:
        draft_payload = draft_state
    return CharacterDialogResponse(
        reply=reply,
        draft_state=draft_payload,
        unlocked_fields=unlocked_fields or None,
    )


@router.post(
    "/sync-draft",
    response_model=Dict[str, Any],
    summary="Синхронізувати та перерахувати залежні поля після ручного редагування прев'ю (Live Sync)"
)
async def character_wizard_sync_draft(request: CharacterSyncRequest):
    """
    Приймає суворо типізований CharacterSyncRequest
    та перераховує взаємозалежні атрибути без втрати ручних правок.
    """
    draft_dict = request.draft_state
    world_id = request.world_id or (draft_dict.get("meta") or {}).get("world_id")

    synced = await llm_controller.sync_character_draft(
        draft_dict,
        world_id=world_id,
        template_override=request.template_override
    )
    if isinstance(synced, PlayerState):
        return synced.model_dump(exclude_none=True)
    return synced


@router.post(
    "/finalize",
    response_model=Dict[str, Any],
    summary="Згенерувати та зберегти фінальний лист героя за результатами діалогу (з підтримкою draft_state)"
)
async def character_wizard_finalize(request: CharacterFinalizeRequest):
    try:
        player_state = await llm_controller.finalize_character_concept(
            dialog_summary=request.dialog_summary,
            history=request.history,
            draft_state=request.draft_state,
            world_id=request.world_id,
            template_override=request.template_override
        )
    except Exception as e:
        logger.error(f"❌ Помилка генерації листа героя через ШІ: {e}")
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=f"Не вдалося згенерувати лист героя через збій ШІ-провайдерів: {e}"
        )

    state_dict = (
        player_state.model_dump(exclude_none=True)
        if isinstance(player_state, PlayerState)
        else dict(player_state)
    )
    char_name = (state_dict.get("meta") or {}).get("name") or "hero"

    # Зберігаємо створеного персонажа в базу (для нового ID — ASCII-slugify)
    target_char_id = request.char_id or llm_controller.character_manager.generate_new_char_id(char_name)
    llm_controller.character_manager.save_character(target_char_id, state_dict)
    logger.info(f"✨ Створено нового героя з AI: '{char_name}' (ID: {target_char_id})")
    return llm_controller.character_manager.get_character(target_char_id)
