from typing import List
from fastapi import APIRouter, HTTPException, Path, Query, status
from fastapi.responses import JSONResponse

from core.world_manager import WorldDeleteConflictError
from dependencies import llm_controller
from schemas.game_dto import (
    CharacterTemplateDraftResponse,
    LoreArticleResponse,
    LoreArticleSaveRequest,
    WorldAiPrompts,
    WorldCloneRequest,
    WorldCreateRequest,
    WorldDeleteConflict,
    WorldDetailResponse,
    WorldFinalizeRequest,
    WorldLoreGenRequest,
    WorldLoreGenResponse,
    WorldPassportDraftResponse,
    WorldPromptsGenRequest,
    WorldSummary,
    WorldTemplateGenRequest,
    WorldUpdateRequest,
    WorldWizardStepRequest,
)

router = APIRouter(prefix="/api/v1/worlds", tags=["Світи"])


@router.get(
    "",
    response_model=List[WorldSummary],
    summary="Список усіх світів із підрахунком персонажів"
)
async def list_worlds():
    return llm_controller.world_manager.list_worlds(
        character_manager=llm_controller.character_manager
    )


@router.get(
    "/{world_id}",
    response_model=WorldDetailResponse,
    summary="Отримати паспорт, промпти, шаблон персонажа та статті лору світу"
)
async def get_world_detail(world_id: str = Path(..., description="Ідентифікатор світу")):
    return llm_controller.world_manager.get_world_detail(
        world_id,
        character_manager=llm_controller.character_manager
    )


@router.post(
    "",
    response_model=WorldSummary,
    status_code=status.HTTP_201_CREATED,
    summary="Створити новий світ вручну"
)
async def create_world(request: WorldCreateRequest):
    return llm_controller.world_manager.create_world(request)


@router.post(
    "/{world_id}/clone",
    response_model=WorldSummary,
    status_code=status.HTTP_201_CREATED,
    summary="Клонувати існуючий світ як базу для нового"
)
async def clone_world(
    world_id: str = Path(..., description="ID вихідного світу"),
    request: WorldCloneRequest = ...,
):
    return llm_controller.world_manager.clone_world(world_id, request)


@router.put(
    "/{world_id}",
    response_model=WorldDetailResponse,
    summary="Оновити паспорт, ai_prompts або character_template світу"
)
async def update_world(
    world_id: str = Path(..., description="Ідентифікатор світу"),
    request: WorldUpdateRequest = ...,
):
    updated = llm_controller.world_manager.update_world(world_id, request)
    llm_controller.prompt_service.invalidate_world_cache(updated.world_id)
    return updated


@router.delete(
    "/{world_id}",
    responses={409: {"model": WorldDeleteConflict}},
    summary="Видалити кастомний світ (із захистом default_dark_fantasy та 409 при залежностях)"
)
async def delete_world(
    world_id: str = Path(..., description="Ідентифікатор світу"),
    cascade: bool = Query(default=False, description="Каскадне видалення залежних героїв і кампаній"),
):
    try:
        result = llm_controller.world_manager.delete_world(
            world_id,
            cascade=cascade,
            character_manager=llm_controller.character_manager,
            campaign_manager=llm_controller.campaign_manager,
        )
        llm_controller.prompt_service.invalidate_world_cache(result["world_id"])
        return result
    except WorldDeleteConflictError as exc:
        return JSONResponse(
            status_code=status.HTTP_409_CONFLICT,
            content=exc.conflict.model_dump(),
        )


@router.get(
    "/{world_id}/lore/{filename}",
    response_model=LoreArticleResponse,
    summary="Отримати текст статті лору світу"
)
async def get_lore_article(
    world_id: str = Path(..., description="Ідентифікатор світу"),
    filename: str = Path(..., description="Ім'я файлу статті (.md або .txt)"),
):
    return llm_controller.world_manager.get_lore_article(world_id, filename)


@router.put(
    "/{world_id}/lore/{filename}",
    summary="Створити або оновити статтю лору світу"
)
async def save_lore_article(
    world_id: str = Path(..., description="Ідентифікатор світу"),
    filename: str = Path(..., description="Ім'я файлу статті (.md або .txt)"),
    request: LoreArticleSaveRequest = ...,
):
    res = llm_controller.world_manager.save_lore_article(world_id, filename, request.content)
    llm_controller.prompt_service.invalidate_world_cache(world_id.strip().lower())
    return res


@router.delete(
    "/{world_id}/lore/{filename}",
    summary="Видалити статтю лору світу"
)
async def delete_lore_article(
    world_id: str = Path(..., description="Ідентифікатор світу"),
    filename: str = Path(..., description="Ім'я файлу статті (.md або .txt)"),
):
    res = llm_controller.world_manager.delete_lore_article(world_id, filename)
    llm_controller.prompt_service.invalidate_world_cache(world_id.strip().lower())
    return res


# 4-Кроковий AI-Майстер Світів (/api/v1/worlds/wizard/*)

@router.post(
    "/wizard/step-passport",
    response_model=WorldPassportDraftResponse,
    summary="Крок 1: Діалог або one-shot генерація чернетки паспорта світу"
)
async def world_wizard_step_passport(request: WorldWizardStepRequest):
    try:
        return await llm_controller.world_wizard_step_passport(request)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=f"Помилка ШІ-провайдера на Кроці 1 (паспорт світу): {e}",
        )


@router.post(
    "/wizard/generate-prompts",
    response_model=WorldAiPrompts,
    summary="Крок 2: Генерація/оновлення 4 сеттингових ШІ-правил світу"
)
async def world_wizard_generate_prompts(request: WorldPromptsGenRequest):
    try:
        return await llm_controller.world_wizard_generate_prompts(request)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=f"Помилка ШІ-провайдера на Кроці 2 (генерація промптів): {e}",
        )


@router.post(
    "/wizard/generate-lore",
    response_model=WorldLoreGenResponse,
    response_model_exclude_none=True,
    summary="Крок 3: Планування 5 тем або генерація/розширення статті лору"
)
async def world_wizard_generate_lore(request: WorldLoreGenRequest):
    mode = (request.mode or "plan_topics").strip().lower()
    if mode not in ("plan_topics", "generate_article", "expand_article"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Невідомий режим генерації лору: '{request.mode}'",
        )
    try:
        return await llm_controller.world_wizard_generate_lore(request)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=f"Помилка ШІ-провайдера на Кроці 3 (генерація лору): {e}",
        )


@router.post(
    "/wizard/generate-template",
    response_model=CharacterTemplateDraftResponse,
    response_model_exclude_none=True,
    summary="Крок 4: AI-генерація/правка character_template.json + demo_state"
)
async def world_wizard_generate_template(request: WorldTemplateGenRequest):
    try:
        return await llm_controller.world_wizard_generate_template(request)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=f"Помилка ШІ-провайдера на Кроці 4 (генерація шаблону): {e}",
        )


@router.post(
    "/wizard/finalize",
    response_model=WorldDetailResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Фіналізація: атомарне створення пакета світу на диску"
)
async def world_wizard_finalize(request: WorldFinalizeRequest):
    try:
        return await llm_controller.world_wizard_finalize(request)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Помилка фіналізації пакета світу (зміни відкочено): {e}",
        )
