# 📜 NOVA AI TRPG — Єдиний контракт взаємодії (API & Game Step Contract)
**Версія контракту:** 1.2.1 (Розділення буфера LLM та повного журналу чату)  
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

## 3. Моделі даних (DTO / Schemas)

### 3.1. Інформація про персонажа (`CharacterSummary`)
```json
{
  "char_id": "ayven_mage",
  "name": "Айвен",
  "background": "Найманець, маг вогню та вітру 3-го кола",
  "appearance": "22-річний юнак з довгим рудим волоссям.",
  "created_at": "2026-10-27T18:00:00Z"
}
```

### 3.2. Інформація про кампанію (`CampaignSummary`)
```json
{
  "campaign_id": "ayven_chapel_run_1",
  "char_id": "ayven_mage",
  "title": "Дослідження занедбаної каплиці",
  "current_location": "Вулиця покинутого селища",
  "is_pinned": false,
  "created_at": "2026-10-27T18:10:00Z",
  "last_played": "2026-10-27T18:30:00Z"
}
```

### 3.3. Елемент повного журналу повідомлень (`HistoryMessage`)
```json
{
  "role": "player | narrator | system",
  "text": "Текст повідомлення...",
  "timestamp": "2026-10-27T18:31:00Z"
}
```

### 3.4. Повна модель стану гравця (`PlayerState`)
```json
{
  "meta": {
    "name": "Айвен",
    "background": "Найманець, маг вогню",
    "location": "Вулиця покинутого селища",
    "appearance": "22-річний юнак."
  },
  "anatomy_and_health": {
    "overall_state": "Ефірне Ядро виснажене. М'язовий біль.",
    "injuries": [
      {
        "location": "Спина",
        "type": "Множинні порізи від скла."
      }
    ]
  },
  "storage_and_equipment": {
    "worn": [
      {
        "name": "Мантія мага",
        "desc": "Легка тканина."
      }
    ],
    "containers": {
      "Шкіряний рюкзак": [
        {
          "name": "Мале зілля зцілення",
          "desc": "Флакон із червоною рідиною."
        }
      ]
    }
  },
  "abilities": [
    {
      "name": "Магія вогню 1-го кола",
      "desc": "Створення спрямованого полум'я."
    }
  ]
}
```

### 3.5. Запит дії в кампанії (`ActionRequest`)
```json
{
  "raw_text": "Дістаю ключ із рюкзака та відмикаю старі двері",
  "intents": [
    {
      "type": "action",
      "content": "Дістаю ключ із рюкзака та відмикаю старі двері"
    }
  ],
  "session_id": "ayven_chapel_run_1"
}
```

---

## 4. Специфікація API ендпоінтів

### 4.1. Персонажі (Blueprints)
| Метод | URL | Опис | Request | Response |
| :--- | :--- | :--- | :--- | :--- |
| `GET` | `/api/v1/characters` | Список усіх заготовок героїв | Відсутній | `List<CharacterSummary>` |
| `GET` | `/api/v1/characters/{char_id}` | Повний лист персонажа | Відсутній | `PlayerState` |
| `POST` | `/api/v1/characters` | Створити заготовку персонажа | `PlayerState` | `CharacterSummary` |
| `PUT` | `/api/v1/characters/{char_id}` | Редагувати заготовку героя | `PlayerState` | `PlayerState` |
| `DELETE` | `/api/v1/characters/{char_id}` | Видалити заготовку персонажа | Відсутній | `{"status": "deleted"}` |

### 4.2. Створення персонажа з AI
| Метод | URL | Опис | Request | Response |
| :--- | :--- | :--- | :--- | :--- |
| `POST` | `/api/v1/character/dialog` | Діалог створення героя з Творцем Долі | `{"message": "...", "history": [...]}` | `{"reply": "..."}` |
| `POST` | `/api/v1/character/finalize` | Згенерувати фінальний лист героя | `{"dialog_summary": "..."}` | `PlayerState` |

### 4.3. Кампанії (Campaigns)
| Метод | URL | Опис | Request | Response |
| :--- | :--- | :--- | :--- | :--- |
| `GET` | `/api/v1/characters/{char_id}/campaigns` | Список кампаній персонажа (сортування: закріплені нагорі) | Відсутній | `List<CampaignSummary>` |
| `POST` | `/api/v1/characters/{char_id}/campaigns` | Створити нову кампанію + **автогенерація вступного посту** | `{"title": "..."}` | `CampaignSummary` |
| `GET` | `/api/v1/campaigns/{campaign_id}/history` | **Повний журнал повідомлень із `chat_log.json`** | Відсутній | `List<HistoryMessage>` |
| `PATCH` | `/api/v1/campaigns/{campaign_id}/pin` | Закріпити / відкріпити кампанію (`is_pinned`) | `{"is_pinned": bool}` | `CampaignSummary` |
| `DELETE` | `/api/v1/campaigns/{campaign_id}` | Видалити кампанію | Відсутній | `{"status": "deleted"}` |
| `POST` | `/api/v1/action` | Хід у кампанії (REST) | `ActionRequest` | `ActionResponse` |
| `POST` | `/api/v1/action/stream` | Хід у кампанії (SSE стрімінг) | `ActionRequest` | `text/event-stream` |
| `GET` | `/api/v1/state` | Поточний стан кампанії | `?session_id=...` | `PlayerState` |
