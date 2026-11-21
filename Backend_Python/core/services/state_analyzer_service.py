import json
import sys
from typing import List, Any, Optional, Tuple
from core.services.llm_provider_service import LLMProviderService
from core.services.prompt_service import PromptService
from core.services.key_translator import KeyTranslatorService
from core.state_parser import StateDelta

# Безпечне кодування консолі для Windows
if sys.stdout and hasattr(sys.stdout, "reconfigure"):
    try:
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass


class StateAnalyzerService:
    """
    2-й крок пайплайну: Витягування дельти стану (травми, зміни інвентарю, переміщення).
    Працює СТРОГО ПОСЛІДОВНО після завершення генерації Оповідачем.
    Використовує response_format={"type": "json_object"} та валідацію через StateDelta.
    """
    def __init__(
        self,
        provider_service: LLMProviderService,
        prompt_service: PromptService,
        key_translator: Optional[KeyTranslatorService] = None,
    ):
        self.provider_service = provider_service
        self.prompt_service = prompt_service
        self.key_translator = key_translator or KeyTranslatorService(
            provider_service=provider_service,
            prompt_service=prompt_service,
        )

    async def analyze_state_changes(
        self,
        intents: List[Any],
        story_text: str,
        player_state_str: str,
        world_id: str = "default_dark_fantasy"
    ) -> Tuple[str, bool]:
        """
        Аналізує дії та розповідь, повертаючи кортеж: (json_рядок, успіх_валідації).
        """
        full_system_prompt = self.prompt_service.build_state_system_prompt(
            player_state_str,
            world_id=world_id
        )

        # Фільтрація інтенсів: тільки physical action та speech (thought та ooc відкидаються)
        actions = []
        speech = []

        for intent in intents:
            if isinstance(intent, dict):
                i_type = intent.get("type", "")
                i_content = intent.get("content", "")
            else:
                i_type = getattr(intent, "type", "")
                i_content = getattr(intent, "content", "")

            if i_type == "action":
                actions.append(i_content)
            elif i_type == "speech":
                speech.append(i_content)

        actions_str = " | ".join(actions) if actions else "ГРАВЕЦЬ НЕ РОБИВ ЖОДНИХ ФІЗИЧНИХ ДІЙ"
        speech_str = " | ".join(speech) if speech else "ГРАВЕЦЬ МОВЧИТЬ"

        strict_user_context = (
            f"УВАГА: Аналізуй інвентар та здоров'я ТІЛЬКИ на основі фізичних дій гравця та відповіді Оповідача.\n"
            f"ФІЗИЧНІ ДІЇ ГРАВЦЯ: {actions_str}\n"
            f"ПРЯМА МОВА ГРАВЦЯ: {speech_str}\n"
            f"(Думки та позаігрові коментарі вилучені з контексту, щоб ти не зробив помилок).\n\n"
            f"РЕЗУЛЬТАТ ВІД ОПОВІДАЧА: {story_text}"
        )

        messages = [
            {"role": "system", "content": full_system_prompt},
            {"role": "user", "content": strict_user_context}
        ]

        raw_response = await self.provider_service.execute_with_fallback(
            provider_type="state",
            messages=messages,
            temperature=0.0,
            max_tokens=1000,
            response_format={"type": "json_object"}
        )

        print("\n" + "="*40)
        print("🧠 [StateAnalyzerService] СИРА ВІДПОВІДЬ (JSON Mode):")
        print(raw_response)
        print("="*40 + "\n")

        # Очищення від markdown ```json блоків
        cleaned = raw_response.strip()
        if cleaned.startswith("```json"):
            cleaned = cleaned[7:]
        if cleaned.startswith("```"):
            cleaned = cleaned[3:]
        if cleaned.endswith("```"):
            cleaned = cleaned[:-3]
        cleaned = cleaned.strip()

        start = cleaned.find('{')
        end = cleaned.rfind('}')

        if start != -1 and end != -1:
            json_str = cleaned[start:end+1]
            try:
                # Перевіряємо валідацію через Pydantic StateDelta
                delta = StateDelta.model_validate_json(json_str)
                keys_to_translate: List[str] = []
                for spec in delta.new_sections:
                    if spec.title and not self.key_translator.has_cyrillic(spec.title):
                        keys_to_translate.append(spec.title)
                for dot_path in delta.field_updates.keys():
                    leaf = dot_path.split(".")[-1].strip()
                    if leaf and not self.key_translator.has_cyrillic(leaf):
                        keys_to_translate.append(leaf)
                for sc in delta.section_changes:
                    if isinstance(sc.item_fields, dict):
                        for k in sc.item_fields.keys():
                            if k and not self.key_translator.has_cyrillic(str(k)):
                                keys_to_translate.append(str(k))
                if keys_to_translate:
                    await self.key_translator.translate_keys(keys_to_translate)
                return json_str, True
            except Exception as e_val:
                print(f"⚠️ [StateAnalyzerService] Попередження: JSON валідний синтаксично, але схема StateDelta частково не зійшлася: {e_val}")
                return json_str, False

        err_payload = '{"error": "ШІ не повернув валідний JSON. Сира відповідь: ' + raw_response.replace('"', "'") + '"}'
        return err_payload, False
