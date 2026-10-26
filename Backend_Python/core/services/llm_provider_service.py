import os
import sys
from typing import Optional, Dict, Any, List, AsyncGenerator
from openai import AsyncOpenAI

# Безпечне кодування консолі для Windows
if sys.stdout and hasattr(sys.stdout, "reconfigure"):
    try:
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass


class LLMProviderService:
    """
    Відповідає за виклики ШІ-моделей через OpenAI-сумісний інтерфейс
    з підтримкою каскадного резервування (Fallback Router), response_format та токен-стрімінгу.
    """
    def __init__(self, config: Dict[str, Any]):
        self.config = config

    async def execute_with_fallback(
        self,
        provider_type: str,
        messages: List[Dict[str, str]],
        temperature: float,
        max_tokens: int,
        response_format: Optional[Dict[str, Any]] = None
    ) -> str:
        """
        Каскадний синхронний виклик (non-streaming): Провайдер -> Моделі -> Наступний провайдер.
        """
        providers = self.config.get(provider_type, [])
        if not providers:
            print(f"⚠️ Попередження: Немає налаштованих провайдерів для типу '{provider_type}'")
            return '{"error": "Провайдери не налаштовані"}'

        for provider in providers:
            env_key = provider.get("env_key", "")
            api_key = os.getenv(env_key)
            if not api_key:
                print(f"⚠️ Пропуск {provider.get('name')}: Ключ {env_key} відсутній у .env")
                continue

            client = AsyncOpenAI(base_url=provider.get("url"), api_key=api_key)

            for model in provider.get("models", []):
                create_params: Dict[str, Any] = {
                    "model": model,
                    "messages": messages,
                    "temperature": temperature,
                    "max_tokens": max_tokens,
                }
                if response_format:
                    create_params["response_format"] = response_format

                try:
                    response = await client.chat.completions.create(**create_params)
                    content = response.choices[0].message.content
                    if content and content.strip():
                        return content
                    print(f"⚠️ Порожня відповідь від {provider.get('name')} ({model})")
                except Exception as e:
                    err_msg = str(e)
                    if response_format and ("response_format" in err_msg.lower() or "json_object" in err_msg.lower()):
                        print(f"⚠️ {provider.get('name')} ({model}) не підтримує response_format. Спроба без нього...")
                        try:
                            fallback_params = dict(create_params)
                            del fallback_params["response_format"]
                            response = await client.chat.completions.create(**fallback_params)
                            content = response.choices[0].message.content
                            if content and content.strip():
                                return content
                        except Exception as e_retry:
                            print(f"❌ {provider.get('name')} ({model}) помилка і без response_format: {e_retry}")
                    else:
                        print(f"❌ {provider.get('name')} ({model}) відмовив: {err_msg}. Перехід до наступної моделі...")
                    continue

        return '{"error": "Усі резервні API-провайдери та їхні моделі недоступні."}'

    async def stream_with_fallback(
        self,
        provider_type: str,
        messages: List[Dict[str, str]],
        temperature: float,
        max_tokens: int
    ) -> AsyncGenerator[str, None]:
        """
        Каскадний стрімінг токенів Оповідача (Server-Sent Events / SSE).
        """
        providers = self.config.get(provider_type, [])
        success = False

        for provider in providers:
            env_key = provider.get("env_key", "")
            api_key = os.getenv(env_key)
            if not api_key:
                continue

            client = AsyncOpenAI(base_url=provider.get("url"), api_key=api_key)

            for model in provider.get("models", []):
                try:
                    stream = await client.chat.completions.create(
                        model=model,
                        messages=messages,
                        temperature=temperature,
                        max_tokens=max_tokens,
                        stream=True
                    )
                    async for chunk in stream:
                        if chunk.choices and len(chunk.choices) > 0:
                            delta = chunk.choices[0].delta
                            if delta and delta.content:
                                success = True
                                yield delta.content
                    if success:
                        return
                except Exception as e:
                    print(f"❌ Стрімінг від {provider.get('name')} ({model}) перервався: {e}. Наступний провайдер...")
                    continue

        if not success:
            yield "*(Системне повідомлення): Усі резервні стрімінг-провайдери недоступні.*"
