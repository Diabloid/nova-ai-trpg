using CommunityToolkit.Mvvm.ComponentModel;
using CommunityToolkit.Mvvm.Input;
using Newtonsoft.Json;
using NovaTrpgClient.Models;
using System.Collections.Generic;
using System.Collections.ObjectModel;
using System.Linq;
using System.Net.Http;
using System.Text;
using System.Threading.Tasks;

namespace NovaTrpgClient.ViewModels
{
    // Клас ОБОВ'ЯЗКОВО має бути partial, щоб генератор коду міг дописати магію під капотом
    public partial class MainWindowViewModel : ViewModelBase
    {
        private readonly HttpClient _httpClient;

        [ObservableProperty]
        private string _hpText = "Завантаження...";

        [ObservableProperty]
        private string _inventoryText = "Очікування...";

        [ObservableProperty]
        private string _userInput = "";

        [ObservableProperty]
        private bool _isMenuOpen = false;

        [ObservableProperty]
        private bool _isTyping = false;

        [ObservableProperty]
        private string _animatedDots = "";

        [ObservableProperty]
        private PlayerState? _currentPlayerState;

        public ObservableCollection<ChatMessage> ChatMessages { get; } = new();

        public MainWindowViewModel()
        {
            _httpClient = new HttpClient();
            _ = LoadInitialStateAsync();
        }

        private bool CanSend => !IsTyping;

        partial void OnIsTypingChanged(bool value)
        {
            SendCommand.NotifyCanExecuteChanged();
        }

