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

from core.managers.world_manager import DEFAULT_WORLD_ID, WorldManager
from core.services.llm_provider_service import LLMProviderService
from core.services.prompt_service import PromptService
from core.storage.template_presets import get_template_presets
from core.utils.llm_json import call_llm_json
from core.utils.wizard_merge_utils import (
    align_to_template,
    deep_merge_preserve_explicit,
    resolve_unlocked_fields,
    to_clean_dict,
)
from schemas.game_dto import PlayerState


class CharacterWizardService:
    """
    Динамічний сервіс створення героя з AI (Character Wizard):
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
        Крок інтерактивного діалогу з Творцем Долі.
        Якщо include_draft == False: генерує лише швидку репліку Творця Долі.
        Якщо include_draft == True: формує актуальну чернетку draft_state за шаблоном світу,
        зберігаючи ручні правки гравця та locked_fields і повертаючи unlocked_fields при явній команді.
        """
        target_world = world_id or DEFAULT_WORLD_ID
        draft_dict = to_clean_dict(draft_state)
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
        draft_dict = to_clean_dict(draft_state)
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

        parsed = await call_llm_json(
            self.provider_service,
            messages,
            provider_type="state",
            temperature=0.0,
            max_tokens=1800,
        )
        # Обов'язково вирізаємо службовий ключ "_unlocked_fields" до мерджу та вирівнювання шаблону
        raw_ai_unlocks = parsed.pop("_unlocked_fields", None)
        unlocked_list = resolve_unlocked_fields(
            raw_ai_unlocks=raw_ai_unlocks,
            explicit_draft=draft_dict,
            locked_fields=locked_fields,
            last_user_message=last_user_message,
        )

        if draft_dict:
            parsed = deep_merge_preserve_explicit(
                parsed,
                draft_dict,
                locked_fields=locked_fields,
                last_user_message=last_user_message,
                ai_unlocked_fields=unlocked_list,
            )

        aligned = align_to_template(
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
        state_dict = to_clean_dict(current_state) or {}
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
            "Ти — системний модуль балансування та синхронізації концепту персонажа для текстової RPG.\n"
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
            parsed = await call_llm_json(
                self.provider_service,
                messages,
                provider_type="state",
                temperature=0.2,
                max_tokens=1800,
            )
            merged = deep_merge_preserve_explicit(
                parsed,
                state_dict,
                locked_fields=locked_fields,
            )
            return align_to_template(
                merged,
                skeleton=skeleton,
                schema_meta=schema_meta,
                target_world=target_world,
                explicit_draft=state_dict,
            )
        except Exception as e:
            print(f"⚠️ [CharacterWizardService] Помилка синхронізації драфту ({e}). Повертаємо вихідний стан гравця.")

        return state_dict
