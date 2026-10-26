from pydantic import BaseModel, Field
from typing import List, Dict, Optional

class ItemChange(BaseModel):
    action: str = Field(description="'add', 'remove' или 'update'")
    container: str = Field(description="Например: 'Кишені', 'Рюкзак', 'worn'")
    item_name: str = Field(description="Название предмета")
    item_desc: Optional[str] = Field(default="", description="Художественное описание предмета (если action='add' или 'update')")

class InjuryChange(BaseModel):
    action: str = Field(description="'add', 'heal' или 'worsen'")
    location: str = Field(description="Часть тела, например: 'Ліва рука', 'Голова'")
    type_and_desc: str = Field(description="Например: 'Глубокий порез, кровоточит'")

class StateDelta(BaseModel):
    new_overall_state: Optional[str] = Field(default=None, description="Новое общее самочувствие, если оно изменилось")
    location_changed: Optional[str] = Field(default=None, description="Новая локация, если игрок переместился")
    appearance_changed: Optional[str] = Field(default=None, description="Новое описание внешности, если она изменилась (например, подстригся, обгорел)")
    inventory_changes: List[ItemChange] = Field(default_factory=list)
    injury_changes: List[InjuryChange] = Field(default_factory=list)