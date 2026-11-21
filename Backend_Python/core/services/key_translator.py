import json
import os
import re
import sys
from typing import Any, Dict, Iterable, List, Optional, Set

from core.utils.llm_json import call_llm_json

# Безпечне кодування консолі для Windows
if sys.stdout and hasattr(sys.stdout, "reconfigure"):
    try:
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass

BASE_DIR = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
DEFAULT_KEY_TRANSLATIONS_PATH = os.path.join(BASE_DIR, "data", "config", "key_translations.json")

CYRILLIC_CHAR_RE = re.compile(r"[а-яА-ЯіІїЇєЄґҐ]")

# Базові ключі структури карток/метаданих, які не потребують запису у field_labels
STANDARD_STRUCTURAL_KEYS = {
    "id", "uid", "uuid", "_id",
    "name", "title", "desc", "description", "location", "type", "effect",
    "world_id", "created_at", "updated_at", "_schema_meta", "meta",
}

# Вбудований словник типових TRPG-ключів для миттєвого перекладу без звернення до LLM
BUILTIN_TRPG_KEY_TRANSLATIONS: Dict[str, str] = {
    "hp": "HP",
    "health": "Здоров'я",
    "max_hp": "Макс. HP",
    "mp": "Мана",
    "mana": "Мана",
    "stamina": "Витривалість",
    "energy": "Енергія",
    "sanity": "Розсудок",
    "armor": "Броня",
    "defense": "Захист",
    "attack": "Атака",
    "damage": "Шкода",
    "damage_type": "Тип шкоди",
    "strength": "Сила",
    "agility": "Спритність",
    "dexterity": "Спритність",
    "intelligence": "Інтелект",
    "wisdom": "Мудрість",
    "charisma": "Харизма",
    "luck": "Удача",
    "perception": "Уважність",
    "willpower": "Сила волі",
    "gold": "Золото",
    "credits": "Кредити",
    "eurodollars": "Євродолари",
    "ammo": "Боєприпаси",
    "radiation": "Радіація",
    "thirst": "Спрага",
    "hunger": "Голод",
    "fatigue": "Втома",
    "style_rank": "Ранг стилю",
    "demonic_corruption": "Демонічне сквернення",
    "corruption": "Скверна",
    "humanity": "Людяність",
    "cyber_heat": "Кібер-нагрів",
    "heat": "Нагрів",
    "ram": "ОЗП",
    "quantity": "Кількість",
    "weight": "Вага",
    "cost": "Вартість",
    "price": "Ціна",
    "value": "Значення",
    "rarity": "Рідкість",
    "level": "Рівень",
    "rank": "Ранг",
    "duration": "Тривалість",
    "range": "Дальність",
    "cooldown": "Перезарядка",
    "slot": "Слот",
    "relation": "Ставлення",
    "reputation": "Репутація",
    "status": "Статус",
    "loyalty": "Вірність",
    "fuel": "Паливо",
    "hull": "Корпус",
    "shields": "Щити",
}


