from typing import Any, Dict, List, Optional, Union
from pydantic import Field

from schemas.base import FlexibleDTO


class IntentItem(FlexibleDTO):
    """Елемент наміру гравця, виділений синтаксичним парсером."""

    type: str = Field(
        ...,
        description="Тип наміру: 'action' (дія **), 'speech' (репліка -), 'thought' (думка \"), 'ooc' (поза грою ())",
        examples=["action"],
    )
    content: str = Field(
        ...,
        description="Зміст наміру гравця",
        examples=["Дістаю ключ із рюкзака та відмикаю старі двері"],
    )


class ActionRequest(FlexibleDTO):
    """Контракт вхідного запиту дії гравця (POST /api/v1/action та POST /api/v1/action/stream)."""

    raw_text: str = Field(
        ...,
        description="Повний нерозбитий текст гравця для контексту Оповідача",
        examples=["Дістаю ключ із рюкзака та відмикаю старі двері"],
    )
    intents: List[IntentItem] = Field(
        default_factory=list,
        description="Список розпізнаних намірів для фільтрації Аналізатором",
        examples=[[{"type": "action", "content": "Дістаю ключ із рюкзака та відмикаю старі двері"}]],
    )
    session_id: Optional[str] = Field(
        default="default",
        description="Ідентифікатор ігрової кампанії (campaign_id / session_id). За замовчуванням: 'default'",
        examples=["ayven_chapel_run_1"],
    )


class PlayerMeta(FlexibleDTO):
    """Метадані персонажа та поточна сцена."""

    world_id: str = Field(default="default_dark_fantasy", description="Ідентифікатор світу персонажа")
    name: str = Field(default="Мандрівник", description="Ім'я або повне звертання до персонажа")
    first_name: Optional[str] = Field(default=None, description="Власне ім'я")
    last_name: Optional[str] = Field(default=None, description="Прізвище або родове ім'я")
    patronymic: Optional[str] = Field(default=None, description="По батькові")
    titles: Optional[Union[str, List[str]]] = Field(default=None, description="Титули, епітети або військові звання")
    age: Optional[Union[str, int]] = Field(default=None, description="Вік персонажа")
    location: Optional[str] = Field(default=None, description="Поточна локація персонажа")
    overall_state: Optional[str] = Field(default=None, description="Загальний стан героя (для кастомних шаблонів)")
    appearance: Optional[str] = Field(default=None, description="Загальний художній опис зовнішності")
    appearance_details: Optional[Dict[str, Any]] = Field(
        default=None,
        description="Деталі зовнішності: статура, зріст, очі, волосся, расові ознаки",
    )
    biography: Optional[str] = Field(default=None, description="Біографія, походження та хронологія героя")
    avatar: Optional[str] = Field(default=None, description="Data URI аватара або ключ іконки lucide-react")


class InjuryItem(FlexibleDTO):
    """Деталізація травми чи поранення персонажа."""

    location: str = Field(..., description="Частина тіла (наприклад: 'Ліве передпліччя', 'Спина')")
    type: Optional[str] = Field(default=None, description="Медичний опис або тип ушкодження")
    description: Optional[str] = Field(default=None, description="Додатковий опис поранення")


class AnatomyAndHealth(FlexibleDTO):
    """Анатомічна модель здоров'я."""

    overall_state: str = Field(
        default="Повний сил",
        description="Загальне самопочуття, рівень втоми чи магічного виснаження",
    )
    injuries: List[Union[InjuryItem, Dict[str, Any], str]] = Field(
        default_factory=list,
        description="Список локалізованих травм та поранень",
    )


class ItemObject(FlexibleDTO):
    """Багатий об'єкт предмета інвентарю/екіпірування."""

    name: str = Field(..., description="Назва предмета")
    desc: Optional[str] = Field(default="", description="Художній або технічний опис предмета")


class AbilityItem(FlexibleDTO):
    """Опис вміння чи навички персонажа."""

    name: str = Field(..., description="Назва вміння")
    desc: Optional[str] = Field(default="", description="Опис вміння/закляття")


class StorageAndEquipment(FlexibleDTO):
    """Екіпірування та ієрархічні контейнери."""

    worn: List[Union[ItemObject, Dict[str, Any], str]] = Field(
        default_factory=list,
        description="Одяг та надіті елементи броні (об'єкти {name, desc} або рядки)",
    )
    containers: Dict[str, List[Union[ItemObject, Dict[str, Any], str]]] = Field(
        default_factory=dict,
        description="Словник контейнерів (рюкзак, кишені) та списки предметів",
    )


class PlayerState(FlexibleDTO):
    """Повний стан персонажа без жорстких жанрових дефолтів."""

    meta: PlayerMeta = Field(default_factory=PlayerMeta)
    anatomy_and_health: Optional[AnatomyAndHealth] = Field(
        default=None,
        description="Анатомія та здоров'я (для фентезі-шаблонів)",
    )
    storage_and_equipment: Optional[StorageAndEquipment] = Field(
        default=None,
        description="Екіпірування та контейнери (для фентезі-шаблонів)",
    )
    abilities: Optional[List[Union[AbilityItem, Dict[str, Any], str]]] = Field(
        default=None,
        description="Активні та пасивні навички/здібності персонажа",
    )
    custom_blocks: Optional[Dict[str, Any]] = Field(
        default=None,
        description="Динамічні довільні блоки шаблону",
    )


class ActionResponse(FlexibleDTO):
    """Контракт вихідної відповіді сервера (POST /api/v1/action)."""

    status: str = Field(
        default="success",
        description="Статус обробки: 'success' або 'error'",
        examples=["success"],
    )
    story: str = Field(
        ...,
        description="Художня відповідь Оповідача (GM)",
        examples=["Ти повільно повертаєш іржавий ключ у замку. Залізні двері з глухим скрипом відчиняються..."],
    )
    raw_llm_state: Optional[str] = Field(
        default=None,
        description="Сирий JSON дельти від Аналізатора",
    )
    player_state: Optional[Union[Dict[str, Any], PlayerState]] = Field(
        default=None,
        description="Повний оновлений стан персонажа після валідації та мутації",
    )
    error_message: Optional[str] = Field(
        default=None,
        description="Опис помилки у разі невдалого виконання пайплайну",
    )
