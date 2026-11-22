import json
import os
import sys
import unittest
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

BACKEND_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if BACKEND_DIR not in sys.path:
    sys.path.insert(0, BACKEND_DIR)

from core.services.key_translator import KeyTranslatorService
from core.services.llm_provider_service import LLMProviderService
from core.services.prompt_service import PromptService
from core.storage.history_service import HistoryService
from core.utils.paths import DATA_DIR


class FakeStatusError(Exception):
    """Імітація OpenAI APIStatusError з полем status_code."""

    def __init__(self, status_code: int, message: str):
        self.status_code = status_code
        super().__init__(message)


def _make_completion_response(text: str):
    return SimpleNamespace(
        choices=[SimpleNamespace(message=SimpleNamespace(content=text))]
    )


class ProviderConfigValidationTests(unittest.TestCase):
    """Перевіряє цілісність providers.json та .env.example без секретів."""

    def test_providers_json_roles_and_priorities(self) -> None:
        cfg_path = os.path.join(DATA_DIR, "config", "providers.json")
        with open(cfg_path, "r", encoding="utf-8") as f:
            cfg = json.load(f)

        self.assertEqual(set(cfg.keys()), {"story", "state", "fast"})

        for role in ("story", "state", "fast"):
            providers = cfg[role]
            self.assertEqual(len(providers), 5, f"Expected 5 providers for role '{role}'")
            self.assertIn("Experiential Labs", providers[-1]["name"])
            for p in providers:
                self.assertIn("env_key", p)
                self.assertTrue(p["env_key"].endswith("_API_KEY"))
                self.assertNotIn("api_key", p)
                self.assertNotIn("meta", p)
                if "OpenRouter" in p["name"]:
                    for model in p["models"]:
                        self.assertTrue(
                            model == "openrouter/free" or model.endswith(":free"),
                            f"Non-free OpenRouter model found: {model}",
                        )
                if "Google AI Studio" in p["name"]:
                    self.assertNotIn("models/gemini-2.5-flash", p["models"])
                    self.assertNotIn("gemini-2.5-flash", p["models"])

        self.assertEqual(cfg["story"][0]["name"], "Odirouter")
        self.assertEqual(cfg["state"][0]["name"], "Google AI Studio")
        self.assertEqual(cfg["fast"][0]["name"], "Groq")

    def test_env_example_contains_expected_placeholders(self) -> None:
        env_example_path = os.path.join(BACKEND_DIR, ".env.example")
        with open(env_example_path, "r", encoding="utf-8") as f:
            content = f.read()

        for key in (
            "ODIROUTER_API_KEY=",
            "GEMINI_API_KEY=",
            "OPENROUTER_API_KEY=",
            "GROQ_API_KEY=",
            "EXPERIENTIAL_API_KEY=",
        ):
            self.assertIn(key, content)
        self.assertNotIn("AIza", content)
        self.assertNotIn("sk-", content)
        self.assertNotIn("gsk_", content)


