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
    public partial class MainWindowViewModel : ObservableObject
    {
        private readonly IGameApiService _gameApiService;
        private readonly IIntentParserService _intentParserService;
        private readonly ITextSanitizerService _textSanitizerService;
        private readonly IClientStorageService _clientStorageService;

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

        // Користувач / Акаунт
        [ObservableProperty]
        private string _userName = "Мандрівник";

        [ObservableProperty]
        private string _userEmail = "cute_metalhead@nova.ai";

        [ObservableProperty]
        private string _subscriptionStatus = "Без підписки";

        // Дворівнева ієрархія: Персонажі -> Кампанії
        public ObservableCollection<CharacterSummary> Characters { get; } = new();
        public ObservableCollection<CampaignSummary> Campaigns { get; } = new();

        [ObservableProperty]
        private CharacterSummary? _selectedCharacter;

        [ObservableProperty]
        private CampaignSummary? _selectedCampaign;

        // Випадаючі інлайн-шторки меню (Акаунт, Вибір героя)
        [ObservableProperty]
        private bool _isAccountMenuOpen = false;

        [ObservableProperty]
        private bool _isHeroSelectorOpen = false;

        // Повноекранний майстер створення персонажа з AI (Character Wizard)
        [ObservableProperty]
        private bool _isCharacterCreationActive = false;

        [ObservableProperty]
        private string _wizardInput = "";

        [ObservableProperty]
        private bool _isWizardTyping = false;

        [ObservableProperty]
        private string _wizardStatusText = "Творець Долі слухає...";

        public ObservableCollection<ChatMessage> WizardMessages { get; } = new();

        [ObservableProperty]
        private string _wizardCharName = "";

        [ObservableProperty]
        private string _wizardCharBackground = "";

        [ObservableProperty]
        private string _wizardCharAppearance = "";

        // Модальні вікна (Створення/редагування персонажа, створення кампанії)
        [ObservableProperty]
        private bool _isCharacterModalOpen = false;

        [ObservableProperty]
        private bool _isEditingCharacter = false;

        [ObservableProperty]
        private string? _editingCharacterId;

        [ObservableProperty]
        private string _modalCharacterName = "";

        [ObservableProperty]
        private string _modalCharacterBackground = "";

        [ObservableProperty]
        private string _modalCharacterAppearance = "";

        [ObservableProperty]
        private bool _isNewCampaignModalOpen = false;

        [ObservableProperty]
        private string _newCampaignTitle = "";

        [ObservableProperty]
        private bool _isConfirmModalOpen = false;

        [ObservableProperty]
        private string _confirmModalTitle = "";

        [ObservableProperty]
        private string _confirmModalMessage = "";

        private Func<Task>? _pendingConfirmAction;

        // Колекції інтерфейсу
        public ObservableCollection<ChatMessage> ChatMessages { get; } = new();
        public ObservableCollection<Injury> Injuries { get; } = new();
        public ObservableCollection<ItemInfo> WornItems { get; } = new();
        public ObservableCollection<ContainerGroup> ContainersList { get; } = new();
        public ObservableCollection<AbilityInfo> AbilitiesList { get; } = new();

        // Основний конструктор із Dependency Injection
        public MainWindowViewModel(
            IGameApiService gameApiService,
            IIntentParserService intentParserService,
            ITextSanitizerService textSanitizerService,
            IClientStorageService clientStorageService)
        {
            _gameApiService = gameApiService ?? throw new ArgumentNullException(nameof(gameApiService));
            _intentParserService = intentParserService ?? throw new ArgumentNullException(nameof(intentParserService));
            _textSanitizerService = textSanitizerService ?? throw new ArgumentNullException(nameof(textSanitizerService));
            _clientStorageService = clientStorageService ?? throw new ArgumentNullException(nameof(clientStorageService));

            var settings = _clientStorageService.GetSettings();
            UserName = settings.UserName;
            UserEmail = settings.UserEmail;
            SubscriptionStatus = settings.SubscriptionStatus;

            _ = InitializeHierarchyAsync();
        }

        // Конструктор за замовчуванням (для Avalonia XAML Design-Time Previewer)
        public MainWindowViewModel()
            : this(
                new GameApiService(new HttpClient { BaseAddress = new Uri("http://127.0.0.1:8000/") }),
                new IntentParserService(),
                new TextSanitizerService(),
                new ClientStorageService())
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

        // --- ІНІЦІАЛІЗАЦІЯ ДВОРІВНЕВОГО МЕНЮ (ПЕРСОНАЖІ ТА КАМПАНІЇ) ---
        public async Task InitializeHierarchyAsync()
        {
            try
            {
                var chars = await _gameApiService.GetCharactersAsync();
                Characters.Clear();

                if (chars != null && chars.Count > 0)
                {
                    foreach (var c in chars)
                    {
                        Characters.Add(c);
                    }

                    // Вибираємо останнього або першого персонажа
                    var targetChar = Characters.FirstOrDefault(c => c.CharId == _clientStorageService.GetSettings().LastSelectedCharId)
                                     ?? Characters.First();

                    await SelectCharacterAsync(targetChar);
                }
                else
                {
                    // Fallback на сесію за замовчуванням
                    await LoadInitialStateAsync();
                }
            }
            catch (Exception ex)
            {
                System.Diagnostics.Debug.WriteLine($"[InitializeHierarchyAsync error]: {ex}");
                await LoadInitialStateAsync();
            }
        }

        [RelayCommand]
        public async Task SelectCharacterAsync(CharacterSummary? character)
        {
            if (character == null) return;
            SelectedCharacter = character;

            var settings = _clientStorageService.GetSettings();
            settings.LastSelectedCharId = character.CharId;
            _clientStorageService.SaveSettings();

            await LoadCampaignsForCharacterAsync(character.CharId, autoSelectFirstCampaign: true);
        }

        [RelayCommand]
        public void ToggleAccountMenu()
        {
            IsAccountMenuOpen = !IsAccountMenuOpen;
        }

        [RelayCommand]
        public void ToggleHeroSelector()
        {
            IsHeroSelectorOpen = !IsHeroSelectorOpen;
        }

        [RelayCommand]
        public void OpenSettings()
        {
            IsAccountMenuOpen = false;
            ChatMessages.Add(new ChatMessage
            {
                Sender = "Система:",
                Text = "⚙ Меню налаштувань у розробці.",
                SenderColor = "#10B981"
            });
        }

        [RelayCommand]
        public async Task SelectCharacterWithoutChatAsync(CharacterSummary? character)
        {
            if (character == null) return;
            SelectedCharacter = character;
            IsHeroSelectorOpen = false;

            var settings = _clientStorageService.GetSettings();
            settings.LastSelectedCharId = character.CharId;
            _clientStorageService.SaveSettings();

            // Завантажуємо кампанії героя, АЛЕ НЕ перемикаємося примусово в чат
            await LoadCampaignsForCharacterAsync(character.CharId, autoSelectFirstCampaign: false);
        }

        public async Task LoadCampaignsForCharacterAsync(string charId, bool autoSelectFirstCampaign = true)
        {
            try
            {
                var camps = await _gameApiService.GetCampaignsAsync(charId);
                Campaigns.Clear();

                if (camps != null && camps.Count > 0)
                {
                    // Сортуємо: закріплені нагорі, далі за датою
                    var sorted = camps.OrderByDescending(c => c.IsPinned).ThenByDescending(c => c.LastPlayed ?? c.CreatedAt).ToList();
                    foreach (var camp in sorted)
                    {
                        Campaigns.Add(camp);
                    }

                    if (autoSelectFirstCampaign)
                    {
                        var targetCamp = Campaigns.FirstOrDefault(c => c.CampaignId == _clientStorageService.GetSettings().LastSelectedCampaignId)
                                         ?? Campaigns.First();

                        await SelectCampaignAsync(targetCamp);
                    }
                    else if (SelectedCampaign == null || !Campaigns.Any(c => c.CampaignId == SelectedCampaign.CampaignId))
                    {
                        // Якщо поточної обраної кампанії немає в списку нового героя
                        SelectedCampaign = Campaigns.FirstOrDefault();
                    }
                }
                else
                {
                    // Якщо у персонажа ще немає кампаній
                    SelectedCampaign = null;
                }
            }
            catch (Exception ex)
            {
                System.Diagnostics.Debug.WriteLine($"[LoadCampaigns error]: {ex.Message}");
            }
        }

        [RelayCommand]
        public async Task SelectCampaignAsync(CampaignSummary? campaign)
        {
            if (campaign == null) return;

            SelectedCampaign = campaign;
            SessionId = campaign.CampaignId;
            SessionIdInput = campaign.CampaignId;

            var settings = _clientStorageService.GetSettings();
            settings.LastSelectedCampaignId = campaign.CampaignId;
            _clientStorageService.SaveSettings();

            StatusIndicatorText = $"Завантаження кампанії '{campaign.Title}'...";

            // 1. Завантажуємо повну історію чату
            await LoadCampaignHistoryAsync(campaign.CampaignId);

            // 2. Завантажуємо актуальний стан гравця
            await LoadInitialStateAsync();

            SessionStatusMessage = $"Кампанія: {campaign.Title}";
            IsMenuOpen = false;
        }

        private async Task LoadCampaignHistoryAsync(string campaignId)
        {
            try
            {
                var history = await _gameApiService.GetCampaignHistoryAsync(campaignId);
                ChatMessages.Clear();

                if (history != null && history.Count > 0)
                {
                    foreach (var msg in history)
                    {
                        var senderName = msg.Role.ToLower() switch
                        {
                            "player" => "Ти:",
                            "narrator" => "Оповідач:",
                            _ => "Система:"
                        };

                        var senderColor = msg.Role.ToLower() switch
                        {
                            "player" => "#60A5FA",
                            "narrator" => "#EAB308",
                            _ => "#10B981"
                        };

                        ChatMessages.Add(new ChatMessage
                        {
                            Sender = senderName,
                            Text = msg.Text,
                            SenderColor = senderColor
                        });
                    }
                }
            }
            catch (Exception ex)
            {
                System.Diagnostics.Debug.WriteLine($"[LoadCampaignHistory error]: {ex.Message}");
            }
        }

        // --- ДІЇ З КАМПАНІЯМИ ---
        [RelayCommand]
        public void OpenNewCampaignModal()
        {
            var charName = SelectedCharacter?.Name ?? Characters.FirstOrDefault()?.Name ?? "Герой";
            NewCampaignTitle = $"Пригода {charName} #{Campaigns.Count + 1}";
            IsNewCampaignModalOpen = true;
        }

        [RelayCommand]
        public void CloseNewCampaignModal()
        {
            IsNewCampaignModalOpen = false;
        }

        [RelayCommand]
        public async Task ConfirmCreateCampaignAsync()
        {
            var title = string.IsNullOrWhiteSpace(NewCampaignTitle)
                ? $"Пригода {(SelectedCharacter?.Name ?? "Героя")} #{Campaigns.Count + 1}"
                : NewCampaignTitle.Trim();

            var charId = SelectedCharacter?.CharId ?? Characters.FirstOrDefault()?.CharId;
            if (string.IsNullOrEmpty(charId))
            {
                var chars = await _gameApiService.GetCharactersAsync();
                if (chars != null && chars.Count > 0)
                {
                    SelectedCharacter = chars[0];
                    charId = chars[0].CharId;
                }
            }

            if (string.IsNullOrEmpty(charId))
            {
                ChatMessages.Add(new ChatMessage
                {
                    Sender = "Система:",
                    Text = "⚠️ Спочатку створіть або оберіть героя для запуску нової кампанії.",
                    SenderColor = "#EF4444"
                });
                IsNewCampaignModalOpen = false;
                return;
            }

            IsNewCampaignModalOpen = false;

            ChatMessages.Add(new ChatMessage
            {
                Sender = "Система:",
                Text = $"⏳ Створення нової кампанії '{title}' для героя '{SelectedCharacter?.Name}'...",
                SenderColor = "#10B981"
            });

            var newCamp = await _gameApiService.CreateCampaignAsync(charId, title);
            if (newCamp != null)
            {
                await LoadCampaignsForCharacterAsync(charId, autoSelectFirstCampaign: false);
                var created = Campaigns.FirstOrDefault(c => c.CampaignId == newCamp.CampaignId) ?? newCamp;
                await SelectCampaignAsync(created);
            }
            else
            {
                ChatMessages.Add(new ChatMessage
                {
                    Sender = "Система:",
                    Text = "⚠️ Не вдалося створити кампанію на сервері.",
                    SenderColor = "#EF4444"
                });
            }
        }

        [RelayCommand]
        public async Task TogglePinCampaignAsync(CampaignSummary? campaign)
        {
            if (campaign == null) return;

            var newPinState = !campaign.IsPinned;
            campaign.IsPinned = newPinState;

            var result = await _gameApiService.PinCampaignAsync(campaign.CampaignId, newPinState);
            if (SelectedCharacter != null)
            {
                await LoadCampaignsForCharacterAsync(SelectedCharacter.CharId, autoSelectFirstCampaign: false);
            }
        }

        [RelayCommand]
        public void RequestDeleteCampaign(CampaignSummary? campaign)
        {
            if (campaign == null) return;

            ConfirmModalTitle = "Видалити кампанію?";
            ConfirmModalMessage = $"Ви впевнені, що хочете безповоротно видалити кампанію «{campaign.Title}»? Уся історія діалогу буде втрачена.";
            _pendingConfirmAction = async () =>
            {
                var success = await _gameApiService.DeleteCampaignAsync(campaign.CampaignId);
                if (success && SelectedCharacter != null)
                {
                    await LoadCampaignsForCharacterAsync(SelectedCharacter.CharId);
                }
            };
            IsConfirmModalOpen = true;
        }

        // --- ДІЇ З ПЕРСОНАЖАМИ (BLUEPRINTS) ТА AI СТВОРЕННЯ ---
        [RelayCommand]
        public void OpenCreateCharacterScreen()
        {
            IsCharacterCreationActive = true;
            IsMenuOpen = false;
            WizardMessages.Clear();
            WizardCharName = "";
            WizardCharBackground = "";
            WizardCharAppearance = "";
            WizardInput = "";
            WizardStatusText = "Творець Долі слухає...";

            // Стартове привітання Творця Долі
            WizardMessages.Add(new ChatMessage
            {
                Sender = "Творець Долі:",
                Text = "Вітаю у чертогах буття, Мандрівнику. Я — Творець Долі. Розкажи, ким ти бачиш свого героя? Яке його ім'я, фах або ремесло? Які таємниці чи випробування несе його минуле?",
                SenderColor = "#C084FC"
            });
        }

        [RelayCommand]
        public void CancelCharacterCreation()
        {
            IsCharacterCreationActive = false;
        }

        [RelayCommand]
        public async Task SendWizardMessageAsync()
        {
            if (string.IsNullOrWhiteSpace(WizardInput) || IsWizardTyping) return;

            var userText = WizardInput.Trim();
            WizardInput = "";

            WizardMessages.Add(new ChatMessage
            {
                Sender = "Ти:",
                Text = userText,
                SenderColor = "#60A5FA"
            });

            IsWizardTyping = true;
            WizardStatusText = "Творець Долі розмірковує...";

            try
            {
                var history = WizardMessages.Select(m => $"{m.Sender} {m.Text}").ToList();
                var reply = await _gameApiService.SendCharacterDialogAsync(userText, history);

                if (string.IsNullOrWhiteSpace(reply))
                {
                    reply = "Цікавий образ. Нитки долі починають сплітатися. Чи має твій персонаж особливі прикмети, спорядження або магічний дар, про який варто знати?";
                }

                WizardMessages.Add(new ChatMessage
                {
                    Sender = "Творець Долі:",
                    Text = reply,
                    SenderColor = "#C084FC"
                });

                // Базове автовизначення імені якщо ще не вказано
                if (string.IsNullOrWhiteSpace(WizardCharName))
                {
                    var words = userText.Split(new[] { ' ', ',', '.', '!' }, StringSplitOptions.RemoveEmptyEntries);
                    if (words.Length > 0 && words[0].Length >= 3 && char.IsUpper(words[0][0]))
                    {
                        WizardCharName = words[0];
                    }
                }
                if (string.IsNullOrWhiteSpace(WizardCharBackground))
                {
                    WizardCharBackground = userText;
                }
            }
            catch (Exception ex)
            {
                WizardMessages.Add(new ChatMessage
                {
                    Sender = "Система:",
                    Text = $"⚠️ Помилка зв'язку з Творцем Долі: {ex.Message}",
                    SenderColor = "#EF4444"
                });
            }
            finally
            {
                IsWizardTyping = false;
                WizardStatusText = "Творець Долі чекає на відповідь";
            }
        }

        [RelayCommand]
        public async Task FinalizeAndStartGameAsync()
        {
            if (WizardMessages.Count == 0 || IsWizardTyping) return;

            IsWizardTyping = true;
            WizardStatusText = "Генерація фінального листа персонажа...";

            try
            {
                var summary = string.Join("\n", WizardMessages.Select(m => $"{m.Sender} {m.Text}"));
                var playerState = await _gameApiService.FinalizeCharacterAsync(summary);

                var finalName = !string.IsNullOrWhiteSpace(WizardCharName)
                    ? WizardCharName.Trim()
                    : playerState?.Meta?.Name ?? "Новий Герой";

                var finalBg = !string.IsNullOrWhiteSpace(WizardCharBackground)
                    ? WizardCharBackground.Trim()
                    : playerState?.Meta?.Background ?? "Герой, народжений у діалозі з Творцем Долі";

                var finalApp = !string.IsNullOrWhiteSpace(WizardCharAppearance)
                    ? WizardCharAppearance.Trim()
                    : playerState?.Meta?.Appearance ?? "Мандрівне вбрання";

                if (playerState == null || playerState.Meta == null)
                {
                    playerState = new PlayerState
                    {
                        Meta = new PlayerMeta
                        {
                            Name = finalName,
                            Background = finalBg,
                            Appearance = finalApp
                        }
                    };
                }
                else
                {
                    playerState.Meta.Name = finalName;
                    playerState.Meta.Background = finalBg;
                    playerState.Meta.Appearance = finalApp;
                }

                // Зберігаємо заготовку героя
                var createdSummary = await _gameApiService.CreateCharacterAsync(playerState);
                if (createdSummary != null)
                {
                    await InitializeHierarchyAsync();

                    var selected = Characters.FirstOrDefault(c => c.CharId == createdSummary.CharId);
                    if (selected != null)
                    {
                        await SelectCharacterAsync(selected);
                    }

                    // Автоматично створюємо першу кампанію зі вступним постом
                    var firstCamp = await _gameApiService.CreateCampaignAsync(createdSummary.CharId, $"Пригода {createdSummary.Name} #1");
                    if (firstCamp != null)
                    {
                        await LoadCampaignsForCharacterAsync(createdSummary.CharId, autoSelectFirstCampaign: false);
                        var campObj = Campaigns.FirstOrDefault(c => c.CampaignId == firstCamp.CampaignId) ?? firstCamp;
                        await SelectCampaignAsync(campObj);
                    }

                    IsCharacterCreationActive = false;
                }
                else
                {
                    WizardMessages.Add(new ChatMessage
                    {
                        Sender = "Система:",
                        Text = "⚠️ Не вдалося зберегти персонажа на сервері.",
                        SenderColor = "#EF4444"
                    });
                }
            }
            catch (Exception ex)
            {
                WizardMessages.Add(new ChatMessage
                {
                    Sender = "Система:",
                    Text = $"⚠️ Помилка створення героя: {ex.Message}",
                    SenderColor = "#EF4444"
                });
            }
            finally
            {
                IsWizardTyping = false;
            }
        }

        // Швидке редагування існуючого героя
        [RelayCommand]
        public void OpenCreateCharacterModal()
        {
            OpenCreateCharacterScreen();
        }

        [RelayCommand]
        public async Task OpenEditCharacterModalAsync(CharacterSummary? character)
        {
            if (character == null) return;

            IsEditingCharacter = true;
            EditingCharacterId = character.CharId;
            ModalCharacterName = character.Name;
            ModalCharacterBackground = character.Background;
            ModalCharacterAppearance = character.Appearance;

            // Спробуємо підтягнути детальний опис якщо є
            var details = await _gameApiService.GetCharacterDetailsAsync(character.CharId);
            if (details?.Meta != null)
            {
                ModalCharacterName = details.Meta.Name;
                ModalCharacterBackground = details.Meta.Background;
                ModalCharacterAppearance = details.Meta.Appearance;
            }

            IsCharacterModalOpen = true;
        }

        [RelayCommand]
        public void CloseCharacterModal()
        {
            IsCharacterModalOpen = false;
        }

        [RelayCommand]
        public async Task SaveCharacterModalAsync()
        {
            if (string.IsNullOrWhiteSpace(ModalCharacterName)) return;

            var name = ModalCharacterName.Trim();
            var bg = ModalCharacterBackground.Trim();
            var app = ModalCharacterAppearance.Trim();

            var playerState = new PlayerState
            {
                Meta = new PlayerMeta
                {
                    Name = name,
                    Background = bg,
                    Appearance = app,
                    Location = "Стартова локація"
                },
                AnatomyAndHealth = new AnatomyAndHealth
                {
                    OverallState = "Стан стабільний"
                }
            };

            IsCharacterModalOpen = false;

            if (IsEditingCharacter && !string.IsNullOrEmpty(EditingCharacterId))
            {
                await _gameApiService.UpdateCharacterAsync(EditingCharacterId, playerState);
                await InitializeHierarchyAsync();
            }
            else
            {
                var created = await _gameApiService.CreateCharacterAsync(playerState);
                await InitializeHierarchyAsync();

                if (created != null)
                {
                    var found = Characters.FirstOrDefault(c => c.CharId == created.CharId);
                    if (found != null)
                    {
                        await SelectCharacterAsync(found);
                        // Пропонуємо створити першу кампанію
                        OpenNewCampaignModal();
                    }
                }
            }
        }

        [RelayCommand]
        public void RequestDeleteCharacter(CharacterSummary? character)
        {
            if (character == null) return;

            ConfirmModalTitle = "Видалити персонажа?";
            ConfirmModalMessage = $"Ви впевнені, що хочете видалити героя «{character.Name}» та всі пов'язані з ним кампанії?";
            _pendingConfirmAction = async () =>
            {
                var success = await _gameApiService.DeleteCharacterAsync(character.CharId);
                if (success)
                {
                    await InitializeHierarchyAsync();
                }
            };
            IsConfirmModalOpen = true;
        }

        [RelayCommand]
        public async Task ConfirmModalActionAsync()
        {
            IsConfirmModalOpen = false;
            if (_pendingConfirmAction != null)
            {
                await _pendingConfirmAction.Invoke();
                _pendingConfirmAction = null;
            }
        }

        [RelayCommand]
        public void CancelConfirmModal()
        {
            IsConfirmModalOpen = false;
            _pendingConfirmAction = null;
        }

        // --- ЛОГАУТ ТА ЗАГАЛЬНІ СИСТЕМНІ КОМАНДИ ---
        [RelayCommand]
        public void Logout()
        {
            IsAccountMenuOpen = false;
            ChatMessages.Clear();
            ChatMessages.Add(new ChatMessage
            {
                Sender = "Система:",
                Text = "🚪 Вихід з акаунту здійснено. Дані сесії скинуто.",
                SenderColor = "#10B981"
            });
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

            // Контейнери (Containers) з пам'яттю розгортання
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
                        var group = new ContainerGroup
                        {
                            Name = container.Key,
                            Items = new List<ItemInfo>(container.Value),
                            IsExpanded = _clientStorageService.IsContainerExpanded(container.Key)
                        };

                        group.OnExpandedChanged = (cName, isExp) => _clientStorageService.SetContainerExpanded(cName, isExp);
                        ContainersList.Add(group);

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
