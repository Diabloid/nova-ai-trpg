from typing import Any, Dict, List, Optional
from pydantic import Field

from schemas.base import FlexibleDTO
from schemas.world import WorldAiPrompts


class WorldPassportDraft(FlexibleDTO):
    """Чернетка паспорта світу для 4-крокового AI-Майстра."""

    title: str = Field(default="Новий Світ", description="Назва світу")
    genre: str = Field(default="Фентезі", description="Жанр")
    description: str = Field(default="", description="Стислий опис світу")
    icon: str = Field(default="globe", description="Ключ векторної іконки lucide-react")
    accent_color: str = Field(default="#38BDF8", description="HEX-колір акценту")
    starting_locations: List[str] = Field(default_factory=list, description="Стартові локації")


class WorldWizardStepRequest(FlexibleDTO):
    """Запит на Крок 1 (діалог або one-shot генерація паспорта світу)."""

    mode: str = Field(default="dialog", description="'dialog' або 'one_shot'")
    message: str = Field(..., description="Повідомлення або опис світу від гравця")
    history: Optional[List[Dict[str, str]]] = Field(
        default_factory=list,
        description="Історія діалогу [{'role': 'user'|'assistant', 'content': '...'}]",
    )
    current_passport: Optional[WorldPassportDraft] = Field(
        default=None,
        description="Поточна чернетка паспорта для поступового доповнення",
    )


class WorldPassportDraftResponse(FlexibleDTO):
    """Відповідь Кроку 1 AI-Майстра Світів."""

    reply: str = Field(..., description="Репліка або резюме AI-Майстра")
    passport_draft: WorldPassportDraft = Field(..., description="Оновлена чернетка паспорта")


class WorldPromptsGenRequest(FlexibleDTO):
    """Запит на генерацію/оновлення 4 сеттингових правил ai_prompts."""

    passport: WorldPassportDraft
    tone_chips: Optional[List[str]] = Field(default_factory=list, description="Обрані теги тону (напр. 'Похмурий', 'Іронія')")
    custom_instruction: Optional[str] = Field(default=None, description="Додаткове побажання користувача")
    current_prompts: Optional[WorldAiPrompts] = Field(default=None, description="Поточні промпти для уточнення")
    lore_digest: Optional[str] = Field(default=None, description="Стислий дайджест статей лору світу")
    character_template: Optional[Dict[str, Any]] = Field(
        default=None,
        description="Створений шаблон анкети (для точної прив'язки analyzer_rules і creator_rules до полів)",
    )


class WorldLoreDraftItem(FlexibleDTO):
    """Чернетка згенерованої або редагованої статті лору."""

    filename: str = Field(..., description="Ім'я файлу статті (.md)")
    title: str = Field(..., description="Заголовок статті")
    content: str = Field(..., description="Markdown-вміст статті")


class WorldLoreTopicItem(FlexibleDTO):
    """Елемент планування 5 стартових тем лору."""

    filename: str = Field(..., description="ASCII ім'я файлу (напр. 01_svitobudova.md)")
    title: str = Field(..., description="Назва теми")
    brief: str = Field(default="", description="Короткий опис змісту статті")


class WorldLoreGenRequest(FlexibleDTO):
    """Запит на Крок 3 (планування тем або генерація/розширення статті лору)."""

    mode: str = Field(default="plan_topics", description="'plan_topics' | 'generate_article' | 'expand_article'")
    passport: WorldPassportDraft
    ai_prompts: Optional[WorldAiPrompts] = None
    topic: Optional[str] = Field(default=None, description="Тема для generate_article")
    filename: Optional[str] = Field(default=None, description="Ім'я файлу статті")
    existing_content: Optional[str] = Field(default=None, description="Існуючий текст для expand_article")
    instruction: Optional[str] = Field(default=None, description="Інструкція генерації чи розширення")
    existing_titles: Optional[List[str]] = Field(default_factory=list, description="Уже створені заголовки для уникнення дублів")


class WorldLoreGenResponse(FlexibleDTO):
    """Відповідь Кроку 3 (план тем або згенерована стаття лору)."""

    topics: Optional[List[WorldLoreTopicItem]] = None
    article: Optional[WorldLoreDraftItem] = None


class WorldTemplateGenRequest(FlexibleDTO):
    """Запит на Крок 4 (генерація чи доопрацювання character_template.json)."""

    passport: WorldPassportDraft
    ai_prompts: Optional[WorldAiPrompts] = None
    lore_digest: Optional[str] = Field(default=None, description="Стислий дайджест статей лору")
    custom_instruction: Optional[str] = Field(default=None, description="Побажання до секцій або механік анкети")
    current_template: Optional[Dict[str, Any]] = Field(default=None, description="Поточний шаблон для редагування")


class CharacterTemplateDraftResponse(FlexibleDTO):
    """Відповідь Кроку 4: провалідований шаблон + реалістичний demo_state для прев'ю."""

    character_template: Dict[str, Any]
    demo_state: Dict[str, Any]
    summary_note: Optional[str] = None


class WorldFinalizeRequest(FlexibleDTO):
    """Запит на атомарне збереження нового світу з 4-Крокового Майстра."""

    world_id: Optional[str] = Field(default=None, description="Бажаний ASCII world_id")
    passport: WorldPassportDraft
    ai_prompts: WorldAiPrompts
    character_template: Dict[str, Any]
    lore_articles: List[WorldLoreDraftItem] = Field(default_factory=list)
