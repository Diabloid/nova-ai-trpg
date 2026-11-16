from typing import List, Optional
from fastapi import APIRouter, Path, Query, status
from schemas.game_dto import CharacterSummary, PlayerState
from dependencies import llm_controller

router = APIRouter(prefix="/api/v1/characters", tags=["Персонажі"])


@router.get(
    "",
    response_model=List[CharacterSummary],
    summary="Отримати список усіх заготовок героїв (опційно за world_id)"
)
async def list_characters(world_id: Optional[str] = Query(default=None, description="Фільтр за ідентифікатором світу")):
    return llm_controller.character_manager.list_characters(world_id=world_id)


@router.get(
    "/{char_id}",
    response_model=PlayerState,
    summary="Отримати повний стан заготовки персонажа"
)
async def get_character(char_id: str = Path(..., description="ID персонажа")):
    return llm_controller.character_manager.get_character(char_id)


@router.post(
    "",
    response_model=CharacterSummary,
    status_code=status.HTTP_201_CREATED,
    summary="Створити нову заготовку персонажа вручну"
)
async def create_character(state: PlayerState, char_id: Optional[str] = Query(default=None)):
    target_id = char_id or llm_controller.character_manager.generate_new_char_id(state.meta.name)
    return llm_controller.character_manager.save_character(target_id, state)


@router.put(
    "/{char_id}",
    response_model=PlayerState,
    summary="Редагувати заготовку героя"
)
async def update_character(
    char_id: str = Path(..., description="ID персонажа"),
    state: PlayerState = ...
):
    llm_controller.character_manager.save_character(char_id, state)
    return state


@router.delete(
    "/{char_id}",
    summary="Видалити заготовку персонажа"
)
async def delete_character(char_id: str = Path(..., description="ID персонажа")):
    llm_controller.character_manager.delete_character(char_id)
    return {"status": "deleted", "char_id": char_id}
