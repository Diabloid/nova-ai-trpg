import json
import os
import re
import shutil
import sys
from typing import Any, Dict, List, Optional

# Безпечне кодування консолі для Windows
if sys.stdout and hasattr(sys.stdout, "reconfigure"):
    try:
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass

from core.managers.world_manager import WorldManager
from core.services.key_translator import KeyTranslatorService
from core.services.llm_provider_service import LLMProviderService
from core.services.prompt_service import PromptService
from core.services.template_validator import TemplateValidator
from core.storage.template_presets import get_template_presets
from core.utils.llm_json import call_llm_json, strip_markdown_fences
from core.utils.slugify import sanitize_icon_key, slugify_ascii
from schemas.game_dto import (
    CharacterTemplateDraftResponse,
    WorldAiPrompts,
    WorldCreateRequest,
    WorldDetailResponse,
    WorldFinalizeRequest,
    WorldLoreDraftItem,
    WorldLoreGenRequest,
    WorldLoreGenResponse,
    WorldLoreTopicItem,
    WorldPassportDraft,
    WorldPassportDraftResponse,
    WorldPromptsGenRequest,
    WorldTemplateGenRequest,
    WorldWizardStepRequest,
)

CURATED_LUCIDE_ICONS = (
    "moon, sun, sparkles, globe, compass, flame, skull, sword, swords, shield, "
    "cpu, rocket, atom, zap, search, eye, crown, castle, landmark, book-open, scroll-text, trees"
)


