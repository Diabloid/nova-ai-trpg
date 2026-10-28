# 📜 NOVA AI TRPG — Єдиний контракт взаємодії (API & Game Step Contract)
**Версія контракту:** 1.4.0 (Динамічні атрибути героя, розширений шаблон, відкат ходу Undo)  
**Статус:** Обов'язковий до дотримання чатами **Backend** та **Client**.

---

## 1. Архітектурне правило ігрового циклу (Суворо послідовний пайплайн)

Аналізатор стану (State Analyzer) **НЕ МОЖЕ** запускатися паралельно з Оповідачем (Game Master/Narrator).  
Він працює строго за наслідками того, що сталося в художній сцені:
$$\text{Гравець} \longrightarrow \text{Оповідач (GM)} \longrightarrow \text{Аналізатор стану} \longrightarrow \text{Оновлення стану кампанії}$$

---

## 2. Сутності системи: Персонаж ➔ Кампанія ➔ Журнали

1. **Character Blueprint (Заготовка персонажа):**
   - Зберігається у `data/characters/{char_id}.json`.
   - Вихідний лист героя: ім'я, біографія, зовнішність, стартові здібності та спорядження.
   - Може бути шаблоном для **будь-якої кількості паралельних Кампаній**.
2. **Campaign (Ігрова кампанія / Сейв):**
   - Зберігається у `data/saves/{campaign_id}/`.
   - Жорстко прив'язана до одного конкретного `char_id`.
   - Має свій живий стан персонажа `savegame.json`.
3. **Розділення сховищ діалогу:**
   - **`history.json` (Буфер для LLM):** містить `summary` та останні `recent_messages`. Стискається нейронкою для збереження ліміту токенів. Клієнтом не відображається.
   - **`chat_log.json` (Повний журнал для людини):** містить **всі репліки від першого до останнього ходу** без жодних обрізань (як історія в Telegram). Саме звідси клієнт читає стрічку чату.
4. **Системний шаблон (`_template.json`):**
   - Повністю порожній, захищений від змін. Заборонено використовувати як ігрову кампанію.

---

## 3. Створення персонажа з AI: Еластичний Драфт (Live Preview)

Для підтримки живої панелі перегляду (Live Preview) під час діалогу створення персонажа клієнт може надсилати запит із прапорцем `include_draft`:

### 3.1. Запит кроку діалогу (`CharacterDialogRequest`)
```json
{
  "message": "Хочу бути магом вогню, колишнім найманцем на ім'я Каелан",
  "history": [
    { "role": "player", "content": "Привіт, хочу створити персонажа" },
    { "role": "narrator", "content": "Вітаю, душе. Яким шляхом ти бажаєш піти?" }
  ],
  "include_draft": true
}
```
*Якщо `include_draft == false` (за замовчуванням) — бекенд повертає лише текст репліки Творця Долі за 1–2 секунди.*  
*Якщо `include_draft == true` — бекенд додатково формує актуальну чернетку `draft_state` для правої панелі Live Preview клієнта.*

### 3.2. Відповідь кроку діалогу (`CharacterDialogResponse`)
```json
{
  "reply": "Вогонь — небезпечний супутник, Каелане... Які чари ти опанував першими?",
  "draft_state": {
    "meta": {
      "name": "Каелан",
      "background": "Колишній найманець, маг вогню",
      "location": "Невідомий ліс",
      "appearance": ""
    },
    "anatomy_and_health": {
      "overall_state": "Повний сил",
      "injuries": []
    },
    "storage_and_equipment": {
      "worn": [],
      "containers": {}
    },
    "abilities": [
      {
        "name": "Магія вогню (початкова)",
        "desc": "Концентрація іскор та малого полум'я."
      }
    ]
  }
}
```

---

## 4. Специфікація API ендпоінтів

