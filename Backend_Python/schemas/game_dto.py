from typing import List, Dict, Any, Optional, Union
from pydantic import BaseModel, Field, ConfigDict


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
        description="Ідентифікатор ігрової сесії/слота збереження. За замовчуванням: 'default'",
        examples=["default"]
    )


class PlayerMeta(BaseModel):
    """Метадані персонажа та поточна сцена."""
    model_config = ConfigDict(extra="allow")

    name: str = Field(default="Мандрівник", description="Ім'я персонажа")
    background: Optional[str] = Field(default="Шукач пригод", description="Передісторія / архетип")
    location: Optional[str] = Field(default="Невідомий ліс", description="Поточна локація персонажа")
    appearance: Optional[str] = Field(default=None, description="Опис зовної зовнішності")


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


class StorageAndEquipment(BaseModel):
    """Екіпірування та ієрархічні контейнери з багатими об'єктами предметів."""
    model_config = ConfigDict(extra="allow")

    worn: List[Union[ItemObject, Dict[str, Any], str]] = Field(
        default_factory=list,
        description="Одяг та надіті елементи броні (об'єкти {name, desc} або рядки)"
    )
    containers: Dict[str, List[Union[ItemObject, Dict[str, Any], str]]] = Field(
        default_factory=dict,
        description="Словник контейнерів (рюкзак, кишені) та списки предметів"
    )


class AbilityObject(BaseModel):
    """Багатий об'єкт здібності/навички персонажа."""
    model_config = ConfigDict(extra="allow")

    name: str = Field(..., description="Назва здібності")
    desc: Optional[str] = Field(default="", description="Опис або ефект здібності")


class PlayerState(BaseModel):
    """Повний стан персонажа (PlayerState DTO)."""
    model_config = ConfigDict(extra="allow")

    meta: PlayerMeta = Field(default_factory=PlayerMeta)
    anatomy_and_health: AnatomyAndHealth = Field(default_factory=AnatomyAndHealth)
    storage_and_equipment: StorageAndEquipment = Field(default_factory=StorageAndEquipment)
    abilities: List[Union[AbilityObject, Dict[str, Any], str]] = Field(
        default_factory=list,
        description="Активні та пасивні навички/здібності персонажа (об'єкти {name, desc} або рядки)"
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


class SessionInfo(BaseModel):
    """Інформація про збережену ігрову сесію."""
    model_config = ConfigDict(extra="allow")

    session_id: str
    character_name: str
    location: str
    path: str