class WorldWizardService:
    """
    Сервіс 4-Крокового AI-Майстра Світів:
    - Крок 1: step_passport (dialog / one_shot)
    - Крок 2: generate_prompts (narrator_rules, analyzer_rules, creator_rules, world_tone)
    - Крок 3: generate_lore (plan_topics -> 5 тем, generate_article, expand_article)
    """

    def __init__(
        self,
        provider_service: LLMProviderService,
        world_manager: WorldManager,
        prompt_service: PromptService,
        template_validator: Optional[TemplateValidator] = None,
        key_translator: Optional[KeyTranslatorService] = None,
    ):
        self.provider_service = provider_service
        self.world_manager = world_manager
        self.prompt_service = prompt_service
        self.template_validator = template_validator or world_manager.template_validator
        self.key_translator = key_translator or self.template_validator.key_translator

    # ------------------------------------------------------------------
    # Допоміжні утиліти парсингу та нормалізації
    # ------------------------------------------------------------------

    @staticmethod
    def _normalize_lore_filename(raw_name: Optional[str], fallback_title: str, prefix: str = "") -> str:
        if raw_name:
            base = os.path.splitext(os.path.basename(raw_name.strip()))[0]
            slug = slugify_ascii(base, default="lore_article")
        else:
            slug = slugify_ascii(fallback_title, default="lore_article")
        if prefix and not slug.startswith(prefix):
            slug = f"{prefix}{slug}"
        return f"{slug}.md"

    @staticmethod
    def _extract_markdown_title(content: str, fallback: str) -> str:
        for line in (content or "").splitlines():
            stripped = line.strip()
            if stripped.startswith("#"):
                title = stripped.lstrip("#").strip()
                if title:
                    return title
        return fallback

    def _normalize_passport(
        self,
        raw_draft: Dict[str, Any],
        fallback_passport: Optional[WorldPassportDraft] = None,
    ) -> WorldPassportDraft:
        base = fallback_passport.model_dump() if fallback_passport else {}
        merged = dict(base)
        for key, val in (raw_draft or {}).items():
            if val is not None and val != "":
                merged[key] = val

        title = str(merged.get("title") or "Новий Світ").strip()
        genre = str(merged.get("genre") or "Фентезі").strip()
        description = str(merged.get("description") or "").strip()
        icon = sanitize_icon_key(merged.get("icon"), default="globe")
        accent_color = self.template_validator.validate_hex_color(
            merged.get("accent_color"),
            fallback="#38BDF8",
        )

        raw_locs = merged.get("starting_locations")
        locs: List[str] = []
        if isinstance(raw_locs, list):
            locs = [str(x).strip() for x in raw_locs if str(x).strip()]
        if not locs:
            locs = [f"Центральний район ({title})", "Прикордонний форпост", "Таємничі околиці"]

        return WorldPassportDraft(
            title=title,
            genre=genre,
            description=description,
            icon=icon,
            accent_color=accent_color,
            starting_locations=locs[:6],
        )

    # ------------------------------------------------------------------
    # Крок 1: Паспорт світу (dialog / one_shot)
    # ------------------------------------------------------------------

    async def step_passport(self, request: WorldWizardStepRequest) -> WorldPassportDraftResponse:
        """
        Крок 1 AI-Майстра Світів:
        - mode="dialog": дружнє інтерв'ю з поступовим наповненням passport_draft;
        - mode="one_shot": миттєва генерація готового WorldPassportDraft із одного опису.
        """
        mode = (request.mode or "dialog").strip().lower()
        current_json = (
            request.current_passport.model_dump_json(indent=2)
            if request.current_passport
            else "{}"
        )

        if mode == "one_shot":
            task_hint = (
                "РЕЖИМ ONE-SHOT: Користувач надав короткий концепт світу. "
                "Одразу згенеруй повний, яскравий та продуманий паспорт світу (включно з 3-5 атмосферними "
                "стартовими локаціями, доречним HEX-кольором і Lucide-іконкою). "
                "У 'reply' дай короткий захопливий підсумок створеного світу (2-3 речення українською)."
            )
        else:
            task_hint = (
                "РЕЖИМ DIALOG: Допомагай користувачу поступово сформувати концепт світу в дружньому діалозі. "
                "У 'reply' відреагуй на ідею й задай 1-2 уточнюючих питання (2-3 речення українською). "
                "Одночасно онови 'passport_draft' усіма деталями, які вже відомі або доречні."
            )

        system_prompt = self.prompt_service.render_prompt(
            "world_wizard_passport_system.txt",
            task_hint=task_hint,
            curated_lucide_icons=CURATED_LUCIDE_ICONS,
        )

        messages: List[Dict[str, str]] = [{"role": "system", "content": system_prompt}]
        for h in (request.history or []):
            role = "user" if h.get("role") in ("user", "player") else "assistant"
            content = h.get("content") or h.get("text", "")
            if content:
                messages.append({"role": role, "content": content})

        user_payload = (
            f"ПОТОЧНА ЧЕРНЕТКА ПАСПОРТА:\n{current_json}\n\n"
            f"ЗАПИТ КОРИСТУВАЧА:\n{request.message}"
        )
        messages.append({"role": "user", "content": user_payload})

        try:
            parsed = await call_llm_json(
                self.provider_service,
                messages,
                provider_type="state",
                temperature=0.5,
                max_tokens=1200,
            )
            reply = str(parsed.get("reply") or "Концепт світу оновлено!").strip()
            raw_draft = parsed.get("passport_draft")
            if not isinstance(raw_draft, dict):
                raw_draft = {k: v for k, v in parsed.items() if k != "reply"}
            passport = self._normalize_passport(raw_draft, fallback_passport=request.current_passport)
            return WorldPassportDraftResponse(reply=reply, passport_draft=passport)
        except Exception as e:
            print(f"⚠️ [WorldWizardService] Помилка парсингу step_passport ({e})")
            fallback = self._normalize_passport({}, fallback_passport=request.current_passport)
            return WorldPassportDraftResponse(
                reply="Розповіси трохи більше про атмосферу, конфлікт або ключові локації цього світу?",
                passport_draft=fallback,
            )

    # ------------------------------------------------------------------
    # Генерація 4 сеттингових правил ai_prompts (з контекстом лору й шаблону)
    # ------------------------------------------------------------------

    @staticmethod
    def _summarize_template_for_prompts(template: Optional[Dict[str, Any]]) -> str:
        """Формує стислий опис секцій і реальних dot-шляхів анкети для Кроку генерації промптів."""
        if not isinstance(template, dict) or not template:
            return "Не надано (використай загальні рекомендації жанру)."

        lines: List[str] = []
        schema_meta = template.get("_schema_meta")
        sections = schema_meta.get("sections") if isinstance(schema_meta, dict) else None
        if isinstance(sections, dict) and sections:
            lines.append("Секції _schema_meta:")
            for sec_path, info in sections.items():
                if not isinstance(info, dict):
                    continue
                arch = info.get("archetype", "?")
                placement = info.get("placement", "?")
                title = info.get("title", sec_path)
                val_hint = ""
                cur_val = template.get(sec_path) if "." not in sec_path else None
                if isinstance(cur_val, dict) and cur_val:
                    sub_keys = ", ".join(f"{sec_path}.{k}" for k in list(cur_val.keys())[:8])
                    val_hint = f" | ключі: [{sub_keys}]"
                lines.append(f"- {sec_path} («{title}», archetype={arch}, placement={placement}){val_hint}")
        else:
            top_keys = [k for k in template.keys() if k not in ("_schema_meta", "created_at", "updated_at")]
            lines.append(f"Кореневі блоки анкети: {', '.join(top_keys)}")

        return "\n".join(lines) if lines else "Не надано."

    async def generate_prompts(self, request: WorldPromptsGenRequest) -> WorldAiPrompts:
        """
        Генерує 4 чіткі українські блоки інструкцій (world_tone, narrator_rules, analyzer_rules, creator_rules)
        на основі паспорта, tone_chips, дайджесту лору та реальної структури character_template.
        """
        passport = request.passport
        chips_str = ", ".join(request.tone_chips) if request.tone_chips else "Збалансований, атмосферний"
        current_str = request.current_prompts.model_dump_json(indent=2) if request.current_prompts else "Відсутні"
        lore_ctx = (request.lore_digest or "").strip()[:5000] or "Не надано"
        template_ctx = self._summarize_template_for_prompts(request.character_template)

        system_prompt = self.prompt_service.render_prompt("world_wizard_prompts_system.txt")

        user_prompt = (
            f"ПАСПОРТ СВІТУ:\n{passport.model_dump_json(indent=2)}\n\n"
            f"ОБРАНІ ТЕГИ ТОНУ: {chips_str}\n"
            f"ДАЙДЖЕСТ ЛОРУ СВІТУ:\n{lore_ctx}\n\n"
            f"СТРУКТУРА АНКЕТИ ПЕРСОНАЖА (ТОЧНІ ШЛЯХИ ПОЛІВ):\n{template_ctx}\n\n"
            f"ПОБАЖАННЯ АВТОРА: {request.custom_instruction or 'Без додаткових побажань'}\n"
            f"ПОТОЧНІ ПРОМПТИ (якщо потрібно уточнити/оновити):\n{current_str}"
        )

        parsed = await call_llm_json(
            self.provider_service,
            [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ],
            provider_type="state",
            temperature=0.4,
            max_tokens=1600,
        )
        return WorldAiPrompts(
            world_tone=(parsed.get("world_tone") or f"Атмосферний світ жанру «{passport.genre}» — {passport.title}.").strip(),
            narrator_rules=(parsed.get("narrator_rules") or f"Дотримуйся логіки та канону світу «{passport.title}».").strip(),
            analyzer_rules=(parsed.get("analyzer_rules") or "Точно фіксуй витрати ресурсів, поранення та зміни в інвентарі.").strip(),
            creator_rules=(parsed.get("creator_rules") or f"Допомагай створити органічного героя для світу «{passport.title}» ({passport.genre}).").strip(),
        )

    # ------------------------------------------------------------------
    # Крок 3: Генератор та редактор Лору (plan_topics, generate_article, expand_article)
    # ------------------------------------------------------------------

    async def generate_lore(self, request: WorldLoreGenRequest) -> WorldLoreGenResponse:
        """
        Крок 3 AI-Майстра Світів:
        - mode="plan_topics": 5 різнопланових стартових тем лору (01_...md .. 05_...md);
        - mode="generate_article": генерація змістовної Markdown-статті;
        - mode="expand_article": розширення чи переписування наявної статті.
        """
        mode = (request.mode or "plan_topics").strip().lower()
        if mode == "plan_topics":
            topics = await self._plan_lore_topics(request)
            return WorldLoreGenResponse(topics=topics)
        if mode == "generate_article":
            article = await self._generate_lore_article(request)
            return WorldLoreGenResponse(article=article)
        if mode == "expand_article":
            article = await self._expand_lore_article(request)
            return WorldLoreGenResponse(article=article)

        raise ValueError(f"Невідомий режим генерації лору: '{request.mode}'")

    async def _plan_lore_topics(self, request: WorldLoreGenRequest) -> List[WorldLoreTopicItem]:
        passport = request.passport
        prompts_ctx = request.ai_prompts.model_dump_json(indent=2) if request.ai_prompts else "{}"
        existing_str = ", ".join(request.existing_titles or []) or "Немає"

        system_prompt = self.prompt_service.render_prompt("world_wizard_lore_plan_system.txt")

        user_prompt = (
            f"ПАСПОРТ СВІТУ:\n{passport.model_dump_json(indent=2)}\n\n"
            f"ПРАВИЛА СВІТУ:\n{prompts_ctx}\n\n"
            f"УЖЕ НАЯВНІ ЗАГОЛОВКИ (не дублювати): {existing_str}"
        )

        parsed = await call_llm_json(
            self.provider_service,
            [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ],
            provider_type="state",
            temperature=0.5,
            max_tokens=1200,
        )
        raw_topics = parsed.get("topics") or []
        topics: List[WorldLoreTopicItem] = []
        used_filenames = set()

        for idx, item in enumerate(raw_topics[:5]):
            if not isinstance(item, dict):
                continue
            title = str(item.get("title") or f"Стаття {idx + 1}").strip()
            prefix = f"{idx + 1:02d}_"
            fname = self._normalize_lore_filename(item.get("filename"), title, prefix=prefix)
            if fname in used_filenames:
                fname = f"{prefix}{slugify_ascii(title, default='topic')}_{idx + 1}.md"
            used_filenames.add(fname)
            topics.append(
                WorldLoreTopicItem(
                    filename=fname,
                    title=title,
                    brief=str(item.get("brief") or "").strip(),
                )
            )

        # Страхуємо гарантовані 5 тем, якщо ШІ повернув менше
        fallback_defs = [
            ("01_svitobudova.md", "Світобудова та ключові регіони", f"Географія та атмосфера світу {passport.title}."),
            ("02_istoriya.md", "Історія та переломні події", "Минулі конфлікти, що сформували сьогодення."),
            ("03_fraktsiyi.md", "Фракції, влада та впливові сили", "Основні угруповання, гільдії або корпорації."),
            ("04_mekhaniky_svitu.md", "Технології, магія та закони", "Особливі сили та ресурси, якими користуються герої."),
            ("05_meshkantsi_ta_zahrozy.md", "Мешканці та небезпеки", "Побут населення, істоти та головні загрози."),
        ]
        while len(topics) < 5:
            f_def = fallback_defs[len(topics)]
            if f_def[0] not in used_filenames:
                used_filenames.add(f_def[0])
                topics.append(WorldLoreTopicItem(filename=f_def[0], title=f_def[1], brief=f_def[2]))

        return topics

    async def _generate_lore_article(self, request: WorldLoreGenRequest) -> WorldLoreDraftItem:
        passport = request.passport
        topic = (request.topic or "Загальний лор світу").strip()
        prompts_ctx = request.ai_prompts.model_dump_json(indent=2) if request.ai_prompts else "{}"
        existing_str = ", ".join(request.existing_titles or []) or "Немає"

        system_prompt = self.prompt_service.render_prompt("world_wizard_lore_article_system.txt")

        user_prompt = (
            f"СВІТ: {passport.title} ({passport.genre})\n"
            f"ОПИС СВІТУ: {passport.description}\n"
            f"ПРАВИЛА СВІТУ:\n{prompts_ctx}\n"
            f"ТЕМА СТАТТІ: {topic}\n"
            f"ДОДАТКОВІ ІНСТРУКЦІЇ: {request.instruction or 'Розкрий тему яскраво та корисно для Оповідача й гравця.'}\n"
            f"УЖЕ НАЯВНІ ЗАГОЛОВКИ: {existing_str}"
        )

        raw_md = await self.provider_service.execute_with_fallback(
            provider_type="story",
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ],
            temperature=0.7,
            max_tokens=1600,
        )

        content = strip_markdown_fences(raw_md)

        title = self._extract_markdown_title(content, fallback=topic)
        if not content.startswith("#"):
            content = f"# {title}\n\n{content}"

        filename = self._normalize_lore_filename(request.filename, title)
        return WorldLoreDraftItem(filename=filename, title=title, content=content)

    async def _expand_lore_article(self, request: WorldLoreGenRequest) -> WorldLoreDraftItem:
        passport = request.passport
        existing = (request.existing_content or "").strip()
        instruction = (request.instruction or "Розшир статтю новими деталями, назвами локацій та ігровими гачками.").strip()

        system_prompt = self.prompt_service.render_prompt("world_wizard_lore_expand_system.txt")

        user_prompt = (
            f"СВІТ: {passport.title} ({passport.genre})\n"
            f"ПОТОЧНИЙ ТЕКСТ СТАТТІ:\n{existing}\n\n"
            f"ІНСТРУКЦІЯ АВТОРА: {instruction}"
        )

        raw_md = await self.provider_service.execute_with_fallback(
            provider_type="story",
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ],
            temperature=0.6,
            max_tokens=2000,
        )

        content = strip_markdown_fences(raw_md)

        fallback_title = request.topic or (os.path.splitext(request.filename)[0] if request.filename else "Оновлена стаття")
        title = self._extract_markdown_title(content, fallback=fallback_title)
        if not content.startswith("#"):
            content = f"# {title}\n\n{content}"

        filename = self._normalize_lore_filename(request.filename, title)
        return WorldLoreDraftItem(filename=filename, title=title, content=content)

    # ------------------------------------------------------------------
    # Крок 4: Генерація/правка character_template.json + demo_state
    # ------------------------------------------------------------------

    def _pick_genre_fallback_template(self, genre: str) -> Dict[str, Any]:
        g = (genre or "").lower()
        presets = {p.id: p.template for p in get_template_presets()}
        if any(k in g for k in ("кібер", "cyber", "sci-fi", "космо", "фантаст")):
            return presets["cyberpunk_scifi"]
        if any(k in g for k in ("детект", "нуар", "noir", "містик")):
            return presets["detective_noir"]
        if any(k in g for k in ("апокал", "вижив", "post", "stalker", "сталкер")):
            return presets["post_apocalypse"]
        return presets["dark_fantasy"]

    async def generate_template(self, request: WorldTemplateGenRequest) -> CharacterTemplateDraftResponse:
        """
        Крок 4 AI-Майстра Світів:
        Генерує або оновлює унікальний character_template.json (зі схемою _schema_meta v2)
        та реалістичний demo_state для живого прев'ю на клієнті, проганяючи обидва через TemplateValidator.
        """
        passport = request.passport
        temp_world_id = slugify_ascii(passport.title, default="custom_world")
        default_loc = passport.starting_locations[0] if passport.starting_locations else "Стартова локація"

        prompts_ctx = request.ai_prompts.model_dump_json(indent=2) if request.ai_prompts else "{}"
        current_tpl_str = (
            json.dumps(request.current_template, ensure_ascii=False, indent=2)
            if request.current_template
            else "Відсутній (створи з нуля під жанр світу)"
        )
        lore_ctx = (request.lore_digest or "").strip()[:6000] or "Не надано"

        system_prompt = self.prompt_service.render_prompt(
            "world_wizard_template_system.txt",
            curated_lucide_icons=CURATED_LUCIDE_ICONS,
        )

        user_prompt = (
            f"ПАСПОРТ СВІТУ:\n{passport.model_dump_json(indent=2)}\n\n"
            f"ПРАВИЛА СВІТУ:\n{prompts_ctx}\n\n"
            f"ДАЙДЖЕСТ ЛОРУ:\n{lore_ctx}\n\n"
            f"ПОТОЧНИЙ ШАБЛОН (якщо потрібно доопрацювати):\n{current_tpl_str}\n\n"
            f"ПОБАЖАННЯ КОРИСТУВАЧА: {request.custom_instruction or 'Оптимальна збалансована анкета під сеттинг.'}"
        )

        passport_dict = passport.model_dump()
        passport_dict["world_id"] = temp_world_id

        try:
            parsed = await call_llm_json(
                self.provider_service,
                [
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_prompt},
                ],
                provider_type="state",
                temperature=0.3,
                max_tokens=2400,
            )
            raw_tpl = parsed.get("character_template")
            if not isinstance(raw_tpl, dict) or not raw_tpl:
                raw_tpl = request.current_template or self._pick_genre_fallback_template(passport.genre)
            raw_demo = parsed.get("demo_state") if isinstance(parsed.get("demo_state"), dict) else None
            note = str(parsed.get("summary_note") or "Анкета сформована та провалідована під схему v2.").strip()
        except Exception as e:
            print(f"⚠️ [WorldWizardService] Fallback шаблону в generate_template ({e})")
            raw_tpl = request.current_template or self._pick_genre_fallback_template(passport.genre)
            raw_demo = None
            note = "Використано базовий жанровий шаблон (відновлено після збою парсингу)."

        validated_tpl = self.template_validator.validate_and_normalize(
            raw_tpl,
            world_id=temp_world_id,
            default_location=default_loc,
        )
        validated_demo = self.template_validator.build_demo_preview_if_missing(
            validated_tpl,
            demo_state=raw_demo,
            world_passport=passport_dict,
            fallback_examples=raw_tpl,
        )
        await self.key_translator.populate_field_labels_async(validated_tpl, validated_demo)

        return CharacterTemplateDraftResponse(
            character_template=validated_tpl,
            demo_state=validated_demo,
            summary_note=note,
        )

    # ------------------------------------------------------------------
    # Атомарна фіналізація світу (finalize_world)
    # ------------------------------------------------------------------

    async def finalize_world(self, request: WorldFinalizeRequest) -> WorldDetailResponse:
        """
        Атомарно створює пакет світу в data/worlds/{world_id}/:
        1. Створює світ через WorldManager.create_world(...) з валідованим шаблоном і промптами;
        2. Записує всі статті лору в lore/*.md;
        3. У разі будь-якої помилки — виконує повний rollback (видаляє частково створену папку світу);
        4. Інвалідує кеш світу в PromptService та повертає WorldDetailResponse.
        """
        passport = request.passport
        create_req = WorldCreateRequest(
            world_id=request.world_id,
            title=passport.title,
            genre=passport.genre,
            description=passport.description,
            author="User",
            icon=passport.icon,
            accent_color=passport.accent_color,
            starting_locations=passport.starting_locations,
            ai_prompts=request.ai_prompts,
            character_template=request.character_template,
        )

        summary = self.world_manager.create_world(create_req)
        created_world_id = summary.world_id
        world_dir = self.world_manager.get_world_dir(created_world_id)

        try:
            used_filenames = set()
            for idx, article in enumerate(request.lore_articles):
                prefix = f"{idx + 1:02d}_"
                safe_fname = self._normalize_lore_filename(
                    article.filename,
                    article.title or f"lore_{idx + 1}",
                    prefix=prefix if not article.filename else "",
                )
                if safe_fname in used_filenames:
                    base = os.path.splitext(safe_fname)[0]
                    safe_fname = f"{base}_{idx + 1}.md"
                used_filenames.add(safe_fname)

                content = (article.content or "").strip()
                if content and not content.startswith("#") and article.title:
                    content = f"# {article.title.strip()}\n\n{content}"
                elif not content:
                    content = f"# {article.title or safe_fname}\n\nМатеріал статті."

                self.world_manager.save_lore_article(created_world_id, safe_fname, content)

            self.prompt_service.invalidate_world_cache(created_world_id)
            return self.world_manager.get_world_detail(created_world_id)
        except Exception:
            # Атомарний rollback: не лишаємо на диску частково створений пакет світу
            if os.path.exists(world_dir):
                shutil.rmtree(world_dir, ignore_errors=True)
            self.prompt_service.invalidate_world_cache(created_world_id)
            raise
