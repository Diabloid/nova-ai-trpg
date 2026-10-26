using CommunityToolkit.Mvvm.ComponentModel;
using CommunityToolkit.Mvvm.Input;
using NovaTrpgClient.Models;
using NovaTrpgClient.Services;
using System;
using System.Collections.Generic;
using System.Collections.ObjectModel;
using System.Linq;
using System.Net.Http;
using System.Text;
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
        private string _statusIndicatorText = "Розмірковує над дією";

        [ObservableProperty]
        private string _sessionId = "default";

        [ObservableProperty]
        private string _sessionIdInput = "default";

        [ObservableProperty]
        private string _sessionStatusMessage = "Активна сесія: default";

        [ObservableProperty]
        private PlayerState? _currentPlayerState;

        public ObservableCollection<ChatMessage> ChatMessages { get; } = new();
        public ObservableCollection<Injury> Injuries { get; } = new();
        public ObservableCollection<ItemInfo> WornItems { get; } = new();
        public ObservableCollection<ContainerGroup> ContainersList { get; } = new();
        public ObservableCollection<AbilityInfo> AbilitiesList { get; } = new();

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

        [RelayCommand]
        public async Task SwitchSessionAsync()
        {
            var target = string.IsNullOrWhiteSpace(SessionIdInput) ? "default" : SessionIdInput.Trim();
            SessionId = target;
            SessionIdInput = target;

            ChatMessages.Add(new ChatMessage
            {
                Sender = "Система:",
                Text = $"🔄 Перемикання на ігрову сесію '{SessionId}'...",
                SenderColor = "#10B981"
            });

            StatusIndicatorText = $"Завантаження сесії '{SessionId}'...";
            await LoadInitialStateAsync();
            SessionStatusMessage = $"Активна сесія: {SessionId}";
            IsMenuOpen = false;
        }

        [RelayCommand]
        public async Task RefreshSessionAsync()
        {
            StatusIndicatorText = $"Оновлення даних сесії '{SessionId}'...";
            await LoadInitialStateAsync();
            IsMenuOpen = false;
        }

        [RelayCommand]
        private void ExitGame()
        {
            if (Avalonia.Application.Current?.ApplicationLifetime is Avalonia.Controls.ApplicationLifetimes.IClassicDesktopStyleApplicationLifetime desktop)
            {
                desktop.Shutdown();
            }
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
            StatusIndicatorText = "Розмірковує над дією";
            _ = AnimateDotsAsync();

            ChatMessage? aiMessage = null;

            try
            {
                var requestBody = new ActionRequest
                {
                    RawText = displayAction,
                    Intents = intents,
                    SessionId = SessionId
                };

                var storyBuilder = new StringBuilder();
                bool hasReceivedChunks = false;

                // Справжній стрімінг у реальному часі через Server-Sent Events (SSE)
                await foreach (var sse in _gameApiService.StreamActionAsync(requestBody))
                {
                    switch (sse.Type)
                    {
                        case SseEventType.StoryChunk:
                            if (!string.IsNullOrEmpty(sse.TextChunk))
                            {
                                if (!hasReceivedChunks)
                                {
                                    hasReceivedChunks = true;
                                    aiMessage = new ChatMessage
                                    {
                                        Sender = "Оповідач:",
                                        Text = "",
                                        SenderColor = "#EAB308"
                                    };
                                    ChatMessages.Add(aiMessage);
                                }

                                storyBuilder.Append(sse.TextChunk);
                                if (aiMessage != null)
                                {
                                    aiMessage.Text = storyBuilder.ToString();
                                }
                            }
                            break;

                        case SseEventType.StateAnalyzing:
                            StatusIndicatorText = sse.StatusMessage ?? "Аналізую зміни інвентарю та здоров'я...";
                            break;

                        case SseEventType.Complete:
                            if (sse.FinalResponse != null)
                            {
                                if (sse.FinalResponse.PlayerState != null)
                                {
                                    ApplyPlayerState(sse.FinalResponse.PlayerState);
                                }

                                if (aiMessage != null && !string.IsNullOrWhiteSpace(sse.FinalResponse.Story))
                                {
                                    aiMessage.Text = _textSanitizerService.SanitizeStory(sse.FinalResponse.Story);
                                }
                            }
                            break;

                        case SseEventType.Error:
                            ChatMessages.Add(new ChatMessage
                            {
                                Sender = "Система:",
                                Text = sse.ErrorMessage ?? "Помилка під час генерації ходу.",
                                SenderColor = "#EF4444"
                            });
                            break;
                    }
                }
            }
            catch (Exception ex)
            {
                System.Diagnostics.Debug.WriteLine($"[SendAsync Exception]: {ex}");
                Console.WriteLine($"[SendAsync Exception]: {ex}");

                ChatMessages.Add(new ChatMessage
                {
                    Sender = "Система:",
                    Text = $"Помилка підключення або обробки: {ex.Message}",
                    SenderColor = "#EF4444"
                });
            }
            finally
            {
                IsTyping = false;
                StatusIndicatorText = "Розмірковує над дією";
            }
        }

        private async Task LoadInitialStateAsync()
        {
            try
            {
                var playerState = await _gameApiService.GetPlayerStateAsync(SessionId);

                if (playerState != null)
                {
                    ApplyPlayerState(playerState);
                    SessionStatusMessage = $"Активна сесія: {SessionId}";
                    ChatMessages.Add(new ChatMessage
                    {
                        Sender = "Система:",
                        Text = $"✅ Сесія '{SessionId}' завантажена. Персонаж: {CharacterName} ({LocationText}).",
                        SenderColor = "#10B981"
                    });
                }
                else
                {
                    HpText = "Помилка завантаження";
                    InventoryText = "Сервер повернув порожній стан";
                }
            }
            catch (Exception ex)
            {
                System.Diagnostics.Debug.WriteLine($"[State Load Exception]: {ex}");
                Console.WriteLine($"[State Load Exception]: {ex}");

                HpText = "Помилка завантаження";
                InventoryText = $"Збій підключення/десеріалізації: {ex.Message}";
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
            var allItemNames = new List<string>();

            if (state.StorageAndEquipment?.Worn != null)
            {
                allItemNames.AddRange(state.StorageAndEquipment.Worn.Select(w => w.Name));
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
                            Items = new List<ItemInfo>(container.Value)
                        });

                        allItemNames.AddRange(container.Value.Select(i => i.Name));
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

            InventoryText = allItemNames.Any() ? string.Join(", ", allItemNames) : "порожньо";
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
