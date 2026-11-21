import json
import os
from functools import lru_cache
from typing import List, Tuple

from schemas.game_dto import TemplatePreset

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PRESETS_JSON_PATH = os.path.join(BASE_DIR, "data", "presets", "template_presets.json")


@lru_cache(maxsize=1)
def _load_template_presets() -> Tuple[TemplatePreset, ...]:
    with open(PRESETS_JSON_PATH, "r", encoding="utf-8") as f:
        raw_items = json.load(f)
    if not isinstance(raw_items, list):
        raise ValueError(f"Файл пресетів {PRESETS_JSON_PATH} має містити JSON-масив.")
    return tuple(TemplatePreset.model_validate(item) for item in raw_items)


def get_template_presets() -> List[TemplatePreset]:
    """Повертає копії вбудованих жанрових пресетів анкети персонажа (виключно Lucide-іконки)."""
    return [preset.model_copy(deep=True) for preset in _load_template_presets()]
