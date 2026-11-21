import copy
import json
import os
import sys
from dataclasses import dataclass
from string import Template
from typing import Any, Dict, Optional, Union

# Безпечне кодування консолі для Windows
if sys.stdout and hasattr(sys.stdout, "reconfigure"):
    try:
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass

from core.managers.world_manager import DEFAULT_WORLD_ID, WorldManager
from core.storage.world_lore_store import ALLOWED_LORE_EXTS


@dataclass
class WorldLoreCache:
    """Кеш лору конкретного світу в оперативній пам'яті."""
    content: str = ""
    file_count: int = 0
    size_bytes: int = 0
    est_tokens: int = 0


class PromptService:
    """
    Мульти-світовий сервіс промптів:
    - Шар 1: базові жанрово-нейтральні промпти в data/prompts/
    - Шар 2: сеттингові правила світу (ai_prompts) та лор світу з WorldManager
    - RAM-кешування лору по кожному world_id окремо
    - Фільтрація службових полів (_schema_meta, meta.avatar) перед LLM
    """

    def __init__(
        self,
        prompts_dir: str,
        auto_load: bool = False,
        world_manager: Optional[WorldManager] = None,
    ):
        self.prompts_dir = prompts_dir
        self.world_manager = world_manager or WorldManager()
        self._prompt_cache: Dict[str, str] = {}
        self._world_lore_cache: Dict[str, WorldLoreCache] = {}

        if auto_load:
            self.ensure_lore_loaded()

    # ------------------------------------------------------------------
    # Завантаження та кешування лору по world_id
    # ------------------------------------------------------------------

    def ensure_lore_loaded(self, world_id: str = DEFAULT_WORLD_ID) -> None:
        """Гарантує одноразове завантаження базових промптів та лору світу в RAM."""
        if world_id not in self._world_lore_cache:
            self._load_world_lore_to_ram(world_id)
        if not self._prompt_cache:
            self._preload_prompts()

    def _resolve_lore_dir(self, world_id: str) -> Optional[str]:
        if self.world_manager and self.world_manager.world_exists(world_id):
            return self.world_manager.get_world_lore_dir(world_id)
        return None

    def _read_lore_file_safe(self, filepath: str) -> str:
        with open(filepath, "rb") as f:
            raw = f.read()
        try:
            return raw.decode("utf-8-sig")
        except UnicodeDecodeError:
            return raw.decode("cp1251", errors="replace")

    def _load_world_lore_to_ram(self, world_id: str) -> WorldLoreCache:
        """Зчитує всі .txt та .md файли лору конкретного світу в RAM."""
        target_dir = self._resolve_lore_dir(world_id)
        if not target_dir or not os.path.exists(target_dir):
            cache = WorldLoreCache()
            self._world_lore_cache[world_id] = cache
            return cache

        combined_lore = []
        count = 0
        for filename in sorted(os.listdir(target_dir)):
            if filename.lower().endswith(ALLOWED_LORE_EXTS):
                filepath = os.path.join(target_dir, filename)
                if not os.path.isfile(filepath):
                    continue
                try:
                    text = self._read_lore_file_safe(filepath)
                    combined_lore.append(f"--- {filename.upper()} ---\n{text}\n")
                    count += 1
                except Exception as e:
                    print(f"⚠️ [PromptService] Помилка зчитування лору {world_id}/{filename}: {e}")

        joined = "\n".join(combined_lore)
        size_bytes = len(joined.encode("utf-8"))
        est_tokens = len(joined) // 4 if joined else 0
        cache = WorldLoreCache(
            content=joined,
            file_count=count,
            size_bytes=size_bytes,
            est_tokens=est_tokens,
        )
        self._world_lore_cache[world_id] = cache
        print(
            f"📚 [PromptService:{world_id}] Завантажено в RAM {count} файлів лору "
            f"({size_bytes / 1024:.1f} КБ, ~{est_tokens} токенів)"
        )
        return cache

    def get_world_lore(self, world_id: str = DEFAULT_WORLD_ID) -> WorldLoreCache:
        """Повертає закешований лор світу (із лінивим завантаженням)."""
        target_world = (world_id or DEFAULT_WORLD_ID).strip().lower() or DEFAULT_WORLD_ID
        if target_world not in self._world_lore_cache:
            return self._load_world_lore_to_ram(target_world)
        return self._world_lore_cache[target_world]

    def invalidate_world_cache(self, world_id: str) -> None:
        """Інвалідує RAM-кеш лору вказаного світу (регістронезалежно)."""
        if not world_id:
            return
        normalized = world_id.strip().lower()
        self._world_lore_cache.pop(normalized, None)

    def reload_world_lore(self, world_id: str = DEFAULT_WORLD_ID) -> WorldLoreCache:
        """Примусово перезавантажує лор світу в RAM."""
        normalized = (world_id or DEFAULT_WORLD_ID).strip().lower() or DEFAULT_WORLD_ID
        self.invalidate_world_cache(normalized)
        return self._load_world_lore_to_ram(normalized)

    def _preload_prompts(self) -> None:
        """Попереднє кешування основних базових шаблонів промптів."""
        for name in [
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
        ]:
            self.get_prompt(name)

    def get_prompt(self, filename: str) -> str:
        """Отримує базовий промпт (Шар 1) з RAM-кешу або читає з диска."""
        if filename in self._prompt_cache:
            return self._prompt_cache[filename]

        filepath = os.path.join(self.prompts_dir, filename)
        try:
            with open(filepath, "r", encoding="utf-8") as file:
                content = file.read()
                self._prompt_cache[filename] = content
                return content
        except FileNotFoundError:
            err = f"Помилка: Файл промпту {filename} не знайдено."
            print(f"⚠️ {err}")
            return err

    def render_prompt(self, filename: str, **variables: Any) -> str:
        """
        Безпечно рендерить шаблон промпту через string.Template ($var / ${var}).
        Фігурні дужки {...} у JSON-прикладах і в значеннях змінних (разом із $)
        не спричиняють KeyError або ValueError.
        """
        template_text = self.get_prompt(filename)
        str_vars = {k: "" if v is None else str(v) for k, v in variables.items()}
        return Template(template_text).safe_substitute(str_vars)

    def reload_lore(self) -> None:
        """Зворотна сумісність: гаряче оновлення лору базового світу."""
        print("🔄 Оновлення лору базового світу в оперативній пам'яті...")
        self.reload_world_lore(DEFAULT_WORLD_ID)

    def reload_prompts(self) -> None:
        """Очищення та повторне зчитування базових шаблонів промптів."""
        self._prompt_cache.clear()
        self._preload_prompts()
        print("🔄 Кеш промптів оновлено!")

    @property
    def cached_lore(self) -> str:
        return self.get_world_lore(DEFAULT_WORLD_ID).content

    @property
    def lore_file_count(self) -> int:
        return self.get_world_lore(DEFAULT_WORLD_ID).file_count

    # ------------------------------------------------------------------
    # Фільтрація службових полів перед передачею в LLM
    # ------------------------------------------------------------------

    @staticmethod
    def strip_service_fields(state_dict: Dict[str, Any]) -> Dict[str, Any]:
        """Видаляє службові UI-поля (_schema_meta, meta.avatar) із копії стану."""
        cleaned = copy.deepcopy(state_dict)
        cleaned.pop("_schema_meta", None)
        meta = cleaned.get("meta")
        if isinstance(meta, dict):
            meta.pop("avatar", None)
        return cleaned

    @classmethod
    def sanitize_player_state_for_llm(cls, player_state: Union[str, Dict[str, Any]]) -> str:
        """
        Приймає словник або JSON-рядок стану гравця, вирізає _schema_meta та meta.avatar
        і повертає чистий JSON-рядок для LLM.
        """
        if isinstance(player_state, dict):
            return json.dumps(cls.strip_service_fields(player_state), ensure_ascii=False, indent=2)

        if not isinstance(player_state, str):
            return str(player_state)

        try:
            parsed = json.loads(player_state)
            if isinstance(parsed, dict):
                return json.dumps(cls.strip_service_fields(parsed), ensure_ascii=False, indent=2)
        except Exception:
            pass
        return player_state

    @staticmethod
    def build_schema_paths_hint(state_dict: Dict[str, Any]) -> str:
        """
        Генерує компактну шпаргалку доступних JSON-шляхів для Аналізатора стану
        на основі поточного стану персонажа та його _schema_meta (до вирізання службових полів).
        """
        if not isinstance(state_dict, dict):
            return ""

        schema_meta = state_dict.get("_schema_meta") or {}
        sections_meta = schema_meta.get("sections") if isinstance(schema_meta, dict) else {}
        if not isinstance(sections_meta, dict):
            sections_meta = {}

        scalar_paths = []
        list_paths = []
        ignored_top = {"_schema_meta", "created_at", "updated_at"}
        ignored_meta = {"world_id", "avatar", "created_at", "updated_at"}

        def _walk(node: Any, prefix: str = "") -> None:
            if isinstance(node, dict):
                sec_info = sections_meta.get(prefix) if prefix else None
                archetype = sec_info.get("archetype") if isinstance(sec_info, dict) else None

                if archetype == "container_map":
                    existing_keys = list(node.keys())
                    keys_hint = f" (існуючі: {', '.join(existing_keys)})" if existing_keys else ""
                    list_paths.append(
                        f"- {prefix}.<Контейнер> [container_map: масив об'єктів {{name, desc}}]{keys_hint}"
                    )
                    return

                if archetype == "stat_grid":
                    for k, v in node.items():
                        scalar_paths.append(f"- {prefix}.{k} (поточне: {json.dumps(v, ensure_ascii=False)})")
                    return

                for k, v in node.items():
                    if not prefix and k in ignored_top:
                        continue
                    if prefix == "meta" and k in ignored_meta:
                        continue
                    full_path = f"{prefix}.{k}" if prefix else k

                    if isinstance(v, list):
                        v_meta = sections_meta.get(full_path)
                        v_arch = v_meta.get("archetype") if isinstance(v_meta, dict) else None
                        if not v_arch:
                            if all(isinstance(item, str) for item in v) and len(v) > 0:
                                v_arch = "tag_list"
                            else:
                                v_arch = "card_list"

                        if v_arch == "tag_list":
                            list_paths.append(f"- {full_path} [tag_list: масив рядків]")
                        else:
                            list_paths.append(f"- {full_path} [card_list: масив об'єктів]")
                    elif isinstance(v, dict):
                        if full_path == "storage_and_equipment.containers":
                            existing_keys = list(v.keys())
                            keys_hint = f" (існуючі: {', '.join(existing_keys)})" if existing_keys else ""
                            list_paths.append(
                                f"- {full_path}.<Контейнер> [container_map: масив об'єктів {{name, desc}}]{keys_hint}"
                            )
                        else:
                            _walk(v, full_path)
                    else:
                        scalar_paths.append(f"- {full_path}")

        _walk(state_dict)

        parts = []
        if scalar_paths:
            parts.append("Скалярні поля (для field_updates):\n" + "\n".join(scalar_paths[:25]))
        if list_paths:
            parts.append("Списки, картки, теги та контейнери (для section_changes):\n" + "\n".join(list_paths[:20]))
        return "\n".join(parts)

    # ------------------------------------------------------------------
    # Двошарова збірка системних промптів (Шар 1 + Шар 2 світу)
    # ------------------------------------------------------------------

    def _get_world_passport_safe(self, world_id: str) -> Dict[str, Any]:
        target_id = world_id or DEFAULT_WORLD_ID
        if self.world_manager and self.world_manager.world_exists(target_id):
            return self.world_manager.get_world_passport(target_id)
        if target_id != DEFAULT_WORLD_ID and self.world_manager and self.world_manager.world_exists(DEFAULT_WORLD_ID):
            return self.world_manager.get_world_passport(DEFAULT_WORLD_ID)
        return {}

    def build_narrator_system_prompt(
        self,
        player_state_str: str,
        summary_text: str,
        world_id: str = DEFAULT_WORLD_ID,
    ) -> str:
        """Збирає двошаровий системний промпт Оповідача (Шар 1 + правила/лор світу)."""
        base_prompt = self.get_prompt("narrator_system.txt")
        passport = self._get_world_passport_safe(world_id)
        ai_prompts = passport.get("ai_prompts") or {}

        world_title = passport.get("title") or world_id
        world_genre = passport.get("genre") or ""
        world_tone = ai_prompts.get("world_tone") or ""
        narrator_rules = ai_prompts.get("narrator_rules") or ""

        layer2_parts = [f"КОНТЕКСТ СВІТУ: {world_title}" + (f" ({world_genre})" if world_genre else "")]
        if world_tone:
            layer2_parts.append(f"ТОН І АТМОСФЕРА СВІТУ:\n{world_tone}")
        if narrator_rules:
            layer2_parts.append(f"ПРАВИЛА СВІТУ ДЛЯ ОПОВІДАЧА:\n{narrator_rules}")

        world_bible = self.get_world_lore(world_id).content
        if world_bible:
            layer2_parts.append(f"ГЛОБАЛЬНИЙ ЛОР СВІТУ:\n{world_bible}")

        summary_display = summary_text if summary_text else "Це самий початок історії. Попередніх подій ще не відбулося."
        clean_state = self.sanitize_player_state_for_llm(player_state_str)

        return (
            f"{base_prompt}\n\n"
            + "\n\n".join(layer2_parts)
            + f"\n\nЩО БУЛО РАНІШЕ (КОРОТКИЙ ПЕРЕКАЗ):\n{summary_display}"
            + f"\n\nВАЖЛИВО! Поточний стан гравця:\n{clean_state}"
        )

    def build_state_system_prompt(
        self,
        player_state_str: str,
        world_id: str = DEFAULT_WORLD_ID,
    ) -> str:
        """Збирає двошаровий системний промпт Аналізатора (Шар 1 + analyzer_rules + шпаргалка шляхів)."""
        base_instruction = self.get_prompt("state_system.txt")
        passport = self._get_world_passport_safe(world_id)
        ai_prompts = passport.get("ai_prompts") or {}
        analyzer_rules = (ai_prompts.get("analyzer_rules") or "").strip()

        # Генеруємо шпаргалку доступних шляхів ДО вирізання _schema_meta
        schema_hint = ""
        raw_state_dict: Optional[Dict[str, Any]] = None
        if isinstance(player_state_str, dict):
            raw_state_dict = player_state_str
        elif isinstance(player_state_str, str):
            try:
                parsed = json.loads(player_state_str)
                if isinstance(parsed, dict):
                    raw_state_dict = parsed
            except Exception:
                pass

        if raw_state_dict is not None:
            schema_hint = self.build_schema_paths_hint(raw_state_dict)

        clean_state = self.sanitize_player_state_for_llm(player_state_str)

        parts = [base_instruction]
        if analyzer_rules:
            world_title = passport.get("title") or world_id
            parts.append(f"ПРАВИЛА СВІТУ ДЛЯ АНАЛІЗАТОРА СТАНУ ({world_title}):\n{analyzer_rules}")
        if schema_hint:
            parts.append(f"ДОСТУПНІ JSON-ШЛЯХИ ПОТОЧНОГО ЛИСТА:\n{schema_hint}")
        parts.append(f"ВАЖЛИВО! Поточний стан гравця:\n{clean_state}")
        return "\n\n".join(parts)

    def build_lore_digest(self, world_id: str = DEFAULT_WORLD_ID, max_chars: int = 12000) -> str:
        """
        Формує збалансований дайджест усіх статей лору світу в межах бюджету max_chars
        (щоб жодна стаття не була відрізана при великому обсязі лору).
        """
        target_dir = self._resolve_lore_dir(world_id)
        if not target_dir or not os.path.exists(target_dir):
            return ""

        files = [
            f for f in sorted(os.listdir(target_dir))
            if f.lower().endswith(ALLOWED_LORE_EXTS) and os.path.isfile(os.path.join(target_dir, f))
        ]
        if not files:
            return ""

        per_file_budget = max(180, (max_chars // len(files)) - 40)
        digest_parts = []
        total_len = 0

        for fname in files:
            try:
                text = self._read_lore_file_safe(os.path.join(target_dir, fname)).strip()
                if not text:
                    continue
                snippet = text[:per_file_budget].strip()
                if len(text) > per_file_budget:
                    snippet += "..."
                block = f"### {os.path.splitext(fname)[0]}\n{snippet}"
                if total_len + len(block) > max_chars and digest_parts:
                    break
                digest_parts.append(block)
                total_len += len(block) + 2
            except Exception:
                continue

        return "\n\n".join(digest_parts)

    def build_creator_system_prompt(self, world_id: str = DEFAULT_WORLD_ID) -> str:
        """Збирає двошаровий системний промпт Творця Долі (Шар 1 + creator_rules + дайджест лору)."""
        base_creator = self.get_prompt("character_creator_system.txt")
        passport = self._get_world_passport_safe(world_id)
        ai_prompts = passport.get("ai_prompts") or {}

        world_title = passport.get("title") or world_id
        world_genre = passport.get("genre") or ""
        world_desc = passport.get("description") or ""
        creator_rules = (ai_prompts.get("creator_rules") or "").strip()
        starting_locs = passport.get("starting_locations") or []

        parts = [base_creator]
        world_header = f"ОБРАНИЙ СВІТ: {world_title}" + (f" ({world_genre})" if world_genre else "")
        if world_desc:
            world_header += f"\nОПИС СВІТУ: {world_desc}"
        if starting_locs:
            world_header += f"\nСТАРТОВІ ЛОКАЦІЇ СВІТУ: {', '.join(starting_locs)}"
        parts.append(world_header)

        if creator_rules:
            parts.append(f"ПРАВИЛА СТВОРЕННЯ ПЕРСОНАЖА В ЦЬОМУ СВІТІ:\n{creator_rules}")

        lore_digest = self.build_lore_digest(world_id, max_chars=12000)
        if lore_digest:
            parts.append(f"ДАЙДЖЕСТ ЛОРУ СВІТУ ДЛЯ ОРІЄНТИРУ:\n{lore_digest}")

        return "\n\n".join(parts)

    def build_summary_system_prompt(self) -> str:
        """Повертає системний промпт для Архіватора/Сумаризатора."""
        return self.get_prompt("summary_system.txt")
