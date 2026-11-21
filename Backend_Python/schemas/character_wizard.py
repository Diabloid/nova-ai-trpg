from typing import Any, Dict, List, Optional, Union
from pydantic import Field

from schemas.base import FlexibleDTO
from schemas.gameplay import PlayerState


class CharacterDialogRequest(FlexibleDTO):
    """Запит діалогу зі створення героя через Творця Долі."""

    message: str = Field(..., description="Репліка гравця до Творця Долі")
    history: List[Dict[str, str]] = Field(
        default_factory=list,
        description="Історія діалогу створення [{'role': 'user'|'assistant', 'content': '...'}]",
    )
    include_draft: bool = Field(
        default=False,
        description="Чи формувати проміжний стан PlayerState (Live Preview) для правої панелі клієнта",
    )
    draft_state: Optional[Dict[str, Any]] = Field(
        default=None,
        description="Поточна чернетка анкети з правого прев'ю для захисту ручних правок під час діалогу",
    )
    locked_fields: Optional[List[str]] = Field(
        default=None,
        description="Список dot-шляхів заблокованих ручних полів (напр. ['meta.name', 'meta.location'])",
    )
    world_id: Optional[str] = Field(default=None, description="ID світу, в якому створюється персонаж")
    template_override: Optional[Dict[str, Any]] = Field(
        default=None,
        description="Опціональний оверрайд шаблону персонажа",
    )


class CharacterDialogResponse(FlexibleDTO):
    """Відповідь Творця Долі."""

    reply: str = Field(..., description="Атмосферна відповідь Творця Долі")
    draft_state: Optional[Union[Dict[str, Any], PlayerState]] = Field(
        default=None,
        description="Актуальний проміжний стан героя для панелі Live Preview клієнта (якщо include_draft=True)",
    )
    unlocked_fields: Optional[List[str]] = Field(
        default=None,
        description="Список dot-шляхів полів, які гравець явно попросив змінити в останньому повідомленні (для зняття lock у прев'ю)",
    )


class CharacterSyncRequest(FlexibleDTO):
    """Запит на синхронізацію ручних правок прев'ю за схемою світу."""

    draft_state: Dict[str, Any] = Field(..., description="Актуальний JSON чернетки з ручними правками")
    world_id: Optional[str] = Field(default=None, description="ID світу")
    template_override: Optional[Dict[str, Any]] = Field(
        default=None,
        description="Опціональний оверрайд шаблону персонажа",
    )


class CharacterFinalizeRequest(FlexibleDTO):
    """Запит на фінальну генерацію заготовки персонажа на основі діалогу."""

    dialog_summary: Optional[str] = Field(default=None, description="Підсумок діалогу створення")
    history: Optional[List[Dict[str, str]]] = Field(
        default_factory=list,
        description="Повна історія діалогу створення, якщо summary немає",
    )
    char_id: Optional[str] = Field(default=None, description="Бажаний унікальний ID заготовки героя")
    draft_state: Optional[Union[Dict[str, Any], PlayerState]] = Field(
        default=None,
        description="Актуальний драфт з ручними правками прев'ю",
    )
    world_id: Optional[str] = Field(default=None, description="ID світу, в якому фіналізується персонаж")
    template_override: Optional[Dict[str, Any]] = Field(
        default=None,
        description="Опціональний оверрайд шаблону персонажа",
    )
