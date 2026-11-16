import os
import sys
import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import uvicorn

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

# Додаємо поточну директорію в sys.path
CURRENT_DIR = os.path.dirname(os.path.abspath(__file__))
if CURRENT_DIR not in sys.path:
    sys.path.insert(0, CURRENT_DIR)

from dependencies import llm_controller, logger
from routers import (
    characters_router,
    wizard_router,
    campaigns_router,
    gameplay_router,
    voice_router,
    legacy_router,
    worlds_router,
)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    Керування життєвим циклом додатку (Lifespan):
    Виконується СТРОГО ОДИН РАЗ під час старту робочого worker-процесу Uvicorn.
    """
    logger.info("🌍 Перевірка та ідемпотентна міграція пакетів світів...")
    llm_controller.world_manager.migrate_if_needed()
    logger.info("⏳ Ініціалізація бази знань та лору базового світу...")
    llm_controller.prompt_service.ensure_lore_loaded()
    logger.info("🔍 Динамічне опитування та евристичне ранжування ШІ-моделей Odirouter...")
    await llm_controller.refresh_ai_models()
    logger.info("🚀 NOVA AI TRPG Engine API v2.0.0 успішно запущено та готовий до гри!")
    yield
    logger.info("🛑 Зупинка NOVA AI TRPG Engine API...")


app = FastAPI(
    title="NOVA AI TRPG Engine API",
    version="2.0.0",
    lifespan=lifespan,
    description=(
        "Офіційний бекенд дипломного проєкту NOVA AI TRPG (API v2.0.0).\n\n"
        "Модульна архітектура:\n"
        "- Світи (Worlds): ізольовані пакети світів (паспорт, ai_prompts, character_template, лор), клонування та захищене видалення.\n"
        "- Персонажі (Blueprints): створення, редагування, Character Wizard з AI Творцем Долі, Live Preview та Live Sync.\n"
        "- Кампанії (Campaigns / Чати): мультисесійність за кожним героєм, авто-генерація вступного наративу (Intro Post), закріплення (Pin), відкат ходу (Rollback).\n"
        "- Ігровий цикл: суворо послідовний пайплайн (Гравець -> Оповідач -> Аналізатор -> Стан) з транзакційним відкатом (Unit of Work) та SSE-стрімінгом.\n"
        "- Голосові сервіси: надшвидке Voice-to-Text розпізнавання дій гравця (Groq Whisper ~0.3–0.5с та мультимодальний Odirouter фолбек)."
    )
)

# CORS Middleware для підключення настільного Electron/React клієнта
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Реєстрація модульних роутерів (Фаза 4 + Етап 1 v2.0.0)
app.include_router(worlds_router)
app.include_router(characters_router)
app.include_router(wizard_router)
app.include_router(campaigns_router)
app.include_router(gameplay_router)
app.include_router(voice_router)
app.include_router(legacy_router)


if __name__ == "__main__":
    uvicorn.run("main:app", host="127.0.0.1", port=8000, reload=True)