class ProviderFailoverTests(unittest.IsolatedAsyncioTestCase):
    """Модульні тести Circuit Breaker, failover та ролі 'fast' без реальних запитів."""

    def _build_two_provider_config(self):
        return {
            "story": [
                {
                    "name": "Odirouter",
                    "url": "https://api.odirouter.ai/v1",
                    "env_key": "ODIROUTER_API_KEY",
                    "models": ["m1", "m2", "m3"],
                },
                {
                    "name": "Google AI Studio",
                    "url": "https://generativelanguage.googleapis.com/v1beta/openai/",
                    "env_key": "GEMINI_API_KEY",
                    "models": [
                        "models/gemini-3.8-flash",
                        "models/gemini-4-hydrogen",
                        "models/gemma-4-31b-it",
                    ],
                },
            ],
            "state": [
                {
                    "name": "Google AI Studio",
                    "url": "https://generativelanguage.googleapis.com/v1beta/openai/",
                    "env_key": "GEMINI_API_KEY",
                    "models": ["models/gemini-3.1-flash-lite-preview", "models/gemini-3.8-flash"],
                },
                {
                    "name": "Odirouter",
                    "url": "https://api.odirouter.ai/v1",
                    "env_key": "ODIROUTER_API_KEY",
                    "models": ["m1", "m2"],
                },
            ],
            "fast": [
                {
                    "name": "Groq",
                    "url": "https://api.groq.com/openai/v1",
                    "env_key": "GROQ_API_KEY",
                    "models": ["qwen/qwen3.8-27b", "openai/gpt-oss-20b"],
                },
                {
                    "name": "Google AI Studio",
                    "url": "https://generativelanguage.googleapis.com/v1beta/openai/",
                    "env_key": "GEMINI_API_KEY",
                    "models": ["models/gemini-3.1-flash-lite-preview"],
                },
                {
                    "name": "Odirouter",
                    "url": "https://api.odirouter.ai/v1",
                    "env_key": "ODIROUTER_API_KEY",
                    "models": ["m_fast"],
                },
            ],
        }

    async def test_402_403_413_immediate_provider_cooldown_skips_remaining_models(self) -> None:
        scenarios = [
            (402, "billing_error: insufficient funds"),
            (403, "permission_denied"),
            (413, "Request too large: tokens per minute (TPM) limit reached"),
        ]

        for code, msg in scenarios:
            with self.subTest(status_code=code):
                cfg = self._build_two_provider_config()
                svc = LLMProviderService(cfg)
                attempted_calls = []

                def fake_client_factory(base_url=None, api_key=None, timeout=None):
                    async def fake_create(**kwargs):
                        attempted_calls.append((base_url, kwargs["model"]))
                        if "odirouter" in str(base_url):
                            raise FakeStatusError(code, msg)
                        return _make_completion_response("OK from Google")

                    return SimpleNamespace(
                        chat=SimpleNamespace(completions=SimpleNamespace(create=fake_create))
                    )

                with patch.dict(
                    os.environ,
                    {"ODIROUTER_API_KEY": "fake_odi", "GEMINI_API_KEY": "fake_gem"},
                    clear=False,
                ), patch("core.services.llm_provider_service.AsyncOpenAI", side_effect=fake_client_factory):
                    res = await svc.execute_with_fallback(
                        "story",
                        [{"role": "user", "content": "Привіт"}],
                        temperature=0.5,
                        max_tokens=100,
                    )

                self.assertEqual(res, "OK from Google")
                # Лише 1 модель (m1) на Odirouter могла викликатись перед миттєвим cooldown провайдера
                odi_calls = [c for c in attempted_calls if "odirouter" in c[0]]
                self.assertEqual(odi_calls, [("https://api.odirouter.ai/v1", "m1")])
                self.assertTrue(svc._is_provider_on_cooldown("Odirouter|ODIROUTER_API_KEY"))

                # Наступний виклик іншої ролі ('state') також пропускає охолоджений Odirouter
                attempted_calls.clear()
                with patch.dict(
                    os.environ,
                    {"ODIROUTER_API_KEY": "fake_odi", "GEMINI_API_KEY": "fake_gem"},
                    clear=False,
                ), patch("core.services.llm_provider_service.AsyncOpenAI", side_effect=fake_client_factory):
                    res_state = await svc.execute_with_fallback(
                        "state",
                        [{"role": "user", "content": "{}"}],
                        temperature=0.0,
                        max_tokens=100,
                    )
                self.assertEqual(res_state, "OK from Google")
                self.assertTrue(all("odirouter" not in c[0] for c in attempted_calls))

    async def test_google_429_switches_to_second_model_same_provider(self) -> None:
        cfg = {
            "story": [
                {
                    "name": "Google AI Studio",
                    "url": "https://generativelanguage.googleapis.com/v1beta/openai/",
                    "env_key": "GEMINI_API_KEY",
                    "models": [
                        "models/gemini-3.8-flash",
                        "models/gemini-4-hydrogen",
                        "models/gemma-4-31b-it",
                    ],
                }
            ]
        }
        svc = LLMProviderService(cfg)
        attempted_models = []

        def fake_client_factory(base_url=None, api_key=None, timeout=None):
            async def fake_create(**kwargs):
                model = kwargs["model"]
                attempted_models.append(model)
                if model == "models/gemini-3.8-flash":
                    raise FakeStatusError(
                        429,
                        "Quota exceeded for metric: generativelanguage.googleapis.com/generate_content_free_tier_requests, model: gemini-3.8-flash",
                    )
                return _make_completion_response("OK from gemini-4-hydrogen")

            return SimpleNamespace(
                chat=SimpleNamespace(completions=SimpleNamespace(create=fake_create))
            )

        with patch.dict(os.environ, {"GEMINI_API_KEY": "fake_gem"}, clear=False), patch(
            "core.services.llm_provider_service.AsyncOpenAI", side_effect=fake_client_factory
        ):
            res = await svc.execute_with_fallback(
                "story",
                [{"role": "user", "content": "Привіт"}],
                temperature=0.7,
                max_tokens=200,
            )

        self.assertEqual(res, "OK from gemini-4-hydrogen")
        self.assertEqual(attempted_models, ["models/gemini-3.8-flash", "models/gemini-4-hydrogen"])
        self.assertFalse(svc._is_provider_on_cooldown("Google AI Studio|GEMINI_API_KEY"))
        self.assertTrue(svc._is_model_on_cooldown("Google AI Studio|GEMINI_API_KEY", "models/gemini-3.8-flash"))

    async def test_two_consecutive_429_503_trigger_short_provider_cooldown(self) -> None:
        cfg = {
            "story": [
                {
                    "name": "Odirouter",
                    "url": "https://api.odirouter.ai/v1",
                    "env_key": "ODIROUTER_API_KEY",
                    "models": ["m1", "m2", "m3", "m4", "m5"],
                },
                {
                    "name": "OpenRouter",
                    "url": "https://openrouter.ai/api/v1",
                    "env_key": "OPENROUTER_API_KEY",
                    "models": ["openrouter/free"],
                },
            ]
        }
        svc = LLMProviderService(cfg)
        attempted = []

        def fake_client_factory(base_url=None, api_key=None, timeout=None):
            async def fake_create(**kwargs):
                attempted.append(kwargs["model"])
                if "odirouter" in str(base_url):
                    raise FakeStatusError(429, "Rate limit exceeded for model")
                return _make_completion_response("OK from OpenRouter")

            return SimpleNamespace(
                chat=SimpleNamespace(completions=SimpleNamespace(create=fake_create))
            )

        with patch.dict(
            os.environ,
            {"ODIROUTER_API_KEY": "fake_odi", "OPENROUTER_API_KEY": "fake_or"},
            clear=False,
        ), patch("core.services.llm_provider_service.AsyncOpenAI", side_effect=fake_client_factory):
            res = await svc.execute_with_fallback(
                "story",
                [{"role": "user", "content": "Тест"}],
                temperature=0.5,
                max_tokens=100,
            )

        self.assertEqual(res, "OK from OpenRouter")
        self.assertEqual(attempted, ["m1", "m2", "openrouter/free"])
        self.assertTrue(svc._is_provider_on_cooldown("Odirouter|ODIROUTER_API_KEY"))

    async def test_fast_role_failover_and_fallback_to_state(self) -> None:
        cfg = self._build_two_provider_config()
        svc = LLMProviderService(cfg)

        # 1. Groq (1-й у fast) падає з 413 TPM -> переходить до Google AI Studio (2-й у fast)
        def fake_fast_reserve(base_url=None, api_key=None, timeout=None):
            async def fake_create(**kwargs):
                if "groq" in str(base_url):
                    raise FakeStatusError(413, "Request too large for TPM")
                return _make_completion_response('{"key": "Значення"}')

            return SimpleNamespace(
                chat=SimpleNamespace(completions=SimpleNamespace(create=fake_create))
            )

        with patch.dict(
            os.environ,
            {"GROQ_API_KEY": "fake_groq", "GEMINI_API_KEY": "fake_gem"},
            clear=False,
        ), patch("core.services.llm_provider_service.AsyncOpenAI", side_effect=fake_fast_reserve):
            res = await svc.execute_with_fallback(
                "fast",
                [{"role": "user", "content": "translate"}],
                temperature=0.0,
                max_tokens=100,
            )
        self.assertEqual(res, '{"key": "Значення"}')

        # 2. Якщо всі провайдери 'fast' впали/без ключів — резервний fallback на 'state'
        cfg_only_odi_state = {
            "fast": [
                {
                    "name": "Groq",
                    "url": "https://api.groq.com/openai/v1",
                    "env_key": "GROQ_API_KEY",
                    "models": ["qwen/qwen3.8-27b"],
                }
            ],
            "state": [
                {
                    "name": "Odirouter",
                    "url": "https://api.odirouter.ai/v1",
                    "env_key": "ODIROUTER_API_KEY",
                    "models": ["m_state"],
                }
            ],
        }
        svc2 = LLMProviderService(cfg_only_odi_state)
        called_roles = []

        def fake_state_fallback(base_url=None, api_key=None, timeout=None):
            async def fake_create(**kwargs):
                called_roles.append(kwargs["model"])
                if "groq" in str(base_url):
                    raise FakeStatusError(503, "Service unavailable")
                return _make_completion_response("OK from state fallback")

            return SimpleNamespace(
                chat=SimpleNamespace(completions=SimpleNamespace(create=fake_create))
            )

        with patch.dict(
            os.environ,
            {"GROQ_API_KEY": "fake_groq", "ODIROUTER_API_KEY": "fake_odi"},
            clear=False,
        ), patch("core.services.llm_provider_service.AsyncOpenAI", side_effect=fake_state_fallback):
            res2 = await svc2.execute_with_fallback(
                "fast",
                [{"role": "user", "content": "summary"}],
                temperature=0.2,
                max_tokens=100,
            )
        self.assertEqual(res2, "OK from state fallback")
        self.assertEqual(called_roles, ["qwen/qwen3.8-27b", "m_state"])

    async def test_discover_updates_only_odirouter_across_all_three_roles(self) -> None:
        cfg = self._build_two_provider_config()
        svc = LLMProviderService(cfg)

        fake_payload = {
            "data": [
                {"id": "free-claude-opus-4.5"},
                {"id": "free-gemini-3.8-flash-lite"},
                {"id": "free-image-gen"},
                {"id": "paid-gpt-5"},
            ]
        }

        class FakeAsyncHttpClient:
            def __init__(self, *args, **kwargs):
                pass

            async def __aenter__(self):
                return self

            async def __aexit__(self, *args):
                return False

            async def get(self, url, headers=None):
                return SimpleNamespace(status_code=200, json=lambda: fake_payload)

        with patch("core.services.llm_provider_service.httpx.AsyncClient", FakeAsyncHttpClient):
            ranked = await svc.discover_and_rank_models(
                base_url="https://api.odirouter.ai/v1",
                api_key="fake_odi",
            )

        self.assertEqual(ranked, ["free-claude-opus-4.5", "free-gemini-3.8-flash-lite"])
        self.assertEqual(cfg["story"][0]["models"], ["free-claude-opus-4.5", "free-gemini-3.8-flash-lite"])
        self.assertEqual(cfg["state"][1]["models"], ["free-gemini-3.8-flash-lite", "free-claude-opus-4.5"])
        self.assertEqual(cfg["fast"][2]["models"], ["free-gemini-3.8-flash-lite", "free-claude-opus-4.5"])
        # Google AI Studio та Groq не змінені
        self.assertEqual(
            cfg["story"][1]["models"],
            ["models/gemini-3.8-flash", "models/gemini-4-hydrogen", "models/gemma-4-31b-it"],
        )
        self.assertEqual(cfg["fast"][0]["models"], ["qwen/qwen3.8-27b", "openai/gpt-oss-20b"])

    async def test_failsafe_reset_when_all_providers_in_cooldown(self) -> None:
        cfg = {
            "story": [
                {
                    "name": "Google AI Studio",
                    "url": "https://generativelanguage.googleapis.com/v1beta/openai/",
                    "env_key": "GEMINI_API_KEY",
                    "models": ["models/gemini-3.8-flash"],
                }
            ]
        }
        svc = LLMProviderService(cfg)
        svc._mark_provider_cooldown("Google AI Studio|GEMINI_API_KEY", 900.0, "stale")

        def fake_recovered(base_url=None, api_key=None, timeout=None):
            async def fake_create(**kwargs):
                return _make_completion_response("Recovered after reset")

            return SimpleNamespace(
                chat=SimpleNamespace(completions=SimpleNamespace(create=fake_create))
            )

        with patch.dict(os.environ, {"GEMINI_API_KEY": "fake_gem"}, clear=False), patch(
            "core.services.llm_provider_service.AsyncOpenAI", side_effect=fake_recovered
        ):
            res = await svc.execute_with_fallback(
                "story",
                [{"role": "user", "content": "Привіт"}],
                temperature=0.5,
                max_tokens=100,
            )
        self.assertEqual(res, "Recovered after reset")
        self.assertFalse(svc._is_provider_on_cooldown("Google AI Studio|GEMINI_API_KEY"))

    async def test_key_translator_and_history_service_use_fast_role(self) -> None:
        captured_roles = []

        class SpyProvider:
            async def execute_with_fallback(self, provider_type, messages, **kwargs):
                captured_roles.append(provider_type)
                return '{"blood_oath": "Клятва крові"}'

        kt = KeyTranslatorService(
            provider_service=SpyProvider(),
            cache_path=os.path.join(BACKEND_DIR, "tests", "_tmp_kt_unused.json"),
            prompt_service=PromptService(os.path.join(DATA_DIR, "prompts")),
        )
        res = await kt._translate_batch_via_llm(["blood_oath"])
        self.assertEqual(res, {"blood_oath": "Клятва крові"})
        self.assertEqual(captured_roles, ["fast"])

        # HistoryService компресія при >20 повідомленнях
        captured_roles.clear()

        class FakeHistoryProvider:
            async def execute_with_fallback(self, provider_type, messages, **kwargs):
                captured_roles.append(provider_type)
                return "Стислий підсумок подій."

        hist = HistoryService.__new__(HistoryService)
        hist.history_file_path = ""
        hist.summary = ""
        hist._staged_turn = None
        hist.recent_messages = [{"role": "user", "content": f"Хід {i}"} for i in range(21)]
        await hist._compress_history_if_needed(
            FakeHistoryProvider(),
            PromptService(os.path.join(DATA_DIR, "prompts")),
        )
        self.assertEqual(captured_roles, ["fast"])
        self.assertEqual(hist.summary, "Стислий підсумок подій.")


if __name__ == "__main__":
    unittest.main()
