import os
import re
import sys
import time
from typing import Any, AsyncGenerator, Dict, List, Optional, Tuple

import httpx
from openai import AsyncOpenAI

# Безпечне кодування консолі для Windows
if sys.stdout and hasattr(sys.stdout, "reconfigure"):
    try:
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass

DEFAULT_REQUEST_TIMEOUT = 45.0
PROVIDER_COOLDOWN_AUTH_OR_BILLING = 900.0
PROVIDER_COOLDOWN_TPM = 600.0
PROVIDER_COOLDOWN_SHARED_RATE = 90.0
MODEL_COOLDOWN_RATE_OR_UNAVAILABLE = 180.0

_STATUS_CODE_RE = re.compile(
    r"(?:error\s*code[:\s]+|status(?:_code)?[:=\s]+|http[/\s]*[\d.]*\s*|^|\b)(401|402|403|413|429|503)\b",
    re.IGNORECASE,
)


def score_model(name: str, mode: str = "story") -> float:
    """
    Евристичний скоринг LLM-моделей для ролей:
    - "story": літературність і глибина (Claude > GPT > Gemini > Qwen; pro/plus/opus > flash > lite);
    - "state" / "fast": швидкість і надійний JSON (Gemini > Qwen > GPT > DeepSeek; lite/mini > flash > pro).
    """
    n = name.lower()

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

    if mode in ("state", "fast"):
        family_score = 1000
        if "gemini" in n:
            family_score = 7000
        elif "qwen" in n:
            family_score = 6000
        elif "gpt" in n:
            family_score = 5000
        elif "deepseek" in n:
            family_score = 4000
        elif "claude" in n:
            family_score = 2000
        elif "minimax" in n:
            family_score = 1000

        grade_score = 200
        if re.search(r"(?<![a-z])(lite|mini|micro|small)(?![a-z])", n):
            grade_score = 400 if mode == "fast" else 300
        elif re.search(r"(?<![a-z])(flash|standard|haiku)(?![a-z])", n):
            grade_score = 300 if mode == "fast" else 250
        elif re.search(r"(?<![a-z])(pro|plus|opus|max)(?![a-z])", n):
            grade_score = 50 if mode == "fast" else 100

        return family_score + grade_score + (version_val * 10)

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

    grade_score = 200
    if re.search(r"(?<![a-z])(lite|mini|micro|small)(?![a-z])", n):
        grade_score = 100
    elif re.search(r"(?<![a-z])(pro|plus|opus|max)(?![a-z])", n):
        grade_score = 300
    elif re.search(r"(?<![a-z])(flash|standard|haiku)(?![a-z])", n):
        grade_score = 200

    return family_score + grade_score + (version_val * 10)


