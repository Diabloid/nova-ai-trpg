from typing import List, Dict, Any, Optional, Union
from pydantic import BaseModel, Field, ConfigDict


# =========================================================================
# 1. Токени намірів та кроки дії
# =========================================================================

class IntentItem(BaseModel):
    """Елемент наміру гравця, виділений синтаксичним парсером."""
    model_config = ConfigDict(extra="allow")

    type: str = Field(
        ...,
        description="Тип наміру: 'action' (дія **), 'speech' (репліка -), 'thought' (думка \"), 'ooc' (поза грою ())",
        examples=["action"]
    )
    content: str = Field(
        ...,
        description="Зміст наміру гравця",
        examples=["Дістаю ключ із рюкзака та відмикаю старі двері"]
    )


class ActionRequest(BaseModel):
    """Контракт вхідного запиту дії гравця (POST /api/v1/action та POST /api/v1/action/stream)."""
    model_config = ConfigDict(extra="allow")

    raw_text: str = Field(
        ...,
        description="Повний нерозбитий текст гравця для контексту Оповідача",
        examples=["Дістаю ключ із рюкзака та відмикаю старі двері"]
    )
    intents: List[IntentItem] = Field(
        default_factory=list,
        description="Список розпізнаних намірів для фільтрації Аналізатором",
        examples=[[{"type": "action", "content": "Дістаю ключ із рюкзака та відмикаю старі двері"}]]
    )
    session_id: Optional[str] = Field(
        default="default",
        description="Ідентифікатор ігрової кампанії (campaign_id / session_id). За замовчуванням: 'default'",
        examples=["ayven_chapel_run_1"]
    )


# =========================================================================
# 2. Модель стану гравця (PlayerState)
# =========================================================================

class PlayerMeta(BaseModel):
    """Метадані персонажа та поточна сцена."""
    model_config = ConfigDict(extra="allow")

    name: str = Field(default="Мандрівник", description="Ім'я персонажа")
    background: Optional[str] = Field(default="Шукач пригод", description="Передісторія / фах")
    location: Optional[str] = Field(default="Невідомий ліс", description="Поточна локація персонажа")
    appearance: Optional[str] = Field(default=None, description="Опис зовнішності персонажа")


class InjuryItem(BaseModel):
    """Деталізація травми чи поранення персонажа."""
    model_config = ConfigDict(extra="allow")

    location: str = Field(..., description="Частина тіла (наприклад: 'Ліве передпліччя', 'Спина')")
    type: Optional[str] = Field(default=None, description="Медичний опис або тип ушкодження")
    description: Optional[str] = Field(default=None, description="Додатковий опис поранення")


class AnatomyAndHealth(BaseModel):
    """Анатомічна модель здоров'я (замість плоского hp)."""
    model_config = ConfigDict(extra="allow")

    overall_state: str = Field(
        default="Повний сил",
        description="Загальне самопочуття, рівень втоми чи магічного виснаження"
    )
    injuries: List[Union[InjuryItem, Dict[str, Any], str]] = Field(
        default_factory=list,
        description="Список локалізованих травм та поранень"
    )


class ItemObject(BaseModel):
    """Багатий об'єкт предмета інвентарю/екіпірування."""
    model_config = ConfigDict(extra="allow")

    name: str = Field(..., description="Назва предмета")
    desc: Optional[str] = Field(default="", description="Художній або технічний опис предмета")


class AbilityItem(BaseModel):
    """Опис вміння чи навички персонажа."""
    model_config = ConfigDict(extra="allow")

    name: str = Field(..., description="Назва вміння")
    desc: Optional[str] = Field(default="", description="Опис вміння/закляття")


class StorageAndEquipment(BaseModel):
    """Екіпірування та ієрархічні контейнери."""
    model_config = ConfigDict(extra="allow")

    worn: List[Union[ItemObject, Dict[str, Any], str]] = Field(
        default_factory=list,
        description="Одяг та надіті елементи броні (об'єкти {name, desc} або рядки)"
    )
    containers: Dict[str, List[Union[ItemObject, Dict[str, Any], str]]] = Field(
        default_factory=dict,
        description="Словник контейнерів (рюкзак, кишені) та списки предметів"
    )


class PlayerState(BaseModel):
    """Повний стан персонажа (PlayerState DTO)."""
    model_config = ConfigDict(extra="allow")

    meta: PlayerMeta = Field(default_factory=PlayerMeta)
    anatomy_and_health: AnatomyAndHealth = Field(default_factory=AnatomyAndHealth)
    storage_and_equipment: StorageAndEquipment = Field(default_factory=StorageAndEquipment)
    abilities: List[Union[AbilityItem, Dict[str, Any], str]] = Field(
        default_factory=list,
        description="Активні та пасивні навички/здібності персонажа"
    )


