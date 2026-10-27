import os
import sys
import json
from typing import List, Dict, Optional, Any

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
from schemas.game_dto import PlayerState


class CharacterWizardService:
    """
    Сервіс створення героя з AI (Character Wizard):
    - ведення інтерактивного діалогу з атмосферним Творцем Долі;
    - компіляція узгодженого концепту в строгий PlayerState (Structured Outputs).
    """
    def __init__(self, provider_service: LLMProviderService, prompt_service: PromptService):
        self.provider_service = provider_service
        self.prompt_service = prompt_service

    async def dialog_with_creator(self, message: str, history: List[Dict[str, str]]) -> str:
        """Крок інтерактивного діалогу з Творцем Долі."""
        system_creator = self.prompt_service.get_prompt("character_creator_system.txt")
        world_lore = self.prompt_service.cached_lore

        full_system = (
            f"{system_creator}\n\n"
            f"КОНТЕКСТ СВІТУ (ЛОР ДЛЯ НАДХНЕННЯ):\n{world_lore[:15000]}...\n\n"
            f"Залишайся в ролі Творця Долі. Відповідай влучно й атмосферно."
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
            max_tokens=600
        )
        return raw_reply.strip()

    async def finalize_character_concept(
        self,
        dialog_summary: Optional[str] = None,
        history: Optional[List[Dict[str, str]]] = None
    ) -> PlayerState:
        """Перетворює узгоджений діалог створення на валідний об'єкт PlayerState."""
        finalizer_prompt = self.prompt_service.get_prompt("character_finalizer_system.txt")

        if dialog_summary:
            context = f"ПІДСУМОК КОНЦЕПТУ ГЕРОЯ:\n{dialog_summary}"
        else:
            lines = []
            for m in (history or []):
                r = "Гравець" if m.get("role") in ("user", "player") else "Творець Долі"
                lines.append(f"{r}: {m.get('content') or m.get('text', '')}")
            context = "ДІАЛОГ СТВОРЕННЯ ГЕРОЯ:\n" + "\n".join(lines)

        messages = [
            {"role": "system", "content": finalizer_prompt},
            {"role": "user", "content": context}
        ]

        raw_json = await self.provider_service.execute_with_fallback(
            provider_type="state",
            messages=messages,
            temperature=0.0,
            max_tokens=1000,
            response_format={"type": "json_object"}
        )

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
            cleaned = cleaned[start:end+1]

        try:
            return PlayerState.model_validate_json(cleaned)
        except Exception as e:
            print(f"⚠️ Помилка строгої валідації finalizer JSON ({e}), виправлення через json.loads: {cleaned}")
            parsed = json.loads(cleaned)
            return PlayerState.model_validate(parsed)