        // Цей атрибут автоматично створить команду SendCommand для нашої кнопки в AXAML
        [RelayCommand(CanExecute = nameof(CanSend))]
        private async Task SendAsync()
        {
            if (string.IsNullOrWhiteSpace(UserInput)) return;

            string action = UserInput;

            // Відображаємо в UI чистий текст (прибираючи слеші)
            string displayAction = action.Replace(@"\*\*", "**").Replace(@"\""", "\"").Replace(@"\(", "(").Replace(@"\)", ")").Replace(@"\-", "-");
            ChatMessages.Add(new ChatMessage
            {
                Sender = "Ти:",
                Text = displayAction,
                SenderColor = "#60A5FA" // Блакитний
            });
            UserInput = string.Empty;

            var intents = new List<IntentToken>();

            // Парсимо наміри, суворо ігноруючи екрановані елементи
            foreach (System.Text.RegularExpressions.Match m in System.Text.RegularExpressions.Regex.Matches(action, @"(?<!\\)\*\*(.*?)(?<!\\)\*\*"))
                intents.Add(new IntentToken { Type = "action", Content = m.Groups[1].Value.Trim() });

            foreach (System.Text.RegularExpressions.Match m in System.Text.RegularExpressions.Regex.Matches(action, @"(?<!\\)\""(.*?)(?<!\\)\"""))
                intents.Add(new IntentToken { Type = "thought", Content = m.Groups[1].Value.Trim() });

            foreach (System.Text.RegularExpressions.Match m in System.Text.RegularExpressions.Regex.Matches(action, @"(?<!\\)\((.*?)(?<!\\)\)"))
                intents.Add(new IntentToken { Type = "ooc", Content = m.Groups[1].Value.Trim() });

            foreach (System.Text.RegularExpressions.Match m in System.Text.RegularExpressions.Regex.Matches(action, @"(?<!\\)\-(.*)$", System.Text.RegularExpressions.RegexOptions.Multiline))
                intents.Add(new IntentToken { Type = "speech", Content = m.Groups[1].Value.Trim() });

            // УВІМКНЕННЯ ІНДИКАТОРА ОЧІКУВАННЯ
            IsTyping = true;
            _ = AnimateDotsAsync();

            try
            {
                var requestBody = new ActionRequest
                {
                    RawText = displayAction, // ШІ отримає історію без слешів
                    Intents = intents        // ШІ отримає структурований масив намірів
                };

                var content = new StringContent(JsonConvert.SerializeObject(requestBody), Encoding.UTF8, "application/json");

                var response = await _httpClient.PostAsync("http://127.0.0.1:8000/api/v1/action", content);

                response.EnsureSuccessStatusCode();

                var responseString = await response.Content.ReadAsStringAsync();
                var result = JsonConvert.DeserializeObject<ActionResponse>(responseString);

                IsTyping = false;

                if (result?.Status == "success")
                {
                    // 1. Уніфікуємо всі переноси
                    string cleanStory = result.Story.Replace("\r\n", "\n").Replace("\r", "\n");

                    // 2. ЗШИВАЄМО РОЗІРВАНІ СЛОВА ("Х\n\nолодний" -> "Холодний")
                    // Якщо між літерою і малою літерою є переноси БЕЗ пробілів - просто видаляємо їх.
                    cleanStory = System.Text.RegularExpressions.Regex.Replace(cleanStory, @"(?<=\p{L})\n+(?=\p{Ll})", "");

                    // 2.5 ЗШИВАЄМО ВІДІРВАНУ ПУНКТУАЦІЮ ("наверші\n\n." -> "наверші.")
                    // Якщо між будь-яким символом і розділовим знаком є переноси - видаляємо їх
                    cleanStory = System.Text.RegularExpressions.Regex.Replace(cleanStory, @"(?<=\S)\n+(?=[.,!?:;])", "");

                    // 3. ЗШИВАЄМО РОЗІРВАНІ РЕЧЕННЯ ("вітер \n\n пронизує" -> "вітер пронизує")
                    // Всі інші переноси, після яких йде мала літера, замінюємо на один пробіл.
                    cleanStory = System.Text.RegularExpressions.Regex.Replace(cleanStory, @"\s*\n+\s*(?=\p{Ll})", " ");

                    // 4. Рятуємо справжні абзаци (2+ Ентери перед великою літерою чи діалогом)
                    cleanStory = System.Text.RegularExpressions.Regex.Replace(cleanStory, @"\n{2,}", "◄PARAGRAPH►");

                    // 5. Будь-які залишкові одинарні переноси міняємо на пробіл
                    cleanStory = cleanStory.Replace("\n", " ");

                    // 6. Повертаємо красиві абзаци на місце
                    cleanStory = cleanStory.Replace("◄PARAGRAPH►", "\n\n");

                    // Виводимо текст
                    var aimessage = new ChatMessage
                    {
                        Sender = "Оповідач:",
                        Text = "", // Починаємо з порожнього тексту
                        SenderColor = "#EAB308"
                    };
                    ChatMessages.Add(aimessage);

                    string[] words = cleanStory.Split(' ');
                    for (int i = 0; i < words.Length; i++)
                    {
                        aimessage.Text += words[i] + (i < words.Length - 1 ? " " : "");
                        await Task.Delay(50); // 50 мілісекунд на слово
                    }

                    if (result.PlayerState != null)
                    {
                        ApplyPlayerState(result.PlayerState);
                    }
                }
                else
                {
                    ChatMessages.Add(new ChatMessage
                    {
                        Sender = "Система:",
                        Text = string.IsNullOrWhiteSpace(result?.ErrorMessage)
                            ? "Помилка сервера: Невідомий статус."
                            : $"Помилка сервера: {result.ErrorMessage}",
                        SenderColor = "#EF4444"
                    });
                }
            }
            catch (System.Exception ex)
            {
                IsTyping = false;

                ChatMessages.Add(new ChatMessage
                {
                    Sender = "Система:",
                    Text = $"Помилка підключення: {ex.Message}",
                    SenderColor = "#EF4444"
                });
            }
            finally
            {
                // ВИМКНЕННЯ ІНДИКАТОРА ОЧІКУВАННЯ
                IsTyping = false;
            }
        }

        private async Task LoadInitialStateAsync()
        {
            try
            {
                // Робимо GET запит на наш роут стану
                var response = await _httpClient.GetAsync("http://127.0.0.1:8000/api/v1/state");

                if (response.IsSuccessStatusCode)
                {
                    var json = await response.Content.ReadAsStringAsync();
                    var playerState = JsonConvert.DeserializeObject<PlayerState>(json);

                    if (playerState != null)
                    {
                        ApplyPlayerState(playerState);
                    }
                }
                else
                {
                    HpText = "Помилка завантаження";
                    InventoryText = "Сервер повернув код: " + (int)response.StatusCode;
                }
            }
            catch (System.Exception)
            {
                // Якщо сервер FastAPI ще не запущено на момент відкриття клієнта
                HpText = "Сервер офлайн";
                InventoryText = "Очікування підключення...";
            }
        }

        private void ApplyPlayerState(PlayerState state)
        {
            CurrentPlayerState = state;

            // Здоров'я / Анатомія
            string healthStatus = state.AnatomyAndHealth?.OverallState ?? string.Empty;
            if (string.IsNullOrWhiteSpace(healthStatus))
            {
                healthStatus = "Стан стабільний";
            }
            HpText = healthStatus;

            // Збираємо предмети зі спорядження та всіх контейнерів
            var allItems = new List<string>();
            if (state.StorageAndEquipment?.Worn != null)
            {
                allItems.AddRange(state.StorageAndEquipment.Worn);
            }

            if (state.StorageAndEquipment?.Containers != null)
            {
                foreach (var container in state.StorageAndEquipment.Containers)
                {
                    if (container.Value != null)
                    {
                        allItems.AddRange(container.Value);
                    }
                }
            }

            InventoryText = allItems.Any() ? string.Join(", ", allItems) : "порожньо";
        }

        private async Task AnimateDotsAsync()
        {
            int count = 0;
            while (IsTyping)
            {
                AnimatedDots = new string('.', count % 4); // Буде 0, 1, 2, 3 крапки
                count++;
                await Task.Delay(400); // Швидкість зміни крапок
            }
            AnimatedDots = "";
        }
    }
}