class ActionResponse(BaseModel):
    """Контракт вихідної відповіді сервера (POST /api/v1/action)."""
    model_config = ConfigDict(extra="allow")

    status: str = Field(
        default="success",
        description="Статус обробки: 'success' або 'error'",
        examples=["success"]
    )
    story: str = Field(
        ...,
        description="Художня відповідь Оповідача (GM)",
        examples=["Ти повільно повертаєш іржавий ключ у замку. Залізні двері з глухим скрипом відчиняються..."]
    )
    raw_llm_state: Optional[str] = Field(
        default=None,
        description="Сирий JSON дельти від Аналізатора"
    )
    player_state: Optional[Union[PlayerState, Dict[str, Any]]] = Field(
        default=None,
        description="Повний оновлений стан персонажа після валідації та мутації"
    )
    error_message: Optional[str] = Field(
        default=None,
        description="Опис помилки у разі невдалого виконання пайплайну"
    )


# =========================================================================
# 3. Персонажі (Character Blueprints, v1.2.0)
# =========================================================================

class CharacterSummary(BaseModel):
    """Коротка інформація про заготовку персонажа."""
    model_config = ConfigDict(extra="allow")

    char_id: str = Field(..., description="Унікальний ідентифікатор заготовки героя")
    name: str = Field(..., description="Ім'я персонажа")
    background: str = Field(default="", description="Передісторія / фах")
    appearance: Optional[str] = Field(default="", description="Опис зовнішності")
    created_at: str = Field(..., description="ISO 8601 дата створення заготовки")


# =========================================================================
# 4. Кампанії (Campaigns, v1.2.0)
# =========================================================================

class CampaignSummary(BaseModel):
    """Інформація про ігрову кампанію/чат."""
    model_config = ConfigDict(extra="allow")

    campaign_id: str = Field(..., description="Унікальний ідентифікатор кампанії (session_id)")
    char_id: str = Field(..., description="ID прив'язаного персонажа-шаблону")
    title: str = Field(..., description="Назва кампанії")
    current_location: str = Field(default="Невідомий ліс", description="Поточна локація персонажа в кампанії")
    is_pinned: bool = Field(default=False, description="Чи закріплена кампанія вгорі списку")
    created_at: str = Field(..., description="ISO 8601 дата створення кампанії")
    last_played: str = Field(..., description="ISO 8601 дата останнього ходу")


class CampaignCreateRequest(BaseModel):
    """Запит на створення нової кампанії для персонажа."""
    model_config = ConfigDict(extra="allow")

    title: Optional[str] = Field(default="Нова пригода", description="Назва кампанії")


class CampaignPinRequest(BaseModel):
    """Запит на зміну статусу закріплення кампанії."""
    model_config = ConfigDict(extra="allow")

    is_pinned: bool = Field(..., description="true для закріплення, false для відкріплення")


# =========================================================================
# 5. Історія повідомлень (History Messages, v1.2.0)
# =========================================================================

class HistoryMessage(BaseModel):
    """Повідомлення з історії кампанії для завантаження в чат клієнта."""
    model_config = ConfigDict(extra="allow")

    role: str = Field(..., description="'player' (гравець), 'narrator' (оповідач), 'system' (система)")
    text: str = Field(..., description="Зміст повідомлення")
    timestamp: str = Field(..., description="ISO 8601 мітка часу повідомлення")


# =========================================================================
# 6. Character Wizard (Створення героя з AI, v1.2.0)
# =========================================================================

class CharacterDialogRequest(BaseModel):
    """Запит діалогу зі створення героя через Творця Долі (v1.3.0)."""
    model_config = ConfigDict(extra="allow")

    message: str = Field(..., description="Репліка гравця до Творця Долі")
    history: List[Dict[str, str]] = Field(
        default_factory=list,
        description="Історія діалогу створення [{'role': 'user'|'assistant', 'content': '...'}]"
    )
    include_draft: bool = Field(
        default=False,
        description="Чи формувати проміжний стан PlayerState (Live Preview) для правої панелі клієнта"
    )


class CharacterDialogResponse(BaseModel):
    """Відповідь Творця Долі (v1.3.0)."""
    model_config = ConfigDict(extra="allow")

    reply: str = Field(..., description="Атмосферна відповідь Творця Долі")
    draft_state: Optional[PlayerState] = Field(
        default=None,
        description="Актуальний проміжний стан героя для панелі Live Preview клієнта (якщо include_draft=True)"
    )


class CharacterFinalizeRequest(BaseModel):
    """Запит на фінальну генерацію заготовки персонажа на основі діалогу."""
    model_config = ConfigDict(extra="allow")

    dialog_summary: Optional[str] = Field(default=None, description="Підсумок діалогу створення")
    history: Optional[List[Dict[str, str]]] = Field(
        default_factory=list,
        description="Повна історія діалогу створення, якщо summary немає"
    )
    char_id: Optional[str] = Field(default=None, description="Бажаний унікальний ID заготовки героя")


# Для сумісності зі старими викликами
class SessionInfo(BaseModel):
    """Інформація про збережену ігрову сесію (аліас до CampaignSummary)."""
    model_config = ConfigDict(extra="allow")

    session_id: str
    character_name: str
    location: str
    path: str
