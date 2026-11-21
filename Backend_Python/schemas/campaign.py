from typing import Any, Dict, Optional, Union
from pydantic import Field

from schemas.base import FlexibleDTO
from schemas.gameplay import PlayerState


class CampaignSummary(FlexibleDTO):
    """Інформація про ігрову кампанію/чат."""

    campaign_id: str = Field(..., description="Унікальний ідентифікатор кампанії (session_id)")
    char_id: str = Field(..., description="ID прив'язаного персонажа-шаблону")
    world_id: str = Field(default="default_dark_fantasy", description="Ідентифікатор світу кампанії")
    title: str = Field(..., description="Назва кампанії")
    current_location: str = Field(default="Невідомий ліс", description="Поточна локація персонажа в кампанії")
    is_pinned: bool = Field(default=False, description="Чи закріплена кампанія вгорі списку")
    created_at: str = Field(..., description="ISO 8601 дата створення кампанії")
    last_played: str = Field(..., description="ISO 8601 дата останнього ходу")
    rollback_depth: Optional[int] = Field(default=0, description="Доступна глибина багатокрокового відкату ходів")


class CampaignCreateRequest(FlexibleDTO):
    """Запит на створення нової кампанії для персонажа."""

    title: Optional[str] = Field(default="Нова пригода", description="Назва кампанії")


class CampaignPinRequest(FlexibleDTO):
    """Запит на зміну статусу закріплення кампанії."""

    is_pinned: bool = Field(..., description="true для закріплення, false для відкріплення")


class HistoryMessage(FlexibleDTO):
    """Повідомлення з історії кампанії для завантаження в чат клієнта."""

    role: str = Field(..., description="'player' (гравець), 'narrator' (оповідач), 'system' (система)")
    text: str = Field(..., description="Зміст повідомлення")
    timestamp: str = Field(..., description="ISO 8601 мітка часу повідомлення")


class RollbackResponse(FlexibleDTO):
    """Відповідь на запит відкату ходу."""

    previous_user_input: str = Field(..., description="Текст попередньої дії гравця для повернення в інпут клієнта")
    current_state: Union[Dict[str, Any], PlayerState] = Field(..., description="Відновлений стан героя після відкату")
    message: str = Field(default="Хід успішно відкочено на 1 крок назад", description="Статус операції відкату")
    can_rollback: Optional[bool] = Field(default=None, description="Чи можна відкотити ще хоча б 1 хід")
    rollback_depth: Optional[int] = Field(default=None, description="Скільки кроків відкату залишилось")


class VoiceTranscriptionResponse(FlexibleDTO):
    """Відповідь на розпізнавання голосу."""

    text: str = Field(..., description="Розпізнаний текст дії гравця")


class SessionInfo(FlexibleDTO):
    """Інформація про збережену ігрову сесію (сумісність зі старими викликами)."""

    session_id: str
    character_name: str
    location: str
    path: str
