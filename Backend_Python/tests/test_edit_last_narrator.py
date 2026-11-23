import json
import os
import sys
import tempfile
import unittest
from unittest.mock import patch

BACKEND_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if BACKEND_DIR not in sys.path:
    sys.path.insert(0, BACKEND_DIR)

from fastapi.testclient import TestClient

import main
from core.managers.campaign_manager import CampaignManager
from core.managers.character_manager import CharacterManager
from dependencies import llm_controller


class EditLastNarratorTests(unittest.TestCase):
    """Тести для PATCH /api/v1/campaigns/{campaign_id}/messages/last-narrator (UX-B1)."""

    def setUp(self) -> None:
        self.tmpdir = tempfile.TemporaryDirectory()
        self.chars_dir = os.path.join(self.tmpdir.name, "characters")
        self.saves_dir = os.path.join(self.tmpdir.name, "saves")
        os.makedirs(self.chars_dir, exist_ok=True)
        os.makedirs(self.saves_dir, exist_ok=True)

        self.orig_char_mgr = llm_controller.character_manager
        self.orig_camp_mgr = llm_controller.campaign_manager

        self.char_mgr = CharacterManager(characters_dir=self.chars_dir)
        self.camp_mgr = CampaignManager(
            saves_dir=self.saves_dir,
            character_manager=self.char_mgr,
            world_manager=llm_controller.world_manager,
        )
        llm_controller.character_manager = self.char_mgr
        llm_controller.campaign_manager = self.camp_mgr

        self.char_id = "test_hero"
        self.base_char_state = {
            "meta": {
                "world_id": "default_dark_fantasy",
                "name": "Айвен",
                "location": "Таверна",
                "appearance": "Плащ і чоботи",
                "biography": "Мандрівник",
            },
            "anatomy_and_health": {"overall_state": "Повний сил", "injuries": []},
            "storage_and_equipment": {
                "worn": [],
                "containers": {"Кишені": [], "Рюкзак": [{"name": "Ліхтар", "desc": "Старий"}]},
            },
            "abilities": [],
            "custom_blocks": {},
        }
        with open(os.path.join(self.chars_dir, f"{self.char_id}.json"), "w", encoding="utf-8") as f:
            json.dump(self.base_char_state, f, ensure_ascii=False, indent=2)

        self.client = TestClient(main.app)

    def tearDown(self) -> None:
        llm_controller.character_manager = self.orig_char_mgr
        llm_controller.campaign_manager = self.orig_camp_mgr
        self.tmpdir.cleanup()

    def _create_campaign(self, intro_text: str = "Ти сидиш у тихій таверні.") -> str:
        async def fake_generate_story(**kwargs):
            return intro_text

        with patch.object(llm_controller, "generate_story", side_effect=fake_generate_story):
            r = self.client.post(f"/api/v1/characters/{self.char_id}/campaigns", json={"title": "Тест"})
        self.assertEqual(r.status_code, 201)
        return r.json()["campaign_id"]

    def _play_turn(self, campaign_id: str, player_text: str, story_text: str, delta_json: str) -> None:
        async def fake_story(*args, **kwargs):
            return story_text

        async def fake_state_json(*args, **kwargs):
            return delta_json

        with patch.object(llm_controller, "generate_story", side_effect=fake_story), patch.object(
            llm_controller, "generate_state_json", side_effect=fake_state_json
        ):
            r = self.client.post(
                "/api/v1/action",
                json={
                    "raw_text": player_text,
                    "intents": [{"type": "action", "content": player_text}],
                    "session_id": campaign_id,
                },
            )
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.json().get("status"), "success")

    def test_edit_normal_turn_with_recalculate_preserves_stack_and_supports_repeat_and_rollback(self) -> None:
        camp_id = self._create_campaign()
        turn1_delta = json.dumps(
            {
                "location_changed": "Підвал",
                "inventory_changes": [
                    {"action": "add", "container": "Рюкзак", "item_name": "Іржавий кинджал", "item_desc": "Старий клинок"}
                ],
            },
            ensure_ascii=False,
        )
        self._play_turn(
            camp_id,
            player_text="Обшукую кімнату",
            story_text="Ти спустився в підвал і знайшов іржавий кинджал.",
            delta_json=turn1_delta,
        )

        captured_calls = []

        async def mock_analyze_state(intents, story_text, player_state_str, world_id="default_dark_fantasy"):
            captured_calls.append({"story_text": story_text, "base_state": json.loads(player_state_str)})
            if "медальйон" in story_text:
                return (
                    json.dumps(
                        {
                            "location_changed": "Каплиця",
                            "inventory_changes": [
                                {"action": "add", "container": "Рюкзак", "item_name": "Срібний медальйон", "item_desc": "Світиться"}
                            ],
                        },
                        ensure_ascii=False,
                    ),
                    True,
                )
            return (
                json.dumps(
                    {
                        "location_changed": "Вежа",
                        "inventory_changes": [
                            {"action": "add", "container": "Рюкзак", "item_name": "Золотий ключ", "item_desc": "Від брами"}
                        ],
                    },
                    ensure_ascii=False,
                ),
                True,
            )

        with patch.object(llm_controller.analyzer_service, "analyze_state_changes", side_effect=mock_analyze_state):
            r_edit1 = self.client.patch(
                f"/api/v1/campaigns/{camp_id}/messages/last-narrator",
                json={"new_text": "Ти опинився у каплиці і знайшов срібний медальйон.", "recalculate_state": True},
            )

        self.assertEqual(r_edit1.status_code, 200)
        d1 = r_edit1.json()
        self.assertEqual(d1["story"], "Ти опинився у каплиці і знайшов срібний медальйон.")
        self.assertTrue(d1["state_recalculated"])
        self.assertTrue(d1["can_rollback"])
        self.assertEqual(d1["rollback_depth"], 1)
        # Перевірка, що Аналізатор отримав pre-turn базу без кинджала
        base_backpack_names = [i["name"] for i in captured_calls[0]["base_state"]["storage_and_equipment"]["containers"]["Рюкзак"]]
        self.assertEqual(base_backpack_names, ["Ліхтар"])

        backpack1 = [i["name"] for i in d1["player_state"]["storage_and_equipment"]["containers"]["Рюкзак"]]
        self.assertEqual(backpack1, ["Ліхтар", "Срібний медальйон"])
        self.assertEqual(d1["player_state"]["meta"]["location"], "Каплиця")

        # Повторне редагування того ж ходу — стек відкатів не зник і база знову pre-turn
        with patch.object(llm_controller.analyzer_service, "analyze_state_changes", side_effect=mock_analyze_state):
            r_edit2 = self.client.patch(
                f"/api/v1/campaigns/{camp_id}/messages/last-narrator",
                json={"new_text": "Ти піднявся у вежу і знайшов золотий ключ.", "recalculate_state": True},
            )
        self.assertEqual(r_edit2.status_code, 200)
        d2 = r_edit2.json()
        backpack2 = [i["name"] for i in d2["player_state"]["storage_and_equipment"]["containers"]["Рюкзак"]]
        self.assertEqual(backpack2, ["Ліхтар", "Золотий ключ"])
        self.assertEqual(d2["player_state"]["meta"]["location"], "Вежа")
        self.assertEqual(d2["rollback_depth"], 1)

        # Перевірка, що наступний rollback працює коректно й відновлює початковий стан
        r_rb = self.client.post(f"/api/v1/campaigns/{camp_id}/rollback")
        self.assertEqual(r_rb.status_code, 200)
        rb = r_rb.json()
        self.assertEqual(rb["previous_user_input"], "Обшукую кімнату")
        self.assertEqual(rb["current_state"]["meta"]["location"], "Таверна")
        self.assertEqual(
            [i["name"] for i in rb["current_state"]["storage_and_equipment"]["containers"]["Рюкзак"]],
            ["Ліхтар"],
        )
        self.assertEqual(rb["rollback_depth"], 0)
        self.assertFalse(rb["can_rollback"])

    def test_edit_without_recalculate_and_intro_post_skips_analyzer(self) -> None:
        camp_id = self._create_campaign("Старий вступний пост.")

        with patch.object(llm_controller.analyzer_service, "analyze_state_changes") as mock_analyzer:
            # На вступному пості (хід 0) навіть з recalculate_state=True Аналізатор НЕ викликається
            r_intro = self.client.patch(
                f"/api/v1/campaigns/{camp_id}/messages/last-narrator",
                json={"new_text": "Оновлений вступний пост.", "recalculate_state": True},
            )
            mock_analyzer.assert_not_called()

        self.assertEqual(r_intro.status_code, 200)
        d_intro = r_intro.json()
        self.assertEqual(d_intro["story"], "Оновлений вступний пост.")
        self.assertFalse(d_intro["state_recalculated"])
        self.assertFalse(d_intro["can_rollback"])
        self.assertEqual(d_intro["rollback_depth"], 0)

        # Звичайний хід, але recalculate_state=False
        self._play_turn(
            camp_id,
            player_text="Йду вперед",
            story_text="Початковий опис кроку.",
            delta_json=json.dumps({"location_changed": "Площа"}, ensure_ascii=False),
        )

        with patch.object(llm_controller.analyzer_service, "analyze_state_changes") as mock_analyzer:
            r_no_recalc = self.client.patch(
                f"/api/v1/campaigns/{camp_id}/messages/last-narrator",
                json={"new_text": "Відредагований опис без перерахунку.", "recalculate_state": False},
            )
            mock_analyzer.assert_not_called()

        self.assertEqual(r_no_recalc.status_code, 200)
        d_nr = r_no_recalc.json()
        self.assertEqual(d_nr["story"], "Відредагований опис без перерахунку.")
        self.assertFalse(d_nr["state_recalculated"])
        self.assertEqual(d_nr["player_state"]["meta"]["location"], "Площа")
        self.assertEqual(d_nr["rollback_depth"], 1)

        # Перевірка синхронізації в chat_log.json та history.json
        r_hist = self.client.get(f"/api/v1/campaigns/{camp_id}/history")
        self.assertEqual(r_hist.status_code, 200)
        msgs = r_hist.json()
        self.assertEqual(msgs[0]["text"], "Оновлений вступний пост.")
        self.assertEqual(msgs[-1]["text"], "Відредагований опис без перерахунку.")

        _, hist_svc, _ = self.camp_mgr.get_campaign_session(camp_id)
        self.assertEqual(hist_svc.recent_messages[-1]["content"], "Відредагований опис без перерахунку.")

    def test_analyzer_failure_leaves_state_and_logs_untouched(self) -> None:
        camp_id = self._create_campaign()
        self._play_turn(
            camp_id,
            player_text="Перевіряю сумку",
            story_text="Оригінальна відповідь Оповідача.",
            delta_json=json.dumps({"location_changed": "Міст"}, ensure_ascii=False),
        )

        # 1. Аналізатор повертає JSON з error
        async def fake_error_json(*args, **kwargs):
            return ('{"error": "provider overloaded"}', False)

        with patch.object(llm_controller.analyzer_service, "analyze_state_changes", side_effect=fake_error_json):
            r1 = self.client.patch(
                f"/api/v1/campaigns/{camp_id}/messages/last-narrator",
                json={"new_text": "Текст що не повинен зберегтися", "recalculate_state": True},
            )
        self.assertIn(r1.status_code, (502, 503))

        # 2. Аналізатор кидає виняток
        async def fake_raise(*args, **kwargs):
            raise RuntimeError("network timeout")

        with patch.object(llm_controller.analyzer_service, "analyze_state_changes", side_effect=fake_raise):
            r2 = self.client.patch(
                f"/api/v1/campaigns/{camp_id}/messages/last-narrator",
                json={"new_text": "Ще одна спроба", "recalculate_state": True},
            )
        self.assertIn(r2.status_code, (502, 503))

        # Лист, історія та chat_log залишились 100% недоторканими
        r_hist = self.client.get(f"/api/v1/campaigns/{camp_id}/history")
        self.assertEqual(r_hist.json()[-1]["text"], "Оригінальна відповідь Оповідача.")
        state_svc, hist_svc, _ = self.camp_mgr.get_campaign_session(camp_id)
        self.assertEqual(state_svc.get_current_state()["meta"]["location"], "Міст")
        self.assertEqual(hist_svc.recent_messages[-1]["content"], "Оригінальна відповідь Оповідача.")

    def test_validation_400_404_and_409_conflict_when_not_narrator(self) -> None:
        camp_id = self._create_campaign()

        # Порожній new_text -> 400
        r_empty = self.client.patch(
            f"/api/v1/campaigns/{camp_id}/messages/last-narrator",
            json={"new_text": "   ", "recalculate_state": True},
        )
        self.assertEqual(r_empty.status_code, 400)

        # Неіснуюча кампанія -> 404
        r_404 = self.client.patch(
            "/api/v1/campaigns/nonexistent_campaign_xyz/messages/last-narrator",
            json={"new_text": "Тест", "recalculate_state": False},
        )
        self.assertEqual(r_404.status_code, 404)

        # Останнє повідомлення в chat_log НЕ narrator -> 409 Conflict
        _, _, chat_log = self.camp_mgr.get_campaign_session(camp_id)
        chat_log.add_message("player", "Репліка гравця без відповіді")

        r_409 = self.client.patch(
            f"/api/v1/campaigns/{camp_id}/messages/last-narrator",
            json={"new_text": "Спроба правки", "recalculate_state": False},
        )
        self.assertEqual(r_409.status_code, 409)


if __name__ == "__main__":
    unittest.main()