class KeyTranslatorService:
    """
    Гібридний перекладач не-кириличних TRPG-ключів анкет і секцій:
    1. Кириличні ключі повертає як є без жодних викликів LLM.
    2. Шукає переклад у вбудованому словнику та персистентному кеші data/config/key_translations.json.
    3. Для незнайомих англійських ключів виконує разовий легкий запит до швидкої state-моделі
       та зберігає результат на диск раз і назавжди.
    """

    def __init__(
        self,
        provider_service: Optional[Any] = None,
        cache_path: Optional[str] = None,
        prompt_service: Optional[Any] = None,
    ):
        self.provider_service = provider_service
        self.cache_path = cache_path or DEFAULT_KEY_TRANSLATIONS_PATH
        self.prompt_service = prompt_service
        self._cache_mtime: float = 0.0
        self._cache: Dict[str, str] = self._load_cache()

    def _get_system_prompt(self) -> str:
        if self.prompt_service is None:
            from core.services.prompt_service import PromptService
            self.prompt_service = PromptService(prompts_dir=os.path.join(BASE_DIR, "data", "prompts"))
        return self.prompt_service.render_prompt("key_translator_system.txt")

    @staticmethod
    def has_cyrillic(text: Optional[str]) -> bool:
        return bool(text and CYRILLIC_CHAR_RE.search(text))

    @staticmethod
    def _normalize_key(key: str) -> str:
        norm = re.sub(r"([a-z0-9])([A-Z])", r"\1_\2", key.strip())
        norm = re.sub(r"[\s\-]+", "_", norm).lower()
        return re.sub(r"_+", "_", norm).strip("_")

    @staticmethod
    def _prettify_fallback(key: str) -> str:
        cleaned = key.replace("_", " ").replace("-", " ").strip()
        return cleaned[:1].upper() + cleaned[1:] if cleaned else key

    def _load_cache(self) -> Dict[str, str]:
        if not os.path.isfile(self.cache_path):
            return {}
        try:
            self._cache_mtime = os.path.getmtime(self.cache_path)
            with open(self.cache_path, "r", encoding="utf-8") as f:
                data = json.load(f)
            if isinstance(data, dict):
                return {str(k): str(v) for k, v in data.items() if k and v}
        except Exception as e:
            print(f"⚠️ [KeyTranslator] Помилка зчитування кешу {self.cache_path}: {e}")
        return {}

    def _reload_if_changed(self) -> None:
        if os.path.isfile(self.cache_path):
            try:
                mtime = os.path.getmtime(self.cache_path)
                if mtime > self._cache_mtime:
                    self._cache = self._load_cache()
            except Exception:
                pass

    def _save_cache(self) -> None:
        try:
            os.makedirs(os.path.dirname(self.cache_path), exist_ok=True)
            with open(self.cache_path, "w", encoding="utf-8") as f:
                json.dump(self._cache, f, ensure_ascii=False, indent=2, sort_keys=True)
            self._cache_mtime = os.path.getmtime(self.cache_path)
        except Exception as e:
            print(f"⚠️ [KeyTranslator] Помилка збереження кешу {self.cache_path}: {e}")

    def lookup_local(self, raw_key: str) -> Optional[str]:
        """Шукає переклад локально: кирилиця -> кеш -> вбудований TRPG-словник."""
        if not raw_key or not isinstance(raw_key, str):
            return raw_key
        stripped = raw_key.strip()
        if not stripped:
            return raw_key
        if self.has_cyrillic(stripped):
            return stripped

        self._reload_if_changed()
        norm = self._normalize_key(stripped)
        if stripped in self._cache:
            return self._cache[stripped]
        if norm in self._cache:
            return self._cache[norm]
        if norm in BUILTIN_TRPG_KEY_TRANSLATIONS:
            return BUILTIN_TRPG_KEY_TRANSLATIONS[norm]
        return None

    def translate_key_sync(self, raw_key: str) -> str:
        """Синхронний переклад із локального словника/кешу з красивим fallback."""
        hit = self.lookup_local(raw_key)
        if hit is not None:
            return hit
        return self._prettify_fallback(raw_key)

    async def translate_keys(self, keys: Iterable[str]) -> Dict[str, str]:
        """
        Перекладає список ключів:
        - кириличні ключі повертаються як є без LLM-виклику;
        - ключі з кешу або словника повертаються миттєво;
        - невідомі не-кириличні ключі перекладаються одним батч-запитом state-моделі та кешуються на диск.
        """
        labels: Dict[str, str] = {}
        unknown_keys: List[str] = []
        seen_unknown: Set[str] = set()

        for raw in keys:
            if not isinstance(raw, str) or not raw.strip():
                continue
            key = raw.strip()
            local_hit = self.lookup_local(key)
            if local_hit is not None:
                labels[key] = local_hit
            else:
                norm = self._normalize_key(key)
                if norm and norm not in seen_unknown:
                    unknown_keys.append(key)
                    seen_unknown.add(norm)
                elif key not in unknown_keys:
                    unknown_keys.append(key)

        if unknown_keys and self.provider_service is not None:
            llm_translations = await self._translate_batch_via_llm(unknown_keys)
            cache_dirty = False
            for key in unknown_keys:
                norm = self._normalize_key(key)
                translated = (
                    llm_translations.get(key)
                    or llm_translations.get(norm)
                    or llm_translations.get(key.lower())
                )
                if isinstance(translated, str) and translated.strip():
                    clean_label = translated.strip()
                    self._cache[key] = clean_label
                    if norm:
                        self._cache[norm] = clean_label
                    cache_dirty = True
            if cache_dirty:
                self._save_cache()

        for raw in keys:
            if isinstance(raw, str) and raw.strip():
                k = raw.strip()
                if k not in labels:
                    labels[k] = self.translate_key_sync(k)

        return labels

    async def _translate_batch_via_llm(self, unknown_keys: List[str]) -> Dict[str, str]:
        system_prompt = self._get_system_prompt()
        user_prompt = json.dumps({"keys": unknown_keys}, ensure_ascii=False)
        try:
            parsed = await call_llm_json(
                self.provider_service,
                [
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_prompt},
                ],
                provider_type="state",
                temperature=0.0,
                max_tokens=500,
            )
            return {str(k): str(v) for k, v in parsed.items() if v}
        except Exception as e:
            print(f"⚠️ [KeyTranslator] Не вдалося перекласти ключі {unknown_keys} через LLM: {e}")
        return {}

    def extract_non_cyrillic_keys_from_template(self, data: Dict[str, Any]) -> List[str]:
        """Збирає не-кириличні ключі зі stat_grid, header_badge та додаткових полів карток."""
        if not isinstance(data, dict):
            return []

        schema_meta = data.get("_schema_meta")
        sections = schema_meta.get("sections") if isinstance(schema_meta, dict) else {}
        if not isinstance(sections, dict):
            sections = {}

        collected: List[str] = []
        seen: Set[str] = set()

        def _add_if_needed(k: str) -> None:
            ks = str(k).strip()
            if (
                ks
                and ks not in seen
                and ks.lower() not in STANDARD_STRUCTURAL_KEYS
                and not self.has_cyrillic(ks)
            ):
                collected.append(ks)
                seen.add(ks)

        for sec_path, sec_info in sections.items():
            if not isinstance(sec_info, dict):
                continue
            arch = sec_info.get("archetype")
            sec_val: Any = data
            for part in sec_path.split("."):
                sec_val = sec_val.get(part) if isinstance(sec_val, dict) else None

            if arch == "stat_grid" and isinstance(sec_val, dict):
                for k in sec_val.keys():
                    _add_if_needed(k)
            elif arch == "card_list" and isinstance(sec_val, list):
                for item in sec_val:
                    if isinstance(item, dict):
                        for k in item.keys():
                            _add_if_needed(k)
            elif arch == "container_map" and isinstance(sec_val, dict):
                for c_items in sec_val.values():
                    if isinstance(c_items, list):
                        for item in c_items:
                            if isinstance(item, dict):
                                for k in item.keys():
                                    _add_if_needed(k)

        return collected

    def populate_field_labels_sync(self, data: Dict[str, Any]) -> Dict[str, str]:
        """Синхронно заповнює _schema_meta.field_labels для не-кириличних ключів (із кешу/словника)."""
        keys = self.extract_non_cyrillic_keys_from_template(data)
        if not keys:
            return {}
        schema_meta = data.get("_schema_meta")
        if not isinstance(schema_meta, dict):
            return {}
        field_labels = schema_meta.get("field_labels")
        if not isinstance(field_labels, dict):
            field_labels = {}
            schema_meta["field_labels"] = field_labels

        for k in keys:
            if k not in field_labels or not str(field_labels[k]).strip():
                hit = self.lookup_local(k)
                field_labels[k] = hit if hit is not None else self._prettify_fallback(k)
        return field_labels

    async def populate_field_labels_async(self, *docs: Optional[Dict[str, Any]]) -> None:
        """Асинхронно перекладає та кешує всі нові не-кириличні ключі в переданих анкетах."""
        all_keys: List[str] = []
        for doc in docs:
            if isinstance(doc, dict):
                all_keys.extend(self.extract_non_cyrillic_keys_from_template(doc))
        if not all_keys:
            return

        labels = await self.translate_keys(all_keys)
        for doc in docs:
            if not isinstance(doc, dict):
                continue
            schema_meta = doc.get("_schema_meta")
            if not isinstance(schema_meta, dict):
                continue
            doc_keys = self.extract_non_cyrillic_keys_from_template(doc)
            if not doc_keys:
                continue
            field_labels = schema_meta.setdefault("field_labels", {})
            for k in doc_keys:
                if k in labels and (k not in field_labels or not str(field_labels[k]).strip()):
                    field_labels[k] = labels[k]
