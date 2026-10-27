# 🏛️ NOVA AI TRPG — Завдання розробки Backend (Фаза 2.6: Еластичний Драфт Live Preview)

**Статус:** У роботі (Затверджено Ванею)  
**Версія API:** 1.3.0  
**Директорія:** `Backend_Python/`

---

## 1. Завдання в роботі (Фаза 2.6)

### 🧙‍♂️ 1.1. Підтримка еластичного драфту в Character Wizard
- [ ] Оновити моделі у `schemas/game_dto.py`:
  - `CharacterDialogRequest`: додати поле `include_draft: bool = False`.
  - `CharacterDialogResponse`: додати поле `draft_state: Optional[PlayerState] = None`.
- [ ] Оновити `core/services/character_wizard_service.py` та роут `POST /api/v1/character/dialog`:
  - Якщо `include_draft == False`: швидко генерувати лише художню відповідь Творця Долі за 1–2 с;
  - Якщо `include_draft == True`: додатково витягувати актуальний проміжний `draft_state: PlayerState` (через фіналізатор) і повертати його разом із `reply`.

---

## 2. Підсумки раніше виконаних робіт
- [x] Повне видалення Flet та очищення `requirements.txt`.
- [x] Захист системного шаблону `_template.json` від змін та видалення.
- [x] Повний CRUD заготовок персонажів (`/api/v1/characters`).
- [x] Менеджмент Кампаній з автогенерацією вступного посту Оповідача (`/api/v1/characters/{char_id}/campaigns`).
- [x] Закріплення кампаній (`pin`) та сортування у списку.
- [x] Відокремлення нестисненого журналу `chat_log.json` від LLM-буфера `history.json`.
