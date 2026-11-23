import os
import sys
import unittest

BACKEND_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if BACKEND_DIR not in sys.path:
    sys.path.insert(0, BACKEND_DIR)

from fastapi.testclient import TestClient

import main
from core.services.prompt_service import PromptService
from core.storage.template_presets import get_template_presets
from core.utils.paths import BASE_DIR, DATA_DIR
from schemas import ItemChange, PlayerState, StateDelta


class BackendSmokeTests(unittest.TestCase):
    """Базові smoke-перевірки цілісності структури пакетів, шляхів та API-контракту."""

    @classmethod
    def setUpClass(cls) -> None:
        cls.client = TestClient(main.app)

    def test_paths_and_static_assets(self) -> None:
        self.assertEqual(os.path.abspath(BASE_DIR), os.path.abspath(BACKEND_DIR))
        self.assertEqual(os.path.abspath(DATA_DIR), os.path.join(os.path.abspath(BACKEND_DIR), "data"))
        self.assertTrue(os.path.isfile(os.path.join(DATA_DIR, "defaults", "default_dark_fantasy_passport.json")))
        self.assertTrue(os.path.isfile(os.path.join(DATA_DIR, "defaults", "default_dark_fantasy_schema_meta.json")))
        self.assertTrue(os.path.isfile(os.path.join(DATA_DIR, "presets", "template_presets.json")))

        ps = PromptService(prompts_dir=os.path.join(DATA_DIR, "prompts"))
        prompt_files = [
            "narrator_system.txt",
            "state_system.txt",
            "summary_system.txt",
            "character_creator_system.txt",
            "character_finalizer_system.txt",
            "world_wizard_passport_system.txt",
            "world_wizard_prompts_system.txt",
            "world_wizard_lore_plan_system.txt",
            "world_wizard_lore_article_system.txt",
            "world_wizard_lore_expand_system.txt",
            "world_wizard_template_system.txt",
            "key_translator_system.txt",
        ]
        for fname in prompt_files:
            content = ps.get_prompt(fname)
            self.assertFalse(content.startswith("Помилка:"), f"Prompt not found: {fname}")

    def test_health_and_openapi(self) -> None:
        r_health = self.client.get("/api/v1/health")
        self.assertEqual(r_health.status_code, 200)
        self.assertEqual(r_health.json().get("status"), "ok")

        r_openapi = self.client.get("/openapi.json")
        self.assertEqual(r_openapi.status_code, 200)
        spec = r_openapi.json()
        self.assertEqual(len(spec.get("paths", {})), 29)
        self.assertIn("/api/v1/campaigns/{campaign_id}/messages/last-narrator", spec.get("paths", {}))
        self.assertGreaterEqual(len(spec.get("components", {}).get("schemas", {})), 50)

    def test_worlds_characters_and_presets(self) -> None:
        r_worlds = self.client.get("/api/v1/worlds")
        self.assertEqual(r_worlds.status_code, 200)
        worlds = r_worlds.json()
        self.assertTrue(any(w.get("world_id") == "default_dark_fantasy" for w in worlds))

        r_chars = self.client.get("/api/v1/characters")
        self.assertEqual(r_chars.status_code, 200)
        self.assertIsInstance(r_chars.json(), list)

        r_presets = self.client.get("/api/v1/templates/presets")
        self.assertEqual(r_presets.status_code, 200)
        presets = r_presets.json()
        self.assertEqual([p["id"] for p in presets], ["dark_fantasy", "cyberpunk_scifi", "detective_noir", "post_apocalypse"])
        self.assertEqual(len(get_template_presets()), 4)

    def test_schema_exports(self) -> None:
        delta = StateDelta(inventory_changes=[ItemChange(action="add", container="Рюкзак", item_name="Ключ")])
        self.assertEqual(len(delta.inventory_changes), 1)
        state = PlayerState()
        self.assertEqual(state.meta.world_id, "default_dark_fantasy")


if __name__ == "__main__":
    unittest.main()
