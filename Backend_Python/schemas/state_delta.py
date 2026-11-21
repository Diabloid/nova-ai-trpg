from pydantic import BaseModel, Field
from typing import List, Dict, Optional, Any, Literal


class ItemChange(BaseModel):
    action: str = Field(description="'add', 'remove' або 'update'")
    container: str = Field(description="Наприклад: 'Кишені', 'Рюкзак', 'worn'")
    item_name: str = Field(description="Назва предмета")
    item_desc: Optional[str] = Field(default="", description="Опис предмета (якщо action='add' або 'update')")


class InjuryChange(BaseModel):
    action: str = Field(description="'add', 'heal' або 'worsen'")
    location: str = Field(description="Частина тіла, наприклад: 'Ліва рука', 'Голова'")
    type_and_desc: str = Field(description="Наприклад: 'Глибокий поріз, кровоточить'")


class DynamicListChange(BaseModel):
    """Універсальна мутація довільної спискової секції чи контейнера."""
    section_path: str = Field(
        ...,
        description="Шлях до секції (напр.: 'abilities', 'cyberware', 'inventory_containers.Рюкзак', 'skills')"
    )
    action: str = Field(..., description="'add', 'update' або 'remove'")
    name: str = Field(..., description="Назва/ключ елемента або рядок для tag_list")
    desc: Optional[str] = Field(default="", description="Опис елемента")
    item_fields: Optional[Dict[str, Any]] = Field(
        default=None,
        description="Додаткові кастомні поля елемента card_list (напр. effect, rarity, type)"
    )


class NewSectionSpec(BaseModel):
    """Специфікація нової динамічної секції, що виникає під час гри."""
    path: str = Field(..., description="ASCII-slug шляху (напр. 'pets', 'companions', 'base_camp')")
    title: str = Field(..., description="Українська назва секції (напр. 'Пітомці та фамільяри')")
    icon: str = Field(default="sparkles", description="Ключ іконки lucide-react")
    color: str = Field(default="#38BDF8", description="HEX-колір (#RRGGBB)")
    archetype: Literal["card_list", "stat_grid", "tag_list", "container_map", "long_text"] = Field(
        default="card_list",
        description="Архетип рендеру нової секції"
    )
    placement: Literal["drawer_column", "details"] = Field(
        default="details",
        description="Розташування нової секції у UI"
    )


class StateDelta(BaseModel):
    new_overall_state: Optional[str] = Field(default=None, description="Нове загальне самопочуття, якщо воно змінилося")
    location_changed: Optional[str] = Field(default=None, description="Нова локація, якщо гравець перемістився")
    appearance_changed: Optional[str] = Field(default=None, description="Новий опис зовнішності, якщо вона змінилася")
    inventory_changes: List[ItemChange] = Field(default_factory=list)
    injury_changes: List[InjuryChange] = Field(default_factory=list)
    new_sections: List[NewSectionSpec] = Field(
        default_factory=list,
        description="Кероване створення нових постійних секцій під час гри"
    )
    field_updates: Dict[str, Any] = Field(
        default_factory=dict,
        description="Точкові скалярні оновлення за dot-шляхом"
    )
    section_changes: List[DynamicListChange] = Field(
        default_factory=list,
        description="Універсальні мутації списків, карток, тегів та контейнерів"
    )
