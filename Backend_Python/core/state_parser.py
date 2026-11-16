from pydantic import BaseModel, Field
from typing import List, Dict, Optional, Any


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
    """Універсальна мутація довільної спискової секції чи контейнера (v2.0.0)."""
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


class StateDelta(BaseModel):
    new_overall_state: Optional[str] = Field(default=None, description="Нове загальне самопочуття, якщо воно змінилося")
    location_changed: Optional[str] = Field(default=None, description="Нова локація, якщо гравець перемістився")
    appearance_changed: Optional[str] = Field(default=None, description="Новий опис зовнішності, якщо вона змінилася")
    inventory_changes: List[ItemChange] = Field(default_factory=list)
    injury_changes: List[InjuryChange] = Field(default_factory=list)
    field_updates: Dict[str, Any] = Field(
        default_factory=dict,
        description="Точкові скалярні оновлення за dot-шляхом (v2.0.0)"
    )
    section_changes: List[DynamicListChange] = Field(
        default_factory=list,
        description="Універсальні мутації списків, карток, тегів та контейнерів (v2.0.0)"
    )
