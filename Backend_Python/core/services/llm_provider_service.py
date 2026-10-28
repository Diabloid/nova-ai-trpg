import os
import sys
import re
from typing import Optional, Dict, Any, List, AsyncGenerator
import httpx
from openai import AsyncOpenAI

# Безпечне кодування консолі для Windows
if sys.stdout and hasattr(sys.stdout, "reconfigure"):
    try:
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass


def score_model(name: str) -> float:
    """
    Універсальний евристичний скоринг для будь-яких моделей ШІ:
    1. Сімейства: Claude (7000) > GPT (6000) > Gemini (5000) > Qwen (4000) > Minimax (3000) > DeepSeek (2000) > Інші (1000)
    2. Грейд/Потужність: pro/plus/opus/max (300) > flash/standard/haiku (200) > lite/mini/micro/small (100)
    3. Версія: сортування за спаданням числових версій (4.5 > 4 > 3.5 > 3.1 > 3 > 2.7 > 2.5) -> version * 10
    """
    n = name.lower()

    # 1. Сімейства моделей
    family_score = 1000
    if "claude" in n:
        family_score = 7000
    elif "gpt" in n:
        family_score = 6000
    elif "gemini" in n:
        family_score = 5000
    elif "qwen" in n:
        family_score = 4000
    elif "minimax" in n:
        family_score = 3000
    elif "deepseek" in n:
        family_score = 2000

    # 2. Грейд / Потужність (використовуємо регулярні межі, щоб уникнути помилкових збігів типу 'gemini' -> 'mini')
    grade_score = 200
    if re.search(r"(?<![a-z])(lite|mini|micro|small)(?![a-z])", n):
        grade_score = 100
    elif re.search(r"(?<![a-z])(pro|plus|opus|max)(?![a-z])", n):
        grade_score = 300
    elif re.search(r"(?<![a-z])(flash|standard|haiku)(?![a-z])", n):
        grade_score = 200

    # 3. Числова версія моделі
    normalized = re.sub(r"(\d+)-(\d+)", r"\1.\2", n)
    versions = re.findall(r"(?<![a-zA-Z])(\d+(?:\.\d+)?)", normalized)
    version_val = 0.0
    for v in versions:
        try:
            val = float(v)
            if 1.0 <= val <= 10.0 and val > version_val:
                version_val = val
        except ValueError:
            pass

    return family_score + grade_score + (version_val * 10)


class LLMProviderService:
    """
    Відповідає за виклики ШІ-моделей через OpenAI-сумісний інтерфейс
    з динамічним виявленням моделей (Odirouter Discovery),
    евристичним ранжуванням, каскадним резервуванням (Failover) та токен-стрімінгом.
    """
    def __init__(self, config: Dict[str, Any]):
        self.config = config
        self.discovered_models: List[str] = []

    async def discover_and_rank_models(
        self,
        base_url: Optional[str] = None,
        api_key: Optional[str] = None
    ) -> List[str]:
        """
        Динамічне опитування GET /v1/models при старті сервера (lifespan):
        1. Отримує повний список моделей з Odirouter.
        2. Відфільтровує безкоштовні текстові моделі (free-*).
        3. Застосовує евристичний скоринг (Claude > GPT > Gemini > Qwen > Minimax > DeepSeek; pro > flash > lite; версії).
        4. Оновлює активний пул провайдерів з автоматичним failover.
        При збоях мережі або відсутності ключа плавно зберігає статичний резерв із providers.json.
        """
        target_url = base_url or os.getenv("ODIROUTER_BASE_URL", "https://api.odirouter.ai/v1")
        target_key = api_key or os.getenv("ODIROUTER_API_KEY")

        if not target_key:
            print("⚠️ [LLMProviderService] Ключ ODIROUTER_API_KEY не знайдено. Використовується статичний пул з providers.json.")
            return []

        models_endpoint = f"{target_url.rstrip('/')}/models"
        headers = {"Authorization": f"Bearer {target_key}"}

        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                resp = await client.get(models_endpoint, headers=headers)
                if resp.status_code != 200:
                    print(f"⚠️ [LLMProviderService] Odirouter /models повернув статус {resp.status_code}. Збережено статичний пул.")
                    return []

                data = resp.json()
                raw_models = [m.get("id", "") for m in data.get("data", []) if m.get("id")]

                # 1. Фільтрація: тільки безкоштовні моделі (free-*)
                free_models = [m for m in raw_models if "free" in m.lower()]

                # 2. Виключення нетекстових / медіа-моделей
                excluded_keywords = ["image", "edit", "audio", "tts", "embedding", "whisper", "dall-e", "vision-preview"]
                text_free_models = [
                    m for m in free_models
                    if not any(k in m.lower() for k in excluded_keywords)
                ]

                # 3. Евристичний скоринг та сортування за спаданням
                ranked = sorted(
                    list(dict.fromkeys(text_free_models)),
                    key=lambda m: score_model(m),
                    reverse=True
                )

                if ranked:
                    self.discovered_models = ranked
                    # Оновлюємо списки моделей у провайдера Odirouter для story та state
                    for p_type in ("story", "state"):
                        for provider in self.config.get(p_type, []):
                            p_name = provider.get("name", "").lower()
                            p_url = provider.get("url", "").lower()
                            if "odirouter" in p_name or "odirouter" in p_url:
                                provider["models"] = list(ranked)

                    print(f"✨ [LLMProviderService] Сформовано динамічний ШІ-пул з {len(ranked)} безкоштовних моделей:")
                    for idx, m in enumerate(ranked, 1):
                        print(f"   {idx:2d}. {m:<32} (скор: {score_model(m):.1f})")

                    return ranked
                else:
                    print("⚠️ [LLMProviderService] Безкоштовних моделей не виявлено. Збережено базовий конфіг.")
                    return []
        except Exception as e:
            print(f"⚠️ [LLMProviderService] Помилка динамічного опитування моделей ({e}). Використовується резервний конфіг.")
            return []

    async def execute_with_fallback(
        self,
        provider_type: str,
        messages: List[Dict[str, str]],
        temperature: float,
        max_tokens: int,
        response_format: Optional[Dict[str, Any]] = None
    ) -> str:
        """
        Каскадний синхронний виклик (non-streaming): Провайдер -> Моделі за рейтингом -> Наступний провайдер.
        Автоматичний перехід на наступну модель при помилках 403, 429, 503 або збоях квот.
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
                    # Якщо модель не підтримує json_object response_format
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
                    
                    # Логування автоперемикання при 403, 429, 503 або будь-яких помилках квот/моделі
                    print(f"⚠️ [LLMProviderService] Модель {provider.get('name')} ({model}) відмовила ({err_msg}). Автоперемикання (Failover) на наступну модель у пулі...")
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
        Автоперемикання на наступну модель, якщо стрімінг не стартував або перервався.
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
                    print(f"⚠️ [LLMProviderService] Стрімінг від {provider.get('name')} ({model}) перервався ({e}). Автоперемикання (Failover)...")
                    continue

        if not success:
            yield "*(Системне повідомлення): Усі резервні стрімінг-провайдери недоступні.*"
