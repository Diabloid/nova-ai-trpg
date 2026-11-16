from .characters import router as characters_router
from .wizard import router as wizard_router, templates_router
from .campaigns import router as campaigns_router
from .gameplay import router as gameplay_router
from .voice import router as voice_router
from .legacy import router as legacy_router
from .worlds import router as worlds_router

__all__ = [
    "characters_router",
    "wizard_router",
    "templates_router",
    "campaigns_router",
    "gameplay_router",
    "voice_router",
    "legacy_router",
    "worlds_router",
]
