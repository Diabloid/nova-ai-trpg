using CommunityToolkit.Mvvm.ComponentModel;
using CommunityToolkit.Mvvm.Input;
using NovaTrpgClient.Models;
using NovaTrpgClient.Services;
using System;
using System.Collections.Generic;
using System.Collections.ObjectModel;
using System.Linq;
using System.Net.Http;
using System.Threading.Tasks;

namespace NovaTrpgClient.ViewModels
{
    // Partial-клас для генерації властивостей та команд через CommunityToolkit.Mvvm
    public partial class MainWindowViewModel : ViewModelBase
    {
        private readonly IGameApiService _gameApiService;
        private readonly IIntentParserService _intentParserService;
        private readonly ITextSanitizerService _textSanitizerService;

        [ObservableProperty]
        private string _hpText = "Завантаження...";

        [ObservableProperty]
        private string _inventoryText = "Очікування...";

        [ObservableProperty]
        private string _userInput = "";

        [ObservableProperty]
        private bool _isMenuOpen = false;

        [ObservableProperty]
        private bool _isCharacterSheetOpen = false;

        [ObservableProperty]
        private string _characterName = "Герой";

        [ObservableProperty]
        private string _locationText = "Невідома локація";

        [ObservableProperty]
        private string _characterBackground = "";

        [ObservableProperty]
        private string _characterAppearance = "";

        [ObservableProperty]
        private bool _isTyping = false;

        [ObservableProperty]
        private string _animatedDots = "";

        [ObservableProperty]
        private PlayerState? _currentPlayerState;

        public ObservableCollection<ChatMessage> ChatMessages { get; } = new();
        public ObservableCollection<Injury> Injuries { get; } = new();
        public ObservableCollection<string> WornItems { get; } = new();
        public ObservableCollection<ContainerGroup> ContainersList { get; } = new();
        public ObservableCollection<string> AbilitiesList { get; } = new();

        // Основний конструктор із Dependency Injection
        public MainWindowViewModel(
            IGameApiService gameApiService,
            IIntentParserService intentParserService,
            ITextSanitizerService textSanitizerService)
        {
            _gameApiService = gameApiService ?? throw new ArgumentNullException(nameof(gameApiService));
            _intentParserService = intentParserService ?? throw new ArgumentNullException(nameof(intentParserService));
            _textSanitizerService = textSanitizerService ?? throw new ArgumentNullException(nameof(textSanitizerService));

            _ = LoadInitialStateAsync();
        }

        // Конструктор за замовчуванням (для Avalonia XAML Design-Time Previewer)
        public MainWindowViewModel()
            : this(
                new GameApiService(new HttpClient { BaseAddress = new Uri("http://127.0.0.1:8000/") }),
                new IntentParserService(),
                new TextSanitizerService())
        {
        }

        private bool CanSend => !IsTyping;

        partial void OnIsTypingChanged(bool value)
        {
            SendCommand.NotifyCanExecuteChanged();
        }

        [RelayCommand]
        private void ToggleCharacterSheet()
        {
            IsCharacterSheetOpen = !IsCharacterSheetOpen;
        }

        [RelayCommand(CanExecute = nameof(CanSend))]
        private async Task SendAsync()
        {
            if (string.IsNullOrWhiteSpace(UserInput)) return;

            string action = UserInput;
            string displayAction = _intentParserService.CleanDisplayAction(action);

            ChatMessages.Add(new ChatMessage
            {
                Sender = "Ти:",
                Text = displayAction,
                SenderColor = "#60A5FA" // Блакитний
            });
            UserInput = string.Empty;

            var intents = _intentParserService.ParseIntents(action);

            IsTyping = true;
            _ = AnimateDotsAsync();

            try
            {
                var requestBody = new ActionRequest
                {
                    RawText = displayAction,
                    Intents = intents
                };

                var result = await _gameApiService.SendActionAsync(requestBody);

                IsTyping = false;

                if (result?.Status == "success")
                {
                    string cleanStory = _textSanitizerService.SanitizeStory(result.Story);

                    var aimessage = new ChatMessage
                    {
                        Sender = "Оповідач:",
                        Text = "",
                        SenderColor = "#EAB308"
                    };
                    ChatMessages.Add(aimessage);

                    string[] words = cleanStory.Split(' ');
                    for (int i = 0; i < words.Length; i++)
                    {
                        aimessage.Text += words[i] + (i < words.Length - 1 ? " " : "");
                        await Task.Delay(50);
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
            catch (Exception ex)
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
                IsTyping = false;
            }
        }

        private async Task LoadInitialStateAsync()
        {
            try
            {
                var playerState = await _gameApiService.GetPlayerStateAsync();

                if (playerState != null)
                {
                    ApplyPlayerState(playerState);
                }
                else
                {
                    HpText = "Помилка завантаження";
                    InventoryText = "Сервер повернув порожній стан";
                }
            }
            catch (Exception)
            {
                // Якщо сервер FastAPI ще не запущено на момент відкриття клієнта
                HpText = "Сервер офлайн";
                InventoryText = "Очікування підключення...";
            }
        }

        private void ApplyPlayerState(PlayerState state)
        {
            CurrentPlayerState = state;

            // Метадані персонажа
            CharacterName = string.IsNullOrWhiteSpace(state.Meta?.Name) ? "Герой" : state.Meta.Name;
            LocationText = string.IsNullOrWhiteSpace(state.Meta?.Location) ? "Невідома локація" : state.Meta.Location;
            CharacterBackground = state.Meta?.Background ?? string.Empty;
            CharacterAppearance = state.Meta?.Appearance ?? string.Empty;

            // Здоров'я / Анатомія
            string healthStatus = state.AnatomyAndHealth?.OverallState ?? string.Empty;
            if (string.IsNullOrWhiteSpace(healthStatus))
            {
                healthStatus = "Стан стабільний";
            }
            HpText = healthStatus;

            // Травми
            Injuries.Clear();
            if (state.AnatomyAndHealth?.Injuries != null)
            {
                foreach (var injury in state.AnatomyAndHealth.Injuries)
                {
                    Injuries.Add(injury);
                }
            }

            // Спорядження (Worn)
            WornItems.Clear();
            if (state.StorageAndEquipment?.Worn != null)
            {
                foreach (var item in state.StorageAndEquipment.Worn)
                {
                    WornItems.Add(item);
                }
            }

            // Контейнери (Containers)
            ContainersList.Clear();
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
                        ContainersList.Add(new ContainerGroup
                        {
                            Name = container.Key,
                            Items = new List<string>(container.Value)
                        });
                        allItems.AddRange(container.Value);
                    }
                }
            }

            // Здібності
            AbilitiesList.Clear();
            if (state.Abilities != null)
            {
                foreach (var ability in state.Abilities)
                {
                    AbilitiesList.Add(ability);
                }
            }

            InventoryText = allItems.Any() ? string.Join(", ", allItems) : "порожньо";
        }

        private async Task AnimateDotsAsync()
        {
            int count = 0;
            while (IsTyping)
            {
                AnimatedDots = new string('.', count % 4);
                count++;
                await Task.Delay(400);
            }
            AnimatedDots = "";
        }
    }
}
