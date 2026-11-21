from typing import Any, Dict, List, Optional
from pydantic import Field

from schemas.base import FlexibleDTO


class WorldAiPrompts(FlexibleDTO):
    """Сеттингові ШІ-інструкції конкретного світу (Шар 2 промпту)."""

    narrator_rules: str = Field(default="", description="Правила атмосфери та фізики світу для Оповідача")
    analyzer_rules: str = Field(default="", description="Правила мутації стану та ресурсів для Аналізатора")
    creator_rules: str = Field(default="", description="Правила створення героя (раси, класи, артефакти) для Творця Долі")
    world_tone: str = Field(default="", description="Короткий опис тону та жанру світу")


class WorldSummary(FlexibleDTO):
    """Коротка картка світу для списку та селекторів."""

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


class WorldLoreArticleInfo(FlexibleDTO):
    """Метадані окремої статті лору світу."""

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


class WorldCreateRequest(FlexibleDTO):
    """Запит на ручне створення нового світу."""

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


class WorldUpdateRequest(FlexibleDTO):
    """Запит на оновлення паспорта, промптів або шаблону світу."""

    title: Optional[str] = None
    genre: Optional[str] = None
    description: Optional[str] = None
    author: Optional[str] = None
    icon: Optional[str] = None
    accent_color: Optional[str] = None
    starting_locations: Optional[List[str]] = None
    ai_prompts: Optional[WorldAiPrompts] = None
    character_template: Optional[Dict[str, Any]] = None


class WorldCloneRequest(FlexibleDTO):
    """Запит на клонування існуючого світу."""

    new_title: str = Field(..., description="Назва нового клонованого світу")
    new_world_id: Optional[str] = Field(default=None, description="Опціональний бажаний ID нового світу")
    include_lore: bool = Field(default=True, description="Чи копіювати статті лору")


class WorldDeleteConflict(FlexibleDTO):
    """Тіло відповіді HTTP 409 при спробі видалити світ із залежними сутностями."""

    detail: str
    world_id: str
    dependent_characters: int
    dependent_campaigns: int


class LoreArticleResponse(FlexibleDTO):
    """Повний вміст статті лору світу."""

    world_id: str
    filename: str
    title: str
    content: str
    size_bytes: int
    est_tokens: int


class LoreArticleSaveRequest(FlexibleDTO):
    """Запит на створення або оновлення статті лору."""

    content: str = Field(..., description="Текст статті лору (Markdown або Plain Text)")
