import copy
import re
from typing import Any, Dict, Iterable, List, Optional, Set, Tuple, Union

from schemas.game_dto import PlayerState

FANTASY_ONLY_KEYS = {"anatomy_and_health", "storage_and_equipment", "abilities", "custom_blocks"}

# Системні плейсхолдери з порожнього шаблону, які не вважаються ручною правкою без explicit lock
DEFAULT_PLACEHOLDER_STRINGS = {
    "невідомий мандрівник",
    "мандрівник",
    "невідомий ліс",
    "стартова локація",
    "повний сил",
    "невідомо",
    "не вказано",
}

_CHANGE_COMMAND_RE = re.compile(
    r"\b(змін\w*|поміня\w*|переймену\w*|виправ\w*|онов\w*|замін\w*|перепиш\w*|назв\w*|хай\s+зват\w*|нехай\s+зват\w*|нове\s+ім['’]?я|нова\s+локаці\w*)\b",
    re.IGNORECASE,
)

_FIELD_COMMAND_MARKERS: Dict[str, Tuple[str, ...]] = {
    "meta.name": ("ім'я", "ім’я", "імені", "іменем", "звати", "переймену", "назв"),
    "meta.location": ("локац", "місцезнаходж", "місто", "місц"),
    "meta.appearance": ("зовнішн", "вигляд"),
    "meta.biography": ("біограф", "передісторі", "історі"),
    "meta.background": ("передісторі", "походження"),
    "meta.age": ("вік", "років"),
    "meta.titles": ("титул", "прізвиськ"),
}


def to_clean_dict(state: Optional[Union[Dict[str, Any], PlayerState]]) -> Optional[Dict[str, Any]]:
    """Нормалізує PlayerState або dict у незалежну копію словника."""
    if state is None:
        return None
    if isinstance(state, PlayerState):
        return state.model_dump(exclude_none=True)
    if isinstance(state, dict):
        return copy.deepcopy(state)
    return None


def is_meaningful_manual_value(value: Any) -> bool:
    """Перевіряє, чи містить поле реальну правку користувача, а не дефолтний плейсхолдер."""
    if value is None:
        return False
    if isinstance(value, str):
        stripped = value.strip()
        return bool(stripped) and stripped.lower() not in DEFAULT_PLACEHOLDER_STRINGS
    if isinstance(value, (list, dict)):
        return len(value) > 0
    return True


def detect_explicit_override_paths(last_user_message: Optional[str]) -> Set[str]:
    """Визначає поля, які користувач прямо попросив змінити в останній репліці."""
    if not last_user_message or not isinstance(last_user_message, str):
        return set()
    text = last_user_message.strip().lower()
    if not text or not _CHANGE_COMMAND_RE.search(text):
        return set()
    overrides: Set[str] = set()
    for path, markers in _FIELD_COMMAND_MARKERS.items():
        if any(marker in text for marker in markers):
            overrides.add(path.lower())
    return overrides


def merge_lists_preserve_explicit(ai_list: List[Any], exp_list: List[Any]) -> List[Any]:
    """Зберігає ручні елементи списку та додає лише нові унікальні елементи від LLM."""
    if not exp_list:
        return copy.deepcopy(ai_list)
    if not ai_list:
        return copy.deepcopy(exp_list)

    result = copy.deepcopy(exp_list)
    if all(isinstance(x, dict) for x in exp_list):
        existing_names = {
            str(x.get("name") or x.get("title") or "").strip().lower()
            for x in exp_list
            if isinstance(x, dict) and (x.get("name") or x.get("title"))
        }
        for item in ai_list:
            if isinstance(item, dict):
                item_name = str(item.get("name") or item.get("title") or "").strip().lower()
                if item_name and item_name not in existing_names:
                    result.append(copy.deepcopy(item))
                    existing_names.add(item_name)
        return result

    if all(isinstance(x, str) for x in exp_list):
        existing_tags = {x.strip().lower() for x in exp_list}
        for item in ai_list:
            if isinstance(item, str) and item.strip() and item.strip().lower() not in existing_tags:
                result.append(item)
                existing_tags.add(item.strip().lower())
        return result

    return result


def collect_explicit_path_map(
    explicit_draft: Optional[Dict[str, Any]],
    _prefix: str = "",
) -> Dict[str, str]:
    """Збирає {lower_dot_path: dot_path} для всіх заповнених полів і секцій чернетки."""
    if not isinstance(explicit_draft, dict):
        return {}
    path_map: Dict[str, str] = {}
    for key, val in explicit_draft.items():
        if key in ("_schema_meta", "_unlocked_fields", "created_at", "updated_at"):
            continue
        dot_path = f"{_prefix}.{key}" if _prefix else str(key)
        if isinstance(val, dict):
            if val:
                path_map[dot_path.lower()] = dot_path
                path_map.update(collect_explicit_path_map(val, _prefix=dot_path))
        elif val not in (None, "") and val != []:
            path_map[dot_path.lower()] = dot_path
    return path_map


