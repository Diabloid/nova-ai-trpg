# 📱 NOVA AI TRPG — Архітектурний аудит та дорожня карта C# Client

**Дата аудиту:** Жовтень 2026  
**Стек:** .NET 10.0, Avalonia UI v12.1.3, CommunityToolkit.Mvvm 8.4.2, AvaloniaEdit.  
**Директорія:** `NovaTrpgClient/`

---

## 1. Загальна характеристика та стан MVVM

### 1.1. Позитивні рішення
- Сучасний кросплатформний стек (.NET 10 + Avalonia UI 12).
- Використання `CommunityToolkit.Mvvm` з source generators (`[ObservableProperty]`, `[RelayCommand]`).
- Інтеграція `AvaloniaEdit` із кастомним синтаксичним парсером для намірів гравця (`**дія**`, `"думка"`, `- репліка`, `(OOC)`).
- Привабливий UI у темних тонах з кастомними скролбарами.

### 1.2. Виявлені архітектурні дефекти
1. **"God Object" ViewModel (`MainWindowViewModel.cs`):**
   - Клас поєднує: прямі HTTP-виклики, парсинг регулярними виразами, санітизацію тексту від LLM, анімаційні таймери (`Task.Delay`), управління станом UI.
   - Повне порушення SRP (Single Responsibility Principle).
2. **Витік логіки у Code-Behind (`MainWindow.axaml.cs`):**
   - Обробник кнопки `SendButton_Click` замість чистих біндінгів до команди ViewModel.
   - Прямий доступ до ViewModel із View (`vm.UserInput = text`).
   - Хардкод конфігурації синтаксису AvaloniaEdit у C#-коді замість файлу `Assets/NovaSyntax.xshd`.
3. **Відсутність Dependency Injection та сервісного шару:**
   - Немає жодного інтерфейсу (`IApiClient`, `IGameStateService`, `IIntentParser`).
   - Створення `new HttpClient()` напряму в конструкторі ViewModel (ризик вичерпання сокетів Socket Exhaustion).
   - Немає структурованого логування (`Microsoft.Extensions.Logging`).
4. **Простір імен:**
   - `Models/IntentToken.cs` оголошений у глобальному просторі імен (відсутній `namespace NovaTrpgClient.Models;`).

---

## 2. Комунікація з бекендом та розсинхронізація контрактів

### 2.1. Критична розбіжність DTO (Contract Mismatch)
- Модель `PlayerState` у `Models/ApiResponse.cs` очікує старі поля:
  ```csharp
  public int Hp { get; set; }
  public int MaxHp { get; set; }
  public List<string> Inventory { get; set; }
  ```
- Бекенд давно повертає структуру з `anatomy_and_health` та `storage_and_equipment`.
- У `LoadInitialStateAsync` розробник використав `dynamic` як тимчасову "милицю", що приводить до відображення `???/???` або порожніх списків.
- Відправка запиту у `SendAsync` формується через анонімний тип `new { raw_text = ..., intents = ... }` замість типізованого DTO.

### 2.2. Псевдострімінг та блокування інтерфейсу
- Клієнт чекає повну відповідь сервера (5–12 секунд), після чого розбиває рядок по словах і в циклі робить `aimessage.Text += words[i] + " "; await Task.Delay(50);`.
- Це створює ілюзію стрімінгу, але не прискорює отримання першого слова і породжує спам `PropertyChanged` та виділення пам'яті в купі.
- Поле введення `ChatInputEditor` та кнопка відправки **не блокуються** під час генерації ходу (`IsEnabled` не зв'язаний з `!IsTyping`). Гравець може спамити запити.

---

## 3. Дорожня карта рефакторингу Client

### Фаза 1. Синхронізація DTO та стабільність
- [ ] Оновити `Models/GameStateDto.cs` відповідно до `docs/API_CONTRACT.md` (додати `AnatomyAndHealthDto`, `StorageAndEquipmentDto`, `InjuryDto`).
- [ ] Додати `ActionRequestDto` замість анонімних типів.
- [ ] Виправити простір імен у `Models/IntentToken.cs`.
- [ ] Заблокувати введення та кнопку відправки під час генерації (`IsEnabled="{Binding !IsTyping}"`).

### Фаза 2. Архітектурне розшарування (DI & Services)
- [ ] Підключити `Microsoft.Extensions.DependencyInjection` та `Microsoft.Extensions.Http`.
- [ ] Створити сервіси в папці `Services/`:
  - `IGameApiService` / `GameApiService` (використовує типізований `HttpClient`).
  - `IIntentParserService` / `IntentParserService` (парсинг розмітки намірів).
  - `ITextSanitizerService` / `TextSanitizerService` (очищення артефактів LLM).
- [ ] Перевести серіалізацію на `System.Text.Json` замість `Newtonsoft.Json`.
- [ ] Винести базовий URL сервера в `appsettings.json`.

### Фаза 3. UI/UX: Інтерактивна верхня шторка стану та рефакторинг XAML
- [ ] **Висувна панель стану персонажа (Top Drawer / Expander):**
  - Верхня смуга залишається лаконічною: Ім'я персонажа, Поточна локація, Загальний статус стану.
  - При кліку на верхню смугу вона плавно розгортається/виїжджає вниз, відображаючи повну деталізацію:
    - Анатомія та список активних травм (з візуальною індикацією тяжкості);
    - Екіпіроване спорядження (`worn`);
    - Контейнери інвентарю (рюкзак, кишені, гаманець).
- [ ] **Бічна панель (SplitView):**
  - Залишається виключно системним меню управління грою (Збереження/Завантаження, Налаштування підключення, Вихід).
- [ ] Винести підсвітку синтаксису виключно у файл `Assets/NovaSyntax.xshd`.
- [ ] Очистити `MainWindow.axaml.cs` від бізнес-логіки та перейти на чистий MVVM через `[RelayCommand]`.

### Фаза 4. Підтримка справжнього стрімінгу (SSE / WebSocket)
- [ ] Реалізувати читання `IAsyncEnumerable<string>` з нового ендпоінту бекенду.
- [ ] Оновлювати репліку Оповідача по мірі надходження токенів з мережі в реальному часі.
