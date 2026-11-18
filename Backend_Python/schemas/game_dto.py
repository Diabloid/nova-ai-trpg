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
    """Метадані персонажа та поточна сцена (розширено у v2.0.0 — без фентезі-дефолтів)."""
    model_config = ConfigDict(extra="allow")

    world_id: str = Field(default="default_dark_fantasy", description="Ідентифікатор світу персонажа")
    name: str = Field(default="Мандрівник", description="Ім'я або повне звертання до персонажа")
    first_name: Optional[str] = Field(default=None, description="Власне ім'я")
    last_name: Optional[str] = Field(default=None, description="Прізвище або родове ім'я")
    patronymic: Optional[str] = Field(default=None, description="По батькові")
    titles: Optional[Union[str, List[str]]] = Field(default=None, description="Титули, епітети або військові звання")
    age: Optional[Union[str, int]] = Field(default=None, description="Вік персонажа")
    background: Optional[str] = Field(default=None, description="Передісторія / фах / клас")
    location: Optional[str] = Field(default=None, description="Поточна локація персонажа")
    overall_state: Optional[str] = Field(default=None, description="Загальний стан героя (для кастомних шаблонів)")
    appearance: Optional[str] = Field(default=None, description="Загальний художній опис зовнішності")
    appearance_details: Optional[Dict[str, Any]] = Field(
        default=None,
        description="Деталі зовнішності: статура, зріст, очі, волосся, расові ознаки"
    )
    biography: Optional[str] = Field(default=None, description="Детальна хронологія / передісторія")
    avatar: Optional[str] = Field(default=None, description="Data URI аватара або ключ іконки lucide-react")


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
    """Повний стан персонажа (PlayerState DTO, v2.0.0 — без жорстких фентезі-дефолтів)."""
    model_config = ConfigDict(extra="allow")

    meta: PlayerMeta = Field(default_factory=PlayerMeta)
    anatomy_and_health: Optional[AnatomyAndHealth] = Field(
        default=None,
        description="Анатомія та здоров'я (для фентезі-шаблонів)"
    )
    storage_and_equipment: Optional[StorageAndEquipment] = Field(
        default=None,
        description="Екіпірування та контейнери (для фентезі-шаблонів)"
    )
    abilities: Optional[List[Union[AbilityItem, Dict[str, Any], str]]] = Field(
        default=None,
        description="Активні та пасивні навички/здібності персонажа"
    )
    custom_blocks: Optional[Dict[str, Any]] = Field(
        default=None,
        description="Динамічні довільні блоки шаблону"
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
    player_state: Optional[Union[Dict[str, Any], PlayerState]] = Field(
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
    """Коротка інформація про заготовку персонажа (v2.0.0)."""
    model_config = ConfigDict(extra="allow")

    char_id: str = Field(..., description="Унікальний ідентифікатор заготовки героя")
    world_id: str = Field(default="default_dark_fantasy", description="Ідентифікатор світу персонажа")
    name: str = Field(..., description="Ім'я персонажа")
    background: str = Field(default="", description="Передісторія / фах")
    appearance: Optional[str] = Field(default="", description="Опис зовнішності")
    avatar: Optional[str] = Field(default=None, description="Аватар з meta.avatar")
    created_at: str = Field(..., description="ISO 8601 дата створення заготовки")
    updated_at: Optional[str] = Field(default=None, description="ISO 8601 дата останнього оновлення")


# =========================================================================
# 4. Кампанії (Campaigns, v1.2.0)
# =========================================================================

class CampaignSummary(BaseModel):
    """Інформація про ігрову кампанію/чат (v2.0.0)."""
    model_config = ConfigDict(extra="allow")

    campaign_id: str = Field(..., description="Унікальний ідентифікатор кампанії (session_id)")
    char_id: str = Field(..., description="ID прив'язаного персонажа-шаблону")
    world_id: str = Field(default="default_dark_fantasy", description="Ідентифікатор світу кампанії")
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


class RollbackResponse(BaseModel):
    """Відповідь на запит відкату ходу (Undo, v2.0.0)."""
    model_config = ConfigDict(extra="allow")

    previous_user_input: str = Field(..., description="Текст попередньої дії гравця для повернення в інпут клієнта")
    current_state: Union[Dict[str, Any], PlayerState] = Field(..., description="Відновлений стан героя після відкату")
    message: str = Field(default="Хід успішно відкочено на 1 крок назад", description="Статус операції відкату")


# =========================================================================
# 6. Character Wizard (Створення героя з AI, v1.2.0)
# =========================================================================

class CharacterDialogRequest(BaseModel):
    """Запит діалогу зі створення героя через Творця Долі (v2.0.0)."""
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
    world_id: Optional[str] = Field(default=None, description="ID світу, в якому створюється персонаж")
    template_override: Optional[Dict[str, Any]] = Field(
        default=None,
        description="Опціональний оверрайд шаблону персонажа"
    )


class CharacterDialogResponse(BaseModel):
    """Відповідь Творця Долі (v2.0.0)."""
    model_config = ConfigDict(extra="allow")

    reply: str = Field(..., description="Атмосферна відповідь Творця Долі")
    draft_state: Optional[Union[Dict[str, Any], PlayerState]] = Field(
        default=None,
        description="Актуальний проміжний стан героя для панелі Live Preview клієнта (якщо include_draft=True)"
    )


class CharacterSyncRequest(BaseModel):
    """Запит на синхронізацію ручних правок прев'ю за схемою світу (v2.0.0)."""
    model_config = ConfigDict(extra="allow")

    draft_state: Dict[str, Any] = Field(..., description="Актуальний JSON чернетки з ручними правками")
    world_id: Optional[str] = Field(default=None, description="ID світу")
    template_override: Optional[Dict[str, Any]] = Field(
        default=None,
        description="Опціональний оверрайд шаблону персонажа"
    )


class CharacterFinalizeRequest(BaseModel):
    """Запит на фінальну генерацію заготовки персонажа на основі діалогу (v2.0.0)."""
    model_config = ConfigDict(extra="allow")

    dialog_summary: Optional[str] = Field(default=None, description="Підсумок діалогу створення")
    history: Optional[List[Dict[str, str]]] = Field(
        default_factory=list,
        description="Повна історія діалогу створення, якщо summary немає"
    )
    char_id: Optional[str] = Field(default=None, description="Бажаний унікальний ID заготовки героя")
    draft_state: Optional[Union[Dict[str, Any], PlayerState]] = Field(
        default=None,
        description="Актуальний драфт з ручними правками прев'ю"
    )
    world_id: Optional[str] = Field(default=None, description="ID світу, в якому фіналізується персонаж")
    template_override: Optional[Dict[str, Any]] = Field(
        default=None,
        description="Опціональний оверрайд шаблону персонажа"
    )


class TemplatePreset(BaseModel):
    """Вбудований жанровий пресет анкети персонажа (v2.0.0)."""
    model_config = ConfigDict(extra="allow")

    id: str = Field(..., description="Унікальний ID пресету")
    title: str = Field(..., description="Назва пресету")
    genre: str = Field(..., description="Жанр")
    description: str = Field(default="", description="Короткий опис")
    icon: str = Field(default="scroll-text", description="Ключ векторної іконки lucide-react")
    template: Dict[str, Any] = Field(default_factory=dict, description="JSON-шаблон анкети зі схемою _schema_meta")


# =========================================================================
# 7. Voice-to-Text (Голосове розпізнавання, v1.5.0)
# =========================================================================

class VoiceTranscriptionResponse(BaseModel):
    """Відповідь на розпізнавання голосу (v1.5.0)."""
    model_config = ConfigDict(extra="allow")

    text: str = Field(..., description="Розпізнаний текст дії гравця")


# =========================================================================
# 8. Світи та База знань (Worlds System, v2.0.0)
# =========================================================================

class WorldAiPrompts(BaseModel):
    """Сеттингові ШІ-інструкції конкретного світу (Шар 2 промпту)."""
    model_config = ConfigDict(extra="allow")

    narrator_rules: str = Field(default="", description="Правила атмосфери та фізики світу для Оповідача")
    analyzer_rules: str = Field(default="", description="Правила мутації стану та ресурсів для Аналізатора")
    creator_rules: str = Field(default="", description="Правила створення героя (раси, класи, артефакти) для Творця Долі")
    world_tone: str = Field(default="", description="Короткий опис тону та жанру світу")


class WorldSummary(BaseModel):
    """Коротка картка світу для списку та селекторів (v2.0.0)."""
    model_config = ConfigDict(extra="allow")

    world_id: str = Field(..., description="Унікальний ASCII-ідентифікатор світу")
    title: str = Field(..., description="Назва світу")
    genre: str = Field(default="Фентезі", description="Жанр світу")
    description: str = Field(default="", description="Опис світу")
    icon: str = Field(default="globe", description="Ключ векторної іконки lucide-react")
    accent_color: str = Field(default="#7E0018", description="HEX-колір акценту світу")
    character_count: int = Field(default=0, description="Кількість персонажів у цьому світі")
    is_default: bool = Field(default=False, description="Чи є світ базовим (захищеним)")
    created_at: str = Field(..., description="ISO 8601 дата створення")
    updated_at: str = Field(..., description="ISO 8601 дата останнього оновлення")


class WorldLoreArticleInfo(BaseModel):
    """Метадані окремої статті лору світу."""
    model_config = ConfigDict(extra="allow")

    filename: str = Field(..., description="Ім'я файлу статті (.md або .txt)")
    title: str = Field(..., description="Заголовок статті")
    size_bytes: int = Field(default=0, description="Розмір файлу в байтах")
    est_tokens: int = Field(default=0, description="Орієнтовна кількість токенів")


class WorldDetailResponse(WorldSummary):
    """Детальна інформація про світ (паспорт, промпти, шаблон та статті лору)."""
    author: str = Field(default="System", description="Автор світу")
    starting_locations: List[str] = Field(default_factory=list, description="Стартові локації світу")
    ai_prompts: WorldAiPrompts = Field(default_factory=WorldAiPrompts)
    character_template: Dict[str, Any] = Field(default_factory=dict, description="Еталонний шаблон персонажа світу")
    lore_articles: List[WorldLoreArticleInfo] = Field(default_factory=list, description="Список статей лору")
    total_lore_bytes: int = Field(default=0, description="Загальний розмір лору в байтах")
    total_lore_tokens: int = Field(default=0, description="Загальна оцінка токенів лору")


class WorldCreateRequest(BaseModel):
    """Запит на ручне створення нового світу."""
    model_config = ConfigDict(extra="allow")

    world_id: Optional[str] = Field(default=None, description="Бажаний ID світу (буде приведено до ASCII-slug)")
    title: str = Field(..., description="Назва світу")
    genre: str = Field(default="Фентезі", description="Жанр")
    description: str = Field(default="", description="Опис світу")
    author: str = Field(default="User", description="Автор")
    icon: str = Field(default="globe", description="Ключ векторної іконки lucide-react")
    accent_color: str = Field(default="#38BDF8", description="HEX-колір акценту")
    starting_locations: List[str] = Field(default_factory=list, description="Стартові локації")
    ai_prompts: WorldAiPrompts = Field(default_factory=WorldAiPrompts)
    character_template: Optional[Dict[str, Any]] = Field(default=None, description="Опціональний шаблон персонажа")


class WorldUpdateRequest(BaseModel):
    """Запит на оновлення паспорта, промптів або шаблону світу."""
    model_config = ConfigDict(extra="allow")

    title: Optional[str] = None
    genre: Optional[str] = None
    description: Optional[str] = None
    author: Optional[str] = None
    icon: Optional[str] = None
    accent_color: Optional[str] = None
    starting_locations: Optional[List[str]] = None
    ai_prompts: Optional[WorldAiPrompts] = None
    character_template: Optional[Dict[str, Any]] = None


class WorldCloneRequest(BaseModel):
    """Запит на клонування існуючого світу."""
    model_config = ConfigDict(extra="allow")

    new_title: str = Field(..., description="Назва нового клонованого світу")
    new_world_id: Optional[str] = Field(default=None, description="Опціональний бажаний ID нового світу")
    include_lore: bool = Field(default=True, description="Чи копіювати статті лору")


class WorldDeleteConflict(BaseModel):
    """Тіло відповіді HTTP 409 при спробі видалити світ із залежними сутностями."""
    model_config = ConfigDict(extra="allow")

    detail: str
    world_id: str
    dependent_characters: int
    dependent_campaigns: int


class LoreArticleResponse(BaseModel):
    """Повний вміст статті лору світу."""
    model_config = ConfigDict(extra="allow")

    world_id: str
    filename: str
    title: str
    content: str
    size_bytes: int
    est_tokens: int


class LoreArticleSaveRequest(BaseModel):
    """Запит на створення або оновлення статті лору."""
    model_config = ConfigDict(extra="allow")

    content: str = Field(..., description="Текст статті лору (Markdown або Plain Text)")


# =========================================================================
# 9. 4-Кроковий AI-Майстер Світів (/api/v1/worlds/wizard/*, v2.0.0)
# =========================================================================

class WorldPassportDraft(BaseModel):
    """Чернетка паспорта світу для 4-крокового AI-Майстра (v2.0.0)."""
    model_config = ConfigDict(extra="allow")

    title: str = Field(default="Новий Світ", description="Назва світу")
    genre: str = Field(default="Фентезі", description="Жанр")
    description: str = Field(default="", description="Стислий опис світу")
    icon: str = Field(default="globe", description="Ключ векторної іконки lucide-react")
    accent_color: str = Field(default="#38BDF8", description="HEX-колір акценту")
    starting_locations: List[str] = Field(default_factory=list, description="Стартові локації")


class WorldWizardStepRequest(BaseModel):
    """Запит на Крок 1 (діалог або one-shot генерація паспорта світу)."""
    model_config = ConfigDict(extra="allow")

    mode: str = Field(default="dialog", description="'dialog' або 'one_shot'")
    message: str = Field(..., description="Повідомлення або опис світу від гравця")
    history: Optional[List[Dict[str, str]]] = Field(
        default_factory=list,
        description="Історія діалогу [{'role': 'user'|'assistant', 'content': '...'}]"
    )
    current_passport: Optional[WorldPassportDraft] = Field(
        default=None,
        description="Поточна чернетка паспорта для поступового доповнення"
    )


class WorldPassportDraftResponse(BaseModel):
    """Відповідь Кроку 1 AI-Майстра Світів."""
    model_config = ConfigDict(extra="allow")

    reply: str = Field(..., description="Репліка або резюме AI-Майстра")
    passport_draft: WorldPassportDraft = Field(..., description="Оновлена чернетка паспорта")


class WorldPromptsGenRequest(BaseModel):
    """Запит на Крок 2 (генерація/оновлення 4 сеттингових правил ai_prompts)."""
    model_config = ConfigDict(extra="allow")

    passport: WorldPassportDraft
    tone_chips: Optional[List[str]] = Field(default_factory=list, description="Обрані теги тону (напр. 'Похмурий', 'Іронія')")
    custom_instruction: Optional[str] = Field(default=None, description="Додаткове побажання користувача")
    current_prompts: Optional[WorldAiPrompts] = Field(default=None, description="Поточні промпти для уточнення")


class WorldLoreDraftItem(BaseModel):
    """Чернетка згенерованої або редагованої статті лору."""
    model_config = ConfigDict(extra="allow")

    filename: str = Field(..., description="Ім'я файлу статті (.md)")
    title: str = Field(..., description="Заголовок статті")
    content: str = Field(..., description="Markdown-вміст статті")


class WorldLoreTopicItem(BaseModel):
    """Елемент планування 5 стартових тем лору."""
    model_config = ConfigDict(extra="allow")

    filename: str = Field(..., description="ASCII ім'я файлу (напр. 01_svitobudova.md)")
    title: str = Field(..., description="Назва теми")
    brief: str = Field(default="", description="Короткий опис змісту статті")


class WorldLoreGenRequest(BaseModel):
    """Запит на Крок 3 (планування тем або генерація/розширення статті лору)."""
    model_config = ConfigDict(extra="allow")

    mode: str = Field(default="plan_topics", description="'plan_topics' | 'generate_article' | 'expand_article'")
    passport: WorldPassportDraft
    ai_prompts: Optional[WorldAiPrompts] = None
    topic: Optional[str] = Field(default=None, description="Тема для generate_article")
    filename: Optional[str] = Field(default=None, description="Ім'я файлу статті")
    existing_content: Optional[str] = Field(default=None, description="Існуючий текст для expand_article")
    instruction: Optional[str] = Field(default=None, description="Інструкція генерації чи розширення")
    existing_titles: Optional[List[str]] = Field(default_factory=list, description="Уже створені заголовки для уникнення дублів")


class WorldLoreGenResponse(BaseModel):
    """Відповідь Кроку 3 (план тем або згенерована стаття лору)."""
    model_config = ConfigDict(extra="allow")

    topics: Optional[List[WorldLoreTopicItem]] = None
    article: Optional[WorldLoreDraftItem] = None


class WorldTemplateGenRequest(BaseModel):
    """Запит на Крок 4 (генерація чи доопрацювання character_template.json)."""
    model_config = ConfigDict(extra="allow")

    passport: WorldPassportDraft
    ai_prompts: Optional[WorldAiPrompts] = None
    lore_digest: Optional[str] = Field(default=None, description="Стислий дайджест статей лору")
    custom_instruction: Optional[str] = Field(default=None, description="Побажання до секцій або механік анкети")
    current_template: Optional[Dict[str, Any]] = Field(default=None, description="Поточний шаблон для редагування")


class CharacterTemplateDraftResponse(BaseModel):
    """Відповідь Кроку 4: провалідований шаблон + реалістичний demo_state для прев'ю."""
    model_config = ConfigDict(extra="allow")

    character_template: Dict[str, Any]
    demo_state: Dict[str, Any]
    summary_note: Optional[str] = None


class WorldFinalizeRequest(BaseModel):
    """Запит на атомарне збереження нового світу з 4-Крокового Майстра."""
    model_config = ConfigDict(extra="allow")

    world_id: Optional[str] = Field(default=None, description="Бажаний ASCII world_id")
    passport: WorldPassportDraft
    ai_prompts: WorldAiPrompts
    character_template: Dict[str, Any]
    lore_articles: List[WorldLoreDraftItem] = Field(default_factory=list)


# Для сумісності зі старими викликами
class SessionInfo(BaseModel):
    """Інформація про збережену ігрову сесію (аліас до CampaignSummary)."""
    model_config = ConfigDict(extra="allow")

    session_id: str
    character_name: str
    location: str
    path: str