def resolve_unlocked_fields(
    raw_ai_unlocks: Any,
    explicit_draft: Optional[Dict[str, Any]],
    locked_fields: Optional[Iterable[str]],
    last_user_message: Optional[str],
) -> List[str]:
    """
    Валідує AI-розблоковані шляхи ("_unlocked_fields") і об'єднує з fallback-регуляркою.
    Приймається ЛИШЕ за наявності непорожнього last_user_message і обмежується
    шляхами з locked_fields або явних заповнених полів explicit_draft.
    """
    if not (last_user_message and isinstance(last_user_message, str) and last_user_message.strip()):
        return []

    allowed_map = collect_explicit_path_map(explicit_draft)
    for locked in (locked_fields or []):
        cleaned = str(locked).strip()
        if cleaned:
            allowed_map[cleaned.lower()] = cleaned

    if not allowed_map:
        return []

    candidates: List[str] = []
    if isinstance(raw_ai_unlocks, list):
        for item in raw_ai_unlocks:
            s = str(item).strip()
            if s:
                candidates.append(s.lower())

    for regex_path in sorted(detect_explicit_override_paths(last_user_message)):
        candidates.append(regex_path.lower())

    resolved: List[str] = []
    seen: Set[str] = set()
    for cand_lower in candidates:
        if cand_lower in allowed_map and cand_lower not in seen:
            resolved.append(allowed_map[cand_lower])
            seen.add(cand_lower)
    return resolved


def deep_merge_preserve_explicit(
    ai_result: Dict[str, Any],
    explicit_draft: Dict[str, Any],
    locked_fields: Optional[Iterable[str]] = None,
    last_user_message: Optional[str] = None,
    ai_unlocked_fields: Optional[Iterable[str]] = None,
    _prefix: str = "",
    _locked_set: Optional[Set[str]] = None,
    _override_set: Optional[Set[str]] = None,
) -> Dict[str, Any]:
    """
    Глибоко зливає явні непорожні правки гравця з draft_state поверх результату ШІ:
    - будь-яке поле зі списку locked_fields (якщо воно непорожнє в explicit_draft)
      та ручно заповнені скалярні/ключові поля ніколи не перетираються результатом LLM,
      окрім прямої команди користувача в останньому повідомленні на зміну цього поля.
    """
    if _locked_set is None:
        _locked_set = {str(p).strip().lower() for p in (locked_fields or []) if str(p).strip()}
    if _override_set is None:
        if last_user_message and isinstance(last_user_message, str) and last_user_message.strip():
            _override_set = detect_explicit_override_paths(last_user_message)
            for p in (ai_unlocked_fields or []):
                cleaned = str(p).strip().lower()
                if cleaned:
                    _override_set.add(cleaned)
        else:
            _override_set = set()

    merged = copy.deepcopy(ai_result)
    for key, exp_val in explicit_draft.items():
        if key in ("_schema_meta", "_unlocked_fields", "created_at", "updated_at"):
            continue

        current_path = f"{_prefix}.{key}".lower() if _prefix else str(key).lower()
        is_locked = current_path in _locked_set
        is_overridden = current_path in _override_set

        if key not in merged or merged[key] is None or merged[key] == "":
            if not is_overridden and exp_val is not None and exp_val != "":
                merged[key] = copy.deepcopy(exp_val)
            continue

        ai_val = merged[key]
        if isinstance(ai_val, dict) and isinstance(exp_val, dict):
            if is_overridden and not ai_val:
                continue
            child_locked = set(_locked_set)
            if is_locked and not is_overridden:
                for sub_k, sub_v in exp_val.items():
                    if sub_v not in (None, ""):
                        child_locked.add(f"{current_path}.{sub_k}".lower())
            merged[key] = deep_merge_preserve_explicit(
                ai_val,
                exp_val,
                _prefix=current_path,
                _locked_set=child_locked,
                _override_set=_override_set,
            )
        elif isinstance(ai_val, list) and isinstance(exp_val, list):
            if len(exp_val) > 0 and not is_overridden:
                if is_locked:
                    merged[key] = copy.deepcopy(exp_val)
                elif len(ai_val) == 0:
                    merged[key] = copy.deepcopy(exp_val)
                else:
                    merged[key] = merge_lists_preserve_explicit(ai_val, exp_val)
        else:
            if is_overridden:
                continue
            if is_locked and exp_val not in (None, ""):
                merged[key] = copy.deepcopy(exp_val)
            elif is_meaningful_manual_value(exp_val):
                merged[key] = copy.deepcopy(exp_val)
    return merged


def align_to_template(
    result: Dict[str, Any],
    skeleton: Dict[str, Any],
    schema_meta: Optional[Dict[str, Any]],
    target_world: str,
    explicit_draft: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    """Вирівнює JSON-об'єкт суворо під цільовий шаблон без сторонніх фентезі-секцій."""
    for f_key in list(result.keys()):
        if f_key in FANTASY_ONLY_KEYS and f_key not in skeleton:
            if not (explicit_draft and f_key in explicit_draft):
                result.pop(f_key, None)

    for k, skel_val in skeleton.items():
        if k not in result or result[k] is None:
            result[k] = copy.deepcopy(skel_val)
        elif isinstance(skel_val, dict) and isinstance(result[k], dict):
            for sub_k, sub_v in skel_val.items():
                if sub_k not in result[k]:
                    result[k][sub_k] = copy.deepcopy(sub_v)

    meta = result.setdefault("meta", {})
    if isinstance(meta, dict):
        meta["world_id"] = target_world
        if explicit_draft and isinstance(explicit_draft.get("meta"), dict):
            exp_avatar = explicit_draft["meta"].get("avatar")
            if exp_avatar and not meta.get("avatar"):
                meta["avatar"] = exp_avatar

    if isinstance(schema_meta, dict) and schema_meta:
        result["_schema_meta"] = copy.deepcopy(schema_meta)

    result.pop("_unlocked_fields", None)
    for k in list(result.keys()):
        if result[k] is None:
            result.pop(k, None)

    return result
