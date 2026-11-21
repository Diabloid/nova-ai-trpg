from typing import Any, Dict, List, Optional
from pydantic import BaseModel, Field

from schemas.base import FlexibleDTO


class CharacterSummary(FlexibleDTO):
    """Коротка інформація про заготовку персонажа."""

    char_id: str = Field(..., description="Унікальний ідентифікатор заготовки героя")
    world_id: str = Field(default="default_dark_fantasy", description="Ідентифікатор світу персонажа")
    name: str = Field(..., description="Ім'я персонажа")
    background: str = Field(default="", description="Передісторія / фах")
    appearance: Optional[str] = Field(default="", description="Опис зовнішності")
    avatar: Optional[str] = Field(default=None, description="Аватар з meta.avatar")
    created_at: str = Field(..., description="ISO 8601 дата створення заготовки")
    updated_at: Optional[str] = Field(default=None, description="ISO 8601 дата останнього оновлення")


class TemplatePreset(FlexibleDTO):
    """Вбудований жанровий пресет анкети персонажа."""

    id: str = Field(..., description="Унікальний ID пресету")
    title: str = Field(..., description="Назва пресету")
    genre: str = Field(..., description="Жанр")
    description: str = Field(default="", description="Короткий опис")
    icon: str = Field(default="scroll-text", description="Ключ векторної іконки lucide-react")
    template: Dict[str, Any] = Field(default_factory=dict, description="JSON-шаблон анкети зі схемою _schema_meta")


class TranslateKeysRequest(BaseModel):
    """Запит на переклад не-кириличних TRPG-ключів (POST /api/v1/templates/translate-keys)."""

    keys: List[str] = Field(default_factory=list, description="Список англомовних/технічних ключів для перекладу")


class TranslateKeysResponse(BaseModel):
    """Мапа перекладених українських підписів для ключів анкети."""

    labels: Dict[str, str] = Field(default_factory=dict, description="Словник {оригінальний_ключ: український_підпис}")