class LLMProviderService:
    """
    Керує мультипровайдерним пулом OpenAI-сумісних LLM (ролі "story", "state", "fast"):
    - кешує AsyncOpenAI клієнти з обмеженим таймаутом;
    - реалізує дво-рівневий Circuit Breaker (Provider Cooldown + Model Cooldown) і fail-safe reset;
    - підтримує динамічне виявлення моделей Odirouter та fallback "fast" -> "state".
    """

    def __init__(
        self,
        config: Dict[str, Any],
        request_timeout: float = DEFAULT_REQUEST_TIMEOUT,
    ):
        self.config = config
        self.request_timeout = request_timeout
        self.discovered_models: List[str] = []
        self.discovered_story_models: List[str] = []
        self.discovered_state_models: List[str] = []
        self.discovered_fast_models: List[str] = []
        self._clients: Dict[Tuple[str, str], AsyncOpenAI] = {}
        self._model_cooldowns: Dict[Tuple[str, str], float] = {}
        self._provider_cooldowns: Dict[str, float] = {}

    @staticmethod
    def _provider_key(provider: Dict[str, Any]) -> str:
        name = str(provider.get("name") or provider.get("url") or "unknown").strip()
        env_key = str(provider.get("env_key") or "").strip()
        return f"{name}|{env_key}" if env_key else name

    def _get_client(self, base_url: Optional[str], api_key: str) -> AsyncOpenAI:
        cache_key = (str(base_url or ""), api_key)
        client = self._clients.get(cache_key)
        if client is None:
            client = AsyncOpenAI(
                base_url=base_url,
                api_key=api_key,
                timeout=self.request_timeout,
            )
            self._clients[cache_key] = client
        return client

    def _is_provider_on_cooldown(self, provider_key: str) -> bool:
        until = self._provider_cooldowns.get(provider_key)
        if until is None:
            return False
        if time.monotonic() >= until:
            self._provider_cooldowns.pop(provider_key, None)
            return False
        return True

    def _is_model_on_cooldown(self, provider_key: str, model: str) -> bool:
        key = (provider_key, model)
        until = self._model_cooldowns.get(key)
        if until is None:
            return False
        if time.monotonic() >= until:
            self._model_cooldowns.pop(key, None)
            return False
        return True

    def _mark_provider_cooldown(self, provider_key: str, ttl: float, reason: str) -> None:
        self._provider_cooldowns[provider_key] = time.monotonic() + ttl
        print(f"🚫 [CircuitBreaker] Провайдер '{provider_key}' у cooldown на {int(ttl)}с ({reason}).")

    def _mark_model_cooldown(self, provider_key: str, model: str, ttl: float, reason: str) -> None:
        self._model_cooldowns[(provider_key, model)] = time.monotonic() + ttl
        print(f"⏳ [CircuitBreaker] Модель '{model}' у '{provider_key}' у cooldown на {int(ttl)}с ({reason}).")

    def _clear_cooldowns_for_role(self, provider_type: str) -> None:
        role_keys = {self._provider_key(p) for p in self.config.get(provider_type, [])}
        for p_key in role_keys:
            self._provider_cooldowns.pop(p_key, None)
        for pair in [k for k in self._model_cooldowns if k[0] in role_keys]:
            self._model_cooldowns.pop(pair, None)

    @staticmethod
    def _extract_status_code(exc: Exception) -> Optional[int]:
        raw_code = getattr(exc, "status_code", None)
        if isinstance(raw_code, int):
            return raw_code
        match = _STATUS_CODE_RE.search(str(exc))
        if match:
            try:
                return int(match.group(1))
            except ValueError:
                return None
        return None

    def _classify_error(self, exc: Exception) -> Tuple[str, float, str, bool]:
        """
        Класифікує помилку API у кортеж (scope, ttl_seconds, reason, is_rate_or_503):
        - scope == "provider": миттєвий пропуск усіх решти моделей провайдера;
        - scope == "model": охолодження лише конкретної пари (provider, model);
        - scope == "none": локальний збій без блокування всього провайдера.
        """
        status_code = self._extract_status_code(exc)
        err_lower = str(exc).lower()

        if status_code in (401, 402, 403) or any(
            marker in err_lower
            for marker in ("billing_error", "insufficient funds", "credit balance", "permission_denied", "invalid_api_key")
        ):
            return ("provider", PROVIDER_COOLDOWN_AUTH_OR_BILLING, f"auth/billing ({status_code or 'error'})", False)

        if status_code == 413 or any(
            marker in err_lower
            for marker in ("request too large", "payload too large", "tokens per minute", "tokens_per_minute", " tpm")
        ):
            return ("provider", PROVIDER_COOLDOWN_TPM, f"payload/TPM ({status_code or 413})", False)

        if status_code == 429:
            account_markers = (
                "daily limit",
                "account limit",
                "tokens per day",
                "tpd",
                "shared quota",
                "organization",
                "insufficient_quota",
                "billing",
            )
            if any(marker in err_lower for marker in account_markers):
                return ("provider", PROVIDER_COOLDOWN_AUTH_OR_BILLING, "account/daily limit 429", False)
            return ("model", MODEL_COOLDOWN_RATE_OR_UNAVAILABLE, "rate limit 429", True)

        if status_code == 503 or any(
            marker in err_lower
            for marker in ("high demand", "service unavailable", "overloaded", "temporarily unavailable")
        ):
            return ("model", MODEL_COOLDOWN_RATE_OR_UNAVAILABLE, f"unavailable ({status_code or 503})", True)

        return ("none", 0.0, "transient", False)

    def _handle_attempt_error(
        self,
        provider_key: str,
        model: str,
        exc: Exception,
        consecutive_rate_errors: int,
    ) -> Tuple[bool, int]:
        """Оновлює Circuit Breaker і повертає (should_break_provider, new_consecutive_rate_errors)."""
        scope, ttl, reason, is_rate_or_503 = self._classify_error(exc)
        if scope == "provider":
            self._mark_provider_cooldown(provider_key, ttl, reason)
            return (True, 0)

        if scope == "model":
            self._mark_model_cooldown(provider_key, model, ttl, reason)
            new_count = consecutive_rate_errors + 1 if is_rate_or_503 else 0
            if new_count >= 2:
                self._mark_provider_cooldown(
                    provider_key,
                    PROVIDER_COOLDOWN_SHARED_RATE,
                    f"{new_count} підряд помилок 429/503",
                )
                return (True, new_count)
            return (False, new_count)

        return (False, 0)

    async def discover_and_rank_models(
        self,
        base_url: Optional[str] = None,
        api_key: Optional[str] = None,
    ) -> List[str]:
        """
        Опитує GET /v1/models на Odirouter і оновлює тільки записи Odirouter
        у пулах "story", "state" та "fast", не змінюючи інші провайдери.
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

                free_models = [m for m in raw_models if "free" in m.lower()]
                excluded_keywords = ["image", "edit", "audio", "tts", "embedding", "whisper", "dall-e", "vision-preview"]
                text_free_models = [
                    m for m in free_models
                    if not any(k in m.lower() for k in excluded_keywords)
                ]

                unique_free_models = list(dict.fromkeys(text_free_models))
                story_ranked = sorted(unique_free_models, key=lambda m: score_model(m, mode="story"), reverse=True)
                state_ranked = sorted(unique_free_models, key=lambda m: score_model(m, mode="state"), reverse=True)
                fast_ranked = sorted(unique_free_models, key=lambda m: score_model(m, mode="fast"), reverse=True)

                if not (story_ranked or state_ranked):
                    print("⚠️ [LLMProviderService] Безкоштовних моделей не виявлено. Збережено базовий конфіг.")
                    return []

                self.discovered_models = story_ranked
                self.discovered_story_models = story_ranked
                self.discovered_state_models = state_ranked
                self.discovered_fast_models = fast_ranked

                role_rankings = {
                    "story": story_ranked,
                    "state": state_ranked,
                    "fast": fast_ranked,
                }
                for role, ranked_list in role_rankings.items():
                    for provider in self.config.get(role, []):
                        p_name = provider.get("name", "").lower()
                        p_url = provider.get("url", "").lower()
                        if "odirouter" in p_name or "odirouter" in p_url:
                            provider["models"] = list(ranked_list)

                print("✨ [LLMProviderService] Сформовано роздільні ШІ-пули Odirouter:")
                print(f"   📖 Story ({len(story_ranked)}): {', '.join(story_ranked[:3])}...")
                print(f"   ⚡ State ({len(state_ranked)}): {', '.join(state_ranked[:3])}...")
                print(f"   🚀 Fast  ({len(fast_ranked)}): {', '.join(fast_ranked[:3])}...")
                return story_ranked
        except Exception as e:
            print(f"⚠️ [LLMProviderService] Помилка динамічного опитування моделей ({e}). Використовується резервний конфіг.")
            return []

    async def _run_execute_pass(
        self,
        providers: List[Dict[str, Any]],
        messages: List[Dict[str, str]],
        temperature: float,
        max_tokens: int,
        response_format: Optional[Dict[str, Any]],
    ) -> Tuple[Optional[str], bool]:
        """Виконує один прохід по провайдерах/моделях. Повертає (result, skipped_by_cooldown)."""
        skipped_by_cooldown = False

        for provider in providers:
            env_key = provider.get("env_key", "")
            api_key = os.getenv(env_key)
            if not api_key:
                print(f"⚠️ Пропуск {provider.get('name')}: Ключ {env_key} відсутній у .env")
                continue

            p_key = self._provider_key(provider)
            if self._is_provider_on_cooldown(p_key):
                skipped_by_cooldown = True
                continue

            client = self._get_client(provider.get("url"), api_key)
            consecutive_rate_errors = 0

            for model in provider.get("models", []):
                if self._is_model_on_cooldown(p_key, model):
                    skipped_by_cooldown = True
                    continue

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
                        return content, skipped_by_cooldown
                    print(f"⚠️ Порожня відповідь від {provider.get('name')} ({model})")
                    consecutive_rate_errors = 0
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
                                return content, skipped_by_cooldown
                        except Exception as e_retry:
                            e = e_retry
                            err_msg = str(e_retry)

                    print(
                        f"⚠️ [LLMProviderService] Модель {provider.get('name')} ({model}) відмовила ({err_msg}). "
                        "Автоперемикання (Failover)..."
                    )
                    should_break, consecutive_rate_errors = self._handle_attempt_error(
                        p_key,
                        model,
                        e,
                        consecutive_rate_errors,
                    )
                    if should_break:
                        break

        return None, skipped_by_cooldown

    async def execute_with_fallback(
        self,
        provider_type: str,
        messages: List[Dict[str, str]],
        temperature: float,
        max_tokens: int,
        response_format: Optional[Dict[str, Any]] = None,
        _allow_role_fallback: bool = True,
    ) -> str:
        """
        Каскадний виклик (non-streaming) із дво-рівневим Circuit Breaker,
        одноразовим fail-safe скиданням cooldown та fallback "fast" -> "state".
        """
        providers = self.config.get(provider_type, [])
        if not providers:
            if provider_type == "fast" and _allow_role_fallback and self.config.get("state"):
                print("↪️ [LLMProviderService] Пул 'fast' порожній, перемикання на 'state'.")
                return await self.execute_with_fallback(
                    "state",
                    messages,
                    temperature=temperature,
                    max_tokens=max_tokens,
                    response_format=response_format,
                    _allow_role_fallback=False,
                )
            print(f"⚠️ Попередження: Немає налаштованих провайдерів для типу '{provider_type}'")
            return '{"error": "Провайдери не налаштовані"}'

        result, skipped_by_cooldown = await self._run_execute_pass(
            providers,
            messages,
            temperature,
            max_tokens,
            response_format,
        )
        if result is not None:
            return result

        # Одноразовий fail-safe reset, якщо частину пулу було заблоковано кешованим cooldown
        if skipped_by_cooldown:
            print(f"🔄 [CircuitBreaker] Усі активні варіанти '{provider_type}' у cooldown — fail-safe скидання та повтор...")
            self._clear_cooldowns_for_role(provider_type)
            result, _ = await self._run_execute_pass(
                providers,
                messages,
                temperature,
                max_tokens,
                response_format,
            )
            if result is not None:
                return result

        if provider_type == "fast" and _allow_role_fallback and self.config.get("state"):
            print("↪️ [LLMProviderService] Усі 'fast'-провайдери недоступні, резервний fallback на 'state'.")
            return await self.execute_with_fallback(
                "state",
                messages,
                temperature=temperature,
                max_tokens=max_tokens,
                response_format=response_format,
                _allow_role_fallback=False,
            )

        return '{"error": "Усі резервні API-провайдери та їхні моделі недоступні."}'

    async def stream_with_fallback(
        self,
        provider_type: str,
        messages: List[Dict[str, str]],
        temperature: float,
        max_tokens: int,
    ) -> AsyncGenerator[str, None]:
        """
        Каскадний стрімінг токенів (SSE) із Circuit Breaker і fail-safe reset.
        """
        providers = self.config.get(provider_type, [])
        for attempt in range(2):
            success = False
            skipped_by_cooldown = False

            for provider in providers:
                env_key = provider.get("env_key", "")
                api_key = os.getenv(env_key)
                if not api_key:
                    continue

                p_key = self._provider_key(provider)
                if self._is_provider_on_cooldown(p_key):
                    skipped_by_cooldown = True
                    continue

                client = self._get_client(provider.get("url"), api_key)
                consecutive_rate_errors = 0

                for model in provider.get("models", []):
                    if self._is_model_on_cooldown(p_key, model):
                        skipped_by_cooldown = True
                        continue

                    try:
                        stream = await client.chat.completions.create(
                            model=model,
                            messages=messages,
                            temperature=temperature,
                            max_tokens=max_tokens,
                            stream=True,
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
                        print(f"⚠️ [LLMProviderService] Стрімінг від {provider.get('name')} ({model}) перервався ({e}). Автоперемикання...")
                        should_break, consecutive_rate_errors = self._handle_attempt_error(
                            p_key,
                            model,
                            e,
                            consecutive_rate_errors,
                        )
                        if should_break:
                            break

            if attempt == 0 and skipped_by_cooldown:
                print(f"🔄 [CircuitBreaker] Усі стрімінг-провайдери '{provider_type}' у cooldown — fail-safe скидання...")
                self._clear_cooldowns_for_role(provider_type)
                continue
            break

        yield "*(Системне повідомлення): Усі резервні стрімінг-провайдери недоступні.*"
