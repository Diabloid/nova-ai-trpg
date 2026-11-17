import copy
import json
import os
import sys
from typing import Any, Dict, List, Optional, Tuple, Union

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

    def _deep_merge_preserve_explicit(
        self,
        ai_result: Dict[str, Any],
        explicit_draft: Dict[str, Any],
    ) -> Dict[str, Any]:
        """
        Глибоко зливає явні непорожні правки гравця з draft_state поверх результату ШІ,
        щоб жодна ручна правка в Live Preview не була втрачена.
        """
        merged = copy.deepcopy(ai_result)
        for key, exp_val in explicit_draft.items():
            if key in ("_schema_meta", "created_at", "updated_at"):
                continue

            if key not in merged or merged[key] is None or merged[key] == "":
                if exp_val is not None and exp_val != "":
                    merged[key] = copy.deepcopy(exp_val)
                continue

            ai_val = merged[key]
            if isinstance(ai_val, dict) and isinstance(exp_val, dict):
                merged[key] = self._deep_merge_preserve_explicit(ai_val, exp_val)
            elif isinstance(ai_val, list) and isinstance(exp_val, list):
                if len(exp_val) > 0 and len(ai_val) == 0:
                    merged[key] = copy.deepcopy(exp_val)
            elif key in ("name", "first_name", "last_name", "titles", "age", "biography", "avatar", "world_id"):
                if exp_val not in (None, "") and (
                    ai_val in (None, "", "Невідомий мандрівник", "Мандрівник")
                    or key in ("avatar", "world_id", "titles", "age")
                ):
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

        # Прибираємо випадкові None у верхньому рівні
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
        world_id: Optional[str] = None,
        template_override: Optional[Dict[str, Any]] = None,
    ) -> Tuple[str, Optional[Dict[str, Any]]]:
        """
        Крок інтерактивного діалогу з Творцем Долі (v2.0.0).
        Якщо include_draft == False: генерує лише швидку репліку Творця Долі.
        Якщо include_draft == True: додатково формує актуальну чернетку draft_state за шаблоном світу.
        """
        target_world = world_id or DEFAULT_WORLD_ID
        full_system = self.prompt_service.build_creator_system_prompt(world_id=target_world)

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

        draft_state: Optional[Dict[str, Any]] = None
        if include_draft:
            try:
                updated_history = list(history) + [
                    {"role": "user", "content": message},
                    {"role": "assistant", "content": reply},
                ]
                draft_state = await self.finalize_character_concept(
                    history=updated_history,
                    world_id=target_world,
                    template_override=template_override,
                )
            except Exception as e:
                print(f"⚠️ [CharacterWizardService] Не вдалося згенерувати draft_state для Live Preview: {e}")
                draft_state = None

        return reply, draft_state

    async def finalize_character_concept(
        self,
        dialog_summary: Optional[str] = None,
        history: Optional[List[Dict[str, str]]] = None,
        draft_state: Optional[Union[Dict[str, Any], PlayerState]] = None,
        world_id: Optional[str] = None,
        template_override: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
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

        if draft_dict:
            clean_draft_json = self.prompt_service.sanitize_player_state_for_llm(draft_dict)
            context += (
                "\n\nАКТУАЛЬНИЙ ДРАФТ З РУЧНИМИ ПРАВКАМИ ПРЕВ'Ю:\n"
                f"{clean_draft_json}\n\n"
                "Збережи ВСІ явні правки гравця з актуального драфту та заповни лише порожні поля."
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
        if draft_dict:
            parsed = self._deep_merge_preserve_explicit(parsed, draft_dict)

        return self._align_to_template(
            parsed,
            skeleton=skeleton,
            schema_meta=schema_meta,
            target_world=target_world,
            explicit_draft=draft_dict,
        )

    async def sync_character_draft(
        self,
        current_state: Union[Dict[str, Any], PlayerState],
        world_id: Optional[str] = None,
        template_override: Optional[Dict[str, Any]] = None,
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
            "Твоє завдання — узгодити взаємопов'язані секції СТРОГО В МЕЖАХ КЛЮЧІВ ЦІЛЬОВОГО ШАБЛОНУ:\n"
            "1. НЕ ВИДАЛЯЙ і не перезаписуй дані, які гравець ввів явно.\n"
            "2. ЗАБОРОНЕНО додавати сторонні секції, яких немає в шаблоні (напр. не додавай `anatomy_and_health` чи `abilities` у Кіберпанк/Детектив).\n"
            "3. Поверни ВИКЛЮЧНО валідний JSON-об'єкт анкети."
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
            merged = self._deep_merge_preserve_explicit(parsed, state_dict)
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
