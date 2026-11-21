import json
from typing import Any, Dict, List, Optional


def strip_markdown_fences(raw_text: Optional[str]) -> str:
    """Знімає зовнішню обгортку markdown code fence (```json / ```markdown / ```)."""
    cleaned = (raw_text or "").strip()
    if not cleaned.startswith("```"):
        return cleaned

    first_newline = cleaned.find("\n")
    if first_newline != -1:
        header = cleaned[3:first_newline].strip().lower()
        if not header or header.isalpha() or header in ("json", "markdown", "md", "text"):
            cleaned = cleaned[first_newline + 1 :]
    else:
        for prefix in ("```markdown", "```json", "```md", "```"):
            if cleaned.lower().startswith(prefix):
                cleaned = cleaned[len(prefix) :]
                break

    if cleaned.endswith("```"):
        cleaned = cleaned[:-3]
    return cleaned.strip()


def _validate_parsed_dict(parsed: Any) -> Dict[str, Any]:
    if not isinstance(parsed, dict):
        raise ValueError(f"Очікувався JSON-об'єкт (dict), отримано {type(parsed).__name__}.")
    if "error" in parsed:
        raise RuntimeError(f"ШІ-провайдер повернув помилку: {parsed['error']}")
    return parsed


def extract_json_dict(raw_text: Optional[str]) -> Dict[str, Any]:
    """
    Витягує та валідує JSON-об'єкт (dict) із відповіді LLM.
    Коректно обробляє чистий JSON, markdown code fences і супровідний текст до/після JSON.
    """
    cleaned = strip_markdown_fences(raw_text)
    if not cleaned:
        raise ValueError("ШІ повернув порожню відповідь замість JSON-об'єкта.")

    try:
        direct_parsed = json.loads(cleaned)
        return _validate_parsed_dict(direct_parsed)
    except json.JSONDecodeError:
        pass

    start_obj = cleaned.find("{")
    end_obj = cleaned.rfind("}")
    start_arr = cleaned.find("[")

    if start_arr != -1 and (start_obj == -1 or start_arr < start_obj):
        try:
            arr_candidate, _ = json.JSONDecoder().raw_decode(cleaned, start_arr)
            if isinstance(arr_candidate, list):
                raise ValueError("Очікувався JSON-об'єкт (dict), отримано list.")
        except json.JSONDecodeError:
            pass

    if start_obj == -1 or end_obj == -1 or end_obj < start_obj:
        raise ValueError(f"ШІ не повернув JSON-об'єкт: {cleaned[:200]}")

    candidate = cleaned[start_obj : end_obj + 1]
    try:
        parsed = json.loads(candidate)
    except json.JSONDecodeError as first_err:
        try:
            parsed, _ = json.JSONDecoder().raw_decode(cleaned, start_obj)
        except json.JSONDecodeError:
            raise ValueError(f"Невалідний JSON від ШІ: {first_err}") from first_err

    return _validate_parsed_dict(parsed)


async def call_llm_json(
    provider_service: Any,
    messages: List[Dict[str, str]],
    *,
    provider_type: str = "state",
    temperature: float = 0.2,
    max_tokens: int = 1600,
    response_format: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    """
    Виконує запит до LLM через provider_service.execute_with_fallback
    та повертає провалідований JSON-словник.
    """
    if provider_service is None:
        raise RuntimeError("LLMProviderService не ініціалізовано.")

    effective_format = {"type": "json_object"} if response_format is None else response_format
    raw_json = await provider_service.execute_with_fallback(
        provider_type=provider_type,
        messages=messages,
        temperature=temperature,
        max_tokens=max_tokens,
        response_format=effective_format,
    )
    return extract_json_dict(raw_json)