### 4.1. Персонажі (Blueprints)
| Метод | URL | Опис | Request | Response |
| :--- | :--- | :--- | :--- | :--- |
| `GET` | `/api/v1/characters` | Список усіх заготовок героїв | Відсутній | `List<CharacterSummary>` |
| `GET` | `/api/v1/characters/{char_id}` | Повний лист персонажа | Відсутній | `PlayerState` |
| `POST` | `/api/v1/characters` | Створити заготовку персонажа вручну | `PlayerState` | `CharacterSummary` |
| `PUT` | `/api/v1/characters/{char_id}` | Редагувати заготовку героя | `PlayerState` | `PlayerState` |
| `DELETE` | `/api/v1/characters/{char_id}` | Видалити заготовку персонажа | Відсутній | `{"status": "deleted"}` |

### 4.2. Створення персонажа з AI (Character Wizard)
| Метод | URL | Опис | Request | Response |
| :--- | :--- | :--- | :--- | :--- |
| `POST` | `/api/v1/character/dialog` | Діалог створення героя з Live Preview | `CharacterDialogRequest` | `CharacterDialogResponse` |
| `POST` | `/api/v1/character/finalize` | Згенерувати фінальний лист героя та зберегти на диск | `{"dialog_summary": "..."}` | `PlayerState` |

### 4.3. Кампанії (Campaigns)
| Метод | URL | Опис | Request | Response |
| :--- | :--- | :--- | :--- | :--- |
| `GET` | `/api/v1/characters/{char_id}/campaigns` | Список кампаній персонажа (закріплені вгорі) | Відсутній | `List<CampaignSummary>` |
| `POST` | `/api/v1/characters/{char_id}/campaigns` | Створити нову кампанію + **автогенерація вступного посту** | `{"title": "..."}` | `CampaignSummary` |
| `GET` | `/api/v1/campaigns/{campaign_id}/history` | **Повний журнал повідомлень із `chat_log.json`** | Відсутній | `List<HistoryMessage>` |
| `PATCH` | `/api/v1/campaigns/{campaign_id}/pin` | Закріпити / відкріпити кампанію (`is_pinned`) | `{"is_pinned": bool}` | `CampaignSummary` |
| `DELETE` | `/api/v1/campaigns/{campaign_id}` | Видалити кампанію | Відсутній | `{"status": "deleted"}` |
| `POST` | `/api/v1/action` | Хід у кампанії (REST) | `ActionRequest` | `ActionResponse` |
| `POST` | `/api/v1/action/stream` | Хід у кампанії (SSE стрімінг) | `ActionRequest` | `text/event-stream` |
| `POST` | `/api/v1/campaigns/{campaign_id}/rollback` | **Відкат на 1 хід назад (Undo)** | Відсутній | `RollbackResponse` (`previous_user_input`, `current_state`) |
| `GET` | `/api/v1/state` | Поточний стан кампанії | `?session_id=...` | `PlayerState` |

---

## 5. Специфікація розширених динамічних атрибутів персонажа (v1.4.0)

Щоб зміни шаблону не ламали старі збереження та сумісність:
1. **Моделі Pydantic (`PlayerMeta` та `PlayerState`):**
   - Використовують `ConfigDict(extra="allow")`.
   - Включають розширені опціональні поля:
     - `first_name: Optional[str]`, `last_name: Optional[str]`, `patronymic: Optional[str]`, `titles: Optional[str]`;
     - `age: Optional[str]`;
     - `appearance_details: Optional[Dict[str, Any]]` (статура, очі, волосся, зріст, расові особливості);
     - `biography: Optional[str]` (детальна хронологія / передісторія);
     - `abilities: List[Dict[str, Any]]` (здібності, вміння, закляття);
     - `custom_blocks: Optional[Dict[str, Any]]` (динамічні довільні блоки шаблону).
2. **Клієнт (C# .NET):**
   - Усі додаткові та нові властивості читаються динамічно (через словники / гнучкі DTO), забезпечуючи відображення у шторці та прев'ю без падінь при зміні полів шаблону.
