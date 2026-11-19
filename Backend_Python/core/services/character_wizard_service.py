import copy
import json
import os
import re
import sys
from typing import Any, Dict, Iterable, List, Optional, Set, Tuple, Union

# Безпечне кодування консолі для Windows
if sys.stdout and hasattr(sys.stdout, "reconfigure"):
    try:
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass
if sys.stderr and hasattr(sys.stderr, "reconfigure"):
    try:
        sys.stderr.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass

from core.services.llm_provider_service import LLMProviderService
from core.services.prompt_service import PromptService
from core.template_presets import get_template_presets
from core.world_manager import DEFAULT_WORLD_ID, WorldManager
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


class CharacterWizardService:
    """
    Динамічний сервіс створення героя з AI (Character Wizard, v2.0.0):
    - ведення інтерактивного діалогу з Творцем Долі у контексті світу (з дайджестом лору);
    - компіляція та синхронізація анкети строго за character_template.json світу (або template_override).
    """

    def __init__(
        self,
        provider_service: LLMProviderService,
        prompt_service: PromptService,
        world_manager: Optional[WorldManager] = None,
    ):
        self.provider_service = provider_service
        self.prompt_service = prompt_service
        self.world_manager = world_manager or prompt_service.world_manager

    # ------------------------------------------------------------------
    # Хелпери роботи з динамічною схемою шаблону
    # ------------------------------------------------------------------

    def _resolve_target_template(
        self,
        world_id: str,
        template_override: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        if isinstance(template_override, dict) and template_override:
            return copy.deepcopy(template_override)
        if self.world_manager and self.world_manager.world_exists(world_id):
            tpl = self.world_manager.get_world_template(world_id)
            if tpl:
                return copy.deepcopy(tpl)
        if self.world_manager and self.world_manager.world_exists(DEFAULT_WORLD_ID):
            tpl = self.world_manager.get_world_template(DEFAULT_WORLD_ID)
            if tpl:
                return copy.deepcopy(tpl)
        return copy.deepcopy(get_template_presets()[0].template)

    def _describe_template_sections(self, template_dict: Dict[str, Any]) -> str:
        schema_meta = template_dict.get("_schema_meta")
        if not isinstance(schema_meta, dict) or not isinstance(schema_meta.get("sections"), dict):
            return ""
        lines = []
        for path, info in schema_meta["sections"].items():
            if not isinstance(info, dict):
                continue
            title = info.get("title", path)
            arch = info.get("archetype", "card_list")
            lines.append(f"- `{path}` ({title}): тип `{arch}`")
        return "\n".join(lines)

    def _extract_json_dict(self, raw_json: str) -> Dict[str, Any]:
        cleaned = raw_json.strip()
        if cleaned.startswith("```json"):
            cleaned = cleaned[7:]
        if cleaned.startswith("```"):
            cleaned = cleaned[3:]
        if cleaned.endswith("```"):
            cleaned = cleaned[:-3]
        cleaned = cleaned.strip()

        start = cleaned.find("{")
        end = cleaned.rfind("}")
        if start != -1 and end != -1:
            cleaned = cleaned[start : end + 1]
        else:
            raise ValueError(f"ШІ повернув відповідь без JSON-структури: {cleaned}")

        parsed = json.loads(cleaned)
        if isinstance(parsed, dict) and "error" in parsed:
            raise RuntimeError(f"ШІ-провайдер повернув помилку: {parsed['error']}")
        if not isinstance(parsed, dict):
            raise ValueError("ШІ повернув JSON, який не є словником-об'єктом.")
        return parsed

    def _to_clean_dict(self, state: Optional[Union[Dict[str, Any], PlayerState]]) -> Optional[Dict[str, Any]]:
        if state is None:
            return None
        if isinstance(state, PlayerState):
            return state.model_dump(exclude_none=True)
        if isinstance(state, dict):
            return copy.deepcopy(state)
        return None

    @staticmethod
    def _is_meaningful_manual_value(value: Any) -> bool:
        if value is None:
            return False
        if isinstance(value, str):
            stripped = value.strip()
            return bool(stripped) and stripped.lower() not in DEFAULT_PLACEHOLDER_STRINGS
        if isinstance(value, (list, dict)):
            return len(value) > 0
        return True

    @staticmethod
    def _detect_explicit_override_paths(last_user_message: Optional[str]) -> Set[str]:
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

    @staticmethod
    def _merge_lists_preserve_explicit(ai_list: List[Any], exp_list: List[Any]) -> List[Any]:
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

    @classmethod
    def _collect_explicit_path_map(
        cls,
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
                    path_map.update(cls._collect_explicit_path_map(val, _prefix=dot_path))
            elif val not in (None, "") and val != []:
                path_map[dot_path.lower()] = dot_path
        return path_map

    def _resolve_unlocked_fields(
        self,
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

        allowed_map = self._collect_explicit_path_map(explicit_draft)
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

        for regex_path in sorted(self._detect_explicit_override_paths(last_user_message)):
            candidates.append(regex_path.lower())

        resolved: List[str] = []
        seen: Set[str] = set()
        for cand_lower in candidates:
            if cand_lower in allowed_map and cand_lower not in seen:
                resolved.append(allowed_map[cand_lower])
                seen.add(cand_lower)
        return resolved

    def _deep_merge_preserve_explicit(
        self,
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
                _override_set = self._detect_explicit_override_paths(last_user_message)
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
                merged[key] = self._deep_merge_preserve_explicit(
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
                        merged[key] = self._merge_lists_preserve_explicit(ai_val, exp_val)
            else:
                if is_overridden:
                    continue
                if is_locked and exp_val not in (None, ""):
                    merged[key] = copy.deepcopy(exp_val)
                elif self._is_meaningful_manual_value(exp_val):
                    merged[key] = copy.deepcopy(exp_val)
        return merged

    def _align_to_template(
        self,
        result: Dict[str, Any],
        skeleton: Dict[str, Any],
        schema_meta: Optional[Dict[str, Any]],
        target_world: str,
        explicit_draft: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        """Вирівнює JSON-об'єкт суворо під цільовий шаблон без сторонніх фентезі-секцій."""
        allowed_top_keys = set(skeleton.keys()) | {"meta"}
        if explicit_draft:
            allowed_top_keys |= (set(explicit_draft.keys()) - FANTASY_ONLY_KEYS)

        # Видаляємо чужорідні фентезі-ключі, якщо їх немає в цільовому шаблоні
        for f_key in list(result.keys()):
            if f_key in FANTASY_ONLY_KEYS and f_key not in skeleton:
                if not (explicit_draft and f_key in explicit_draft):
                    result.pop(f_key, None)

        # Гарантуємо наявність усіх базових ключів і порожніх контейнерів із шаблону
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

        # Прибираємо службові чи випадкові None у верхньому рівні
        result.pop("_unlocked_fields", None)
        for k in list(result.keys()):
            if result[k] is None:
                result.pop(k, None)

        return result

    # ------------------------------------------------------------------
    # Публічні методи Character Wizard
    # ------------------------------------------------------------------

    async def dialog_with_creator(
        self,
        message: str,
        history: List[Dict[str, str]],
        include_draft: bool = False,
        draft_state: Optional[Union[Dict[str, Any], PlayerState]] = None,
        locked_fields: Optional[List[str]] = None,
        world_id: Optional[str] = None,
        template_override: Optional[Dict[str, Any]] = None,
    ) -> Tuple[str, Optional[Dict[str, Any]], Optional[List[str]]]:
        """
        Крок інтерактивного діалогу з Творцем Долі (v2.0.0).
        Якщо include_draft == False: генерує лише швидку репліку Творця Долі.
        Якщо include_draft == True: формує актуальну чернетку draft_state за шаблоном світу,
        зберігаючи ручні правки гравця та locked_fields і повертаючи unlocked_fields при явній команді.
        """
        target_world = world_id or DEFAULT_WORLD_ID
        draft_dict = self._to_clean_dict(draft_state)
        full_system = self.prompt_service.build_creator_system_prompt(world_id=target_world)

        if draft_dict:
            clean_draft_json = self.prompt_service.sanitize_player_state_for_llm(draft_dict)
            lock_note = (
                f"\nЗаблоковані гравцем поля (заборонено змінювати без прямої команди): {', '.join(locked_fields)}"
                if locked_fields
                else ""
            )
            full_system += (
                "\n\n[АКТУАЛЬНА ЧЕРНЕТКА З ПРЕВ'Ю ГРАВЦЯ — ОБОВ'ЯЗКОВО ВРАХОВУЙ]:\n"
                f"{clean_draft_json}{lock_note}\n"
                "Не вигадуй інше ім'я чи деталі всупереч уже вписаним у чернетці без прямої команди гравця."
            )

        messages = [{"role": "system", "content": full_system}]
        for h in history:
            role = "user" if h.get("role") in ("user", "player") else "assistant"
            messages.append({"role": role, "content": h.get("content") or h.get("text", "")})
        messages.append({"role": "user", "content": message})

        raw_reply = await self.provider_service.execute_with_fallback(
            provider_type="story",
            messages=messages,
            temperature=0.7,
            max_tokens=600,
        )
        reply = raw_reply.strip()

        next_draft: Optional[Dict[str, Any]] = None
        unlocked_fields: Optional[List[str]] = None
        if include_draft:
            try:
                updated_history = list(history) + [
                    {"role": "user", "content": message},
                    {"role": "assistant", "content": reply},
                ]
                next_draft, unlocked_list = await self.finalize_character_concept(
                    history=updated_history,
                    draft_state=draft_dict,
                    locked_fields=locked_fields,
                    world_id=target_world,
                    template_override=template_override,
                    last_user_message=message,
                    return_unlocked=True,
                )
                unlocked_fields = unlocked_list or None
            except Exception as e:
                print(f"⚠️ [CharacterWizardService] Не вдалося згенерувати draft_state для Live Preview: {e}")
                next_draft = draft_dict if draft_dict else None
                unlocked_fields = None

        return reply, next_draft, unlocked_fields

    async def finalize_character_concept(
        self,
        dialog_summary: Optional[str] = None,
        history: Optional[List[Dict[str, str]]] = None,
        draft_state: Optional[Union[Dict[str, Any], PlayerState]] = None,
        world_id: Optional[str] = None,
        template_override: Optional[Dict[str, Any]] = None,
        locked_fields: Optional[List[str]] = None,
        last_user_message: Optional[str] = None,
        return_unlocked: bool = False,
    ) -> Union[Dict[str, Any], Tuple[Dict[str, Any], List[str]]]:
        """Перетворює узгоджений діалог створення на динамічний лист персонажа строго за шаблоном світу."""
        draft_dict = self._to_clean_dict(draft_state)
        target_world = world_id or (
            (draft_dict.get("meta") or {}).get("world_id") if draft_dict else None
        ) or DEFAULT_WORLD_ID

        target_template = self._resolve_target_template(target_world, template_override=template_override)
        schema_meta = target_template.get("_schema_meta") if isinstance(target_template.get("_schema_meta"), dict) else None
        skeleton = self.prompt_service.strip_service_fields(target_template)
        sections_guide = self._describe_template_sections(target_template)

        finalizer_prompt = self.prompt_service.get_prompt("character_finalizer_system.txt")

        if dialog_summary:
            context = f"ПІДСУМОК КОНЦЕПТУ ГЕРОЯ (СВІТ: {target_world}):\n{dialog_summary}"
        else:
            lines = []
            for m in (history or []):
                r = "Гравець" if m.get("role") in ("user", "player") else "Творець Долі"
                lines.append(f"{r}: {m.get('content') or m.get('text', '')}")
            context = f"ДІАЛОГ СТВОРЕННЯ ГЕРОЯ (СВІТ: {target_world}):\n" + "\n".join(lines)

        context += (
            "\n\nЦІЛЬОВИЙ ШАБЛОН АНКЕТИ (СТРОГО ПОВТОРИ ЦІ КЛЮЧІ ТА СТРУКТУРУ):\n"
            f"{json.dumps(skeleton, ensure_ascii=False, indent=2)}"
        )
        if sections_guide:
            context += f"\n\nОПИС СЕКЦІЙ ШАБЛОНУ:\n{sections_guide}"

        if draft_dict or locked_fields:
            clean_draft_json = (
                self.prompt_service.sanitize_player_state_for_llm(draft_dict)
                if draft_dict
                else "{}"
            )
            lock_info = (
                f"\nЗаблоковані поля (СТРОГО не змінювати без прямої команди): {', '.join(locked_fields)}"
                if locked_fields
                else ""
            )
            last_msg_info = (
                f"\nОСТАННЄ ПОВІДОМЛЕННЯ ГРАВЦЯ: {last_user_message.strip()}"
                if last_user_message and last_user_message.strip()
                else ""
            )
            context += (
                "\n\nАКТУАЛЬНИЙ ДРАФТ З РУЧНИМИ ПРАВКАМИ ПРЕВ'Ю:\n"
                f"{clean_draft_json}{lock_info}{last_msg_info}\n\n"
                "Збережи ВСІ явні правки гравця з актуального драфту (не перефразовуй і не змінюй їх) та заповни лише порожні поля. "
                "ТІЛЬКИ якщо в останньому повідомленні гравець прямо попросив змінити/перейменувати/замінити чи прибрати конкретне заповнене/заблоковане поле — "
                "запиши нове значення й поверни його dot-шлях у тимчасовому масиві \"_unlocked_fields\". Інакше НЕ додавай \"_unlocked_fields\"."
            )

        messages = [
            {"role": "system", "content": finalizer_prompt},
            {"role": "user", "content": context},
        ]

        raw_json = await self.provider_service.execute_with_fallback(
            provider_type="state",
            messages=messages,
            temperature=0.0,
            max_tokens=1800,
            response_format={"type": "json_object"},
        )

        parsed = self._extract_json_dict(raw_json)
        # Обов'язково вирізаємо службовий ключ "_unlocked_fields" до мерджу та вирівнювання шаблону
        raw_ai_unlocks = parsed.pop("_unlocked_fields", None)
        unlocked_list = self._resolve_unlocked_fields(
            raw_ai_unlocks=raw_ai_unlocks,
            explicit_draft=draft_dict,
            locked_fields=locked_fields,
            last_user_message=last_user_message,
        )

        if draft_dict:
            parsed = self._deep_merge_preserve_explicit(
                parsed,
                draft_dict,
                locked_fields=locked_fields,
                last_user_message=last_user_message,
                ai_unlocked_fields=unlocked_list,
            )

        aligned = self._align_to_template(
            parsed,
            skeleton=skeleton,
            schema_meta=schema_meta,
            target_world=target_world,
            explicit_draft=draft_dict,
        )
        if return_unlocked:
            return aligned, unlocked_list
        return aligned

    async def sync_character_draft(
        self,
        current_state: Union[Dict[str, Any], PlayerState],
        world_id: Optional[str] = None,
        template_override: Optional[Dict[str, Any]] = None,
        locked_fields: Optional[List[str]] = None,
    ) -> Dict[str, Any]:
        """
        Аналізує ручні правки гравця та інтелектуально узгоджує взаємопов'язані секції
        СТРОГО в межах схеми цільового шаблону світу (без додавання чужорідних фентезі-ключів).
        """
        state_dict = self._to_clean_dict(current_state) or {}
        target_world = world_id or (state_dict.get("meta") or {}).get("world_id") or DEFAULT_WORLD_ID

        target_template = self._resolve_target_template(target_world, template_override=template_override)
        schema_meta = (
            state_dict.get("_schema_meta")
            if isinstance(state_dict.get("_schema_meta"), dict)
            else target_template.get("_schema_meta")
        )
        skeleton_source = (
            state_dict
            if (template_override is None and isinstance(state_dict.get("_schema_meta"), dict))
            else target_template
        )
        skeleton = self.prompt_service.strip_service_fields(skeleton_source)
        # Якщо гравець додав кастомні секції в конструкторі, описуємо саме його актуальну _schema_meta
        schema_source = {"_schema_meta": schema_meta} if isinstance(schema_meta, dict) else target_template
        sections_guide = self._describe_template_sections(schema_source)

        system_instruction = (
            "Ти — системний модуль балансування та синхронізації концепту персонажа для текстової RPG (v2.0.0).\n"
            "Гравець вручну відредагував окремі поля картки персонажа.\n"
            "Твоє завдання — доповнити ПОРОЖНІ або логічно залежні поля СТРОГО В МЕЖАХ КЛЮЧІВ ЦІЛЬОВОГО ШАБЛОНУ:\n"
            "1. СУВОРА ЗАБОРОНА ПЕРЕФРАЗУВАННЯ: не переписуй, не скорочуй і не змінюй формулювання вже заповнених гравцем текстових або скалярних полів (ім'я, локація, зовнішність, біографія, наявні предмети/здібності) — залишай їх ДОСЛІВНО без змін.\n"
            "2. ДОПОВНЮЙ ЛИШЕ ПРОГАЛИНИ: заповнюй або гармонізуй тільки порожні поля (\"\", [], null) чи похідні залежні поля без потреби переписувати існуючий текст.\n"
            "3. ЗАБОРОНЕНО додавати сторонні секції, яких немає в шаблоні (напр. не додавай `anatomy_and_health` чи `abilities` у Кіберпанк/Детектив).\n"
            "4. Поверни ВИКЛЮЧНО валідний JSON-об'єкт анкети."
        )

        clean_state_json = self.prompt_service.sanitize_player_state_for_llm(state_dict)
        user_content = (
            f"ЦІЛЬОВИЙ ШАБЛОН АНКЕТИ (СВІТ: {target_world}):\n"
            f"{json.dumps(skeleton, ensure_ascii=False, indent=2)}\n\n"
        )
        if sections_guide:
            user_content += f"ОПИС СЕКЦІЙ ШАБЛОНУ:\n{sections_guide}\n\n"
        user_content += f"ПОТОЧНИЙ СТАН ПЕРСОНАЖА З РУЧНИМИ ПРАВКАМИ:\n{clean_state_json}"

        messages = [
            {"role": "system", "content": system_instruction},
            {"role": "user", "content": user_content},
        ]

        try:
            raw_json = await self.provider_service.execute_with_fallback(
                provider_type="state",
                messages=messages,
                temperature=0.2,
                max_tokens=1800,
                response_format={"type": "json_object"},
            )
            parsed = self._extract_json_dict(raw_json)
            merged = self._deep_merge_preserve_explicit(
                parsed,
                state_dict,
                locked_fields=locked_fields,
            )
            return self._align_to_template(
                merged,
                skeleton=skeleton,
                schema_meta=schema_meta,
                target_world=target_world,
                explicit_draft=state_dict,
            )
        except Exception as e:
            print(f"⚠️ [CharacterWizardService] Помилка синхронізації драфту ({e}). Повертаємо вихідний стан гравця.")

        return state_dict
