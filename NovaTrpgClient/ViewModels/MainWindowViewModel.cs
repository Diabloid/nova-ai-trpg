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
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;

namespace NovaTrpgClient.ViewModels
{
    public partial class MainWindowViewModel : ObservableObject
    {
        private readonly IGameApiService _gameApiService;
        private readonly IIntentParserService _intentParserService;
        private readonly ITextSanitizerService _textSanitizerService;
        private readonly IClientStorageService _clientStorageService;
        private readonly IAudioRecordingService _audioRecordingService;

        [ObservableProperty]
        private bool _isRecordingVoice = false;

        [ObservableProperty]
        private bool _isTranscribingVoice = false;

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

        [ObservableProperty]
        private string _wizardAnimatedDots = "";

        public ObservableCollection<ChatMessage> WizardMessages { get; } = new();

        [ObservableProperty]
        private string _wizardCharName = "";

        [ObservableProperty]
        private string _wizardCharTitles = "";

        [ObservableProperty]
        private string _wizardCharAge = "";

        [ObservableProperty]
        private string _wizardCharBackground = "";

        [ObservableProperty]
        private string _wizardCharAppearance = "";

        [ObservableProperty]
        private string _wizardPhysique = "";

        [ObservableProperty]
        private string _wizardHeight = "";

        [ObservableProperty]
        private string _wizardEyes = "";

        [ObservableProperty]
        private string _wizardHair = "";

        [ObservableProperty]
        private string _wizardRaceTraits = "";

        [ObservableProperty]
        private string _wizardBiography = "";

        [ObservableProperty]
        private bool _isWizardAppearanceDetailsExpanded = false;

        [ObservableProperty]
        [NotifyPropertyChangedFor(nameof(SyncDraftButtonText))]
        private bool _isSyncingDraft = false;

        public string SyncDraftButtonText => IsSyncingDraft ? "Синхронізація..." : "Синхронізувати";

        [ObservableProperty]
        [NotifyPropertyChangedFor(nameof(HasWizardLocation))]
        private string _wizardCharLocation = "";
        public bool HasWizardLocation => !string.IsNullOrWhiteSpace(WizardCharLocation);

        [ObservableProperty]
        [NotifyPropertyChangedFor(nameof(HasWizardHealth))]
        private string _wizardCharHealth = "";
        public bool HasWizardHealth => !string.IsNullOrWhiteSpace(WizardCharHealth);

        public ObservableCollection<Injury> WizardInjuries { get; } = new();
        public ObservableCollection<AbilityInfo> WizardAbilities { get; } = new();
        public ObservableCollection<ItemInfo> WizardEquipment { get; } = new();
        public ObservableCollection<DynamicCustomBlock> WizardCustomBlocks { get; } = new();

        public bool HasWizardCustomBlocks => WizardCustomBlocks.Count > 0;
        public bool HasWizardInjuries => WizardInjuries.Count > 0;

        // Поля для повного відображення _template.json у висувній шторці персонажа
        [ObservableProperty]
        [NotifyPropertyChangedFor(nameof(HasDrawerDetails))]
        private string _characterTitles = "";

        [ObservableProperty]
        [NotifyPropertyChangedFor(nameof(HasDrawerDetails))]
        private string _characterAge = "";

        [ObservableProperty]
        [NotifyPropertyChangedFor(nameof(HasDrawerDetails))]
        private string _characterBiography = "";

        [ObservableProperty]
        private string _characterPhysique = "";

        [ObservableProperty]
        private string _characterHeight = "";

        [ObservableProperty]
        private string _characterEyes = "";

        [ObservableProperty]
        private string _characterHair = "";

        [ObservableProperty]
        private string _characterRaceTraits = "";

        [ObservableProperty]
        private bool _isDrawerDetailsExpanded = false;

        public ObservableCollection<DynamicCustomBlock> CharacterCustomBlocks { get; } = new();

        public bool HasDrawerDetails => !string.IsNullOrWhiteSpace(CharacterBiography) ||
                                       !string.IsNullOrWhiteSpace(CharacterTitles) ||
                                       !string.IsNullOrWhiteSpace(CharacterAge) ||
                                       !string.IsNullOrWhiteSpace(CharacterPhysique) ||
                                       !string.IsNullOrWhiteSpace(CharacterRaceTraits) ||
                                       CharacterCustomBlocks.Count > 0;

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

        [ObservableProperty]
        private string _confirmModalConfirmButtonText = "Підтвердити";

        [ObservableProperty]
        private string _confirmModalCancelButtonText = "Скасувати";

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
            IClientStorageService clientStorageService,
            IAudioRecordingService? audioRecordingService = null)
        {
            _gameApiService = gameApiService ?? throw new ArgumentNullException(nameof(gameApiService));
            _intentParserService = intentParserService ?? throw new ArgumentNullException(nameof(intentParserService));
            _textSanitizerService = textSanitizerService ?? throw new ArgumentNullException(nameof(textSanitizerService));
            _clientStorageService = clientStorageService ?? throw new ArgumentNullException(nameof(clientStorageService));
            _audioRecordingService = audioRecordingService ?? new AudioRecordingService();

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
                new ClientStorageService(),
                new AudioRecordingService())
        {
        }

        public bool HasUserInput => !string.IsNullOrWhiteSpace(UserInput);
        public bool HasWizardInput => !string.IsNullOrWhiteSpace(WizardInput);

        public bool ShowSendIcon => HasUserInput && !IsRecordingVoice;
        public bool ShowMicIcon => !HasUserInput && !IsRecordingVoice;

        public bool ShowWizardSendIcon => HasWizardInput && !IsRecordingVoice;
        public bool ShowWizardMicIcon => !HasWizardInput && !IsRecordingVoice;

        public bool CanSendOrRecord => !IsTyping && !IsTranscribingVoice;
        public bool CanWizardSendOrRecord => !IsWizardTyping && !IsTranscribingVoice;

        public string SendButtonToolTip => IsRecordingVoice
            ? "Зупинити запис та розпізнати дію (клік)"
            : (HasUserInput ? "Відправити дію (Enter)" : "Голосове введення дії (мікрофон)");

        public string WizardSendButtonToolTip => IsRecordingVoice
            ? "Зупинити запис та розпізнати відповідь (клік)"
            : (HasWizardInput ? "Відправити Творцю Долі" : "Голосове введення відповіді (мікрофон)");

        partial void OnUserInputChanged(string value)
        {
            OnPropertyChanged(nameof(HasUserInput));
            OnPropertyChanged(nameof(ShowSendIcon));
            OnPropertyChanged(nameof(ShowMicIcon));
            OnPropertyChanged(nameof(SendButtonToolTip));
        }

        partial void OnWizardInputChanged(string value)
        {
            OnPropertyChanged(nameof(HasWizardInput));
            OnPropertyChanged(nameof(ShowWizardSendIcon));
            OnPropertyChanged(nameof(ShowWizardMicIcon));
            OnPropertyChanged(nameof(WizardSendButtonToolTip));
        }

        partial void OnIsRecordingVoiceChanged(bool value)
        {
            OnPropertyChanged(nameof(ShowSendIcon));
            OnPropertyChanged(nameof(ShowMicIcon));
            OnPropertyChanged(nameof(ShowWizardSendIcon));
            OnPropertyChanged(nameof(ShowWizardMicIcon));
            OnPropertyChanged(nameof(SendButtonToolTip));
            OnPropertyChanged(nameof(WizardSendButtonToolTip));
            OnPropertyChanged(nameof(CanSendOrRecord));
            OnPropertyChanged(nameof(CanWizardSendOrRecord));
            SendOrRecordCommand.NotifyCanExecuteChanged();
            SendOrRecordWizardCommand.NotifyCanExecuteChanged();
        }

        partial void OnIsTranscribingVoiceChanged(bool value)
        {
            OnPropertyChanged(nameof(CanSendOrRecord));
            OnPropertyChanged(nameof(CanWizardSendOrRecord));
            SendOrRecordCommand.NotifyCanExecuteChanged();
            SendOrRecordWizardCommand.NotifyCanExecuteChanged();
        }

        private bool CanSend => !IsTyping;

        partial void OnIsTypingChanged(bool value)
        {
            SendCommand.NotifyCanExecuteChanged();
            OnPropertyChanged(nameof(CanSendOrRecord));
            SendOrRecordCommand.NotifyCanExecuteChanged();
        }

        partial void OnIsWizardTypingChanged(bool value)
        {
            SendWizardMessageCommand.NotifyCanExecuteChanged();
            OnPropertyChanged(nameof(CanWizardSendOrRecord));
            SendOrRecordWizardCommand.NotifyCanExecuteChanged();
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

            if (IsCharacterCreationActive)
            {
                PromptUnfinishedWizardExit(async () =>
                {
                    IsCharacterCreationActive = false;
                    await ExecuteSelectCharacterWithoutChatAsync(character);
                });
                return;
            }

            await ExecuteSelectCharacterWithoutChatAsync(character);
        }

        private async Task ExecuteSelectCharacterWithoutChatAsync(CharacterSummary character)
        {
            SelectedCharacter = character;
            IsHeroSelectorOpen = false;

            var settings = _clientStorageService.GetSettings();
            settings.LastSelectedCharId = character.CharId;
            _clientStorageService.SaveSettings();

            // Завантажуємо кампанії героя, АЛЕ НЕ перемикаємося примусово в чат
            await LoadCampaignsForCharacterAsync(character.CharId, autoSelectFirstCampaign: false);
        }

        public void ReorderCampaigns(bool force = false)
        {
            var currentSelectedId = SelectedCampaign?.CampaignId;
            var sorted = Campaigns
                .OrderByDescending(c => c.IsPinned)
                .ThenByDescending(c => DateTime.TryParse(c.LastPlayed, out var lp) ? lp : (DateTime.TryParse(c.CreatedAt, out var ca) ? ca : DateTime.MinValue))
                .ToList();

            bool orderChanged = force;
            if (!orderChanged)
            {
                for (int i = 0; i < sorted.Count; i++)
                {
                    if (Campaigns[i].CampaignId != sorted[i].CampaignId)
                    {
                        orderChanged = true;
                        break;
                    }
                }
            }

            if (orderChanged)
            {
                Campaigns.Clear();
                foreach (var c in sorted)
                {
                    Campaigns.Add(c);
                }
                if (currentSelectedId != null)
                {
                    SelectedCampaign = Campaigns.FirstOrDefault(c => c.CampaignId == currentSelectedId);
                }
            }
        }

        public async Task LoadCampaignsForCharacterAsync(string charId, bool autoSelectFirstCampaign = true)
        {
            try
            {
                var camps = await _gameApiService.GetCampaignsAsync(charId);
                Campaigns.Clear();

                if (camps != null && camps.Count > 0)
                {
                    // Сортуємо: закріплені нагорі, далі за часом останнього повідомлення/гри
                    var sorted = camps
                        .OrderByDescending(c => c.IsPinned)
                        .ThenByDescending(c => DateTime.TryParse(c.LastPlayed, out var lp) ? lp : (DateTime.TryParse(c.CreatedAt, out var ca) ? ca : DateTime.MinValue))
                        .ToList();
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

            if (IsCharacterCreationActive)
            {
                PromptUnfinishedWizardExit(async () =>
                {
                    IsCharacterCreationActive = false;
                    await ExecuteSelectCampaignAsync(campaign);
                });
                return;
            }

            await ExecuteSelectCampaignAsync(campaign);
        }

        private async Task ExecuteSelectCampaignAsync(CampaignSummary campaign)
        {
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

        private void PromptUnfinishedWizardExit(Func<Task> onConfirm)
        {
            ConfirmModalTitle = "Незбережений персонаж";
            ConfirmModalMessage = "У вас є незбережений персонаж. Вийти без збереження?";
            ConfirmModalConfirmButtonText = "Так";
            ConfirmModalCancelButtonText = "Ні";
            _pendingConfirmAction = onConfirm;
            IsConfirmModalOpen = true;
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

                        var timeStr = msg.Timestamp != null && DateTime.TryParse(msg.Timestamp, out var dt)
                            ? dt.ToString("HH:mm")
                            : DateTime.Now.ToString("HH:mm");

                        var displayText = msg.Role.ToLower() == "player"
                            ? _intentParserService.CleanDisplayAction(msg.Text)
                            : msg.Text;

                        ChatMessages.Add(new ChatMessage
                        {
                            Sender = senderName,
                            Text = displayText,
                            SenderColor = senderColor,
                            TimeText = timeStr,
                            IsPlayer = msg.Role.ToLower() == "player"
                        });
                    }
                    UpdateRollbackAvailability();
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
            if (IsCharacterCreationActive)
            {
                PromptUnfinishedWizardExit(() =>
                {
                    IsCharacterCreationActive = false;
                    var name = SelectedCharacter?.Name ?? Characters.FirstOrDefault()?.Name ?? "Герой";
                    NewCampaignTitle = $"Пригода {name} #{Campaigns.Count + 1}";
                    IsNewCampaignModalOpen = true;
                    return Task.CompletedTask;
                });
                return;
            }

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
            if (result != null)
            {
                campaign.IsPinned = result.IsPinned;
            }
            ReorderCampaigns(force: true);
        }

        [RelayCommand]
        public void RequestDeleteCampaign(CampaignSummary? campaign)
        {
            if (campaign == null) return;

            ConfirmModalTitle = "Видалити кампанію?";
            ConfirmModalMessage = $"Ви впевнені, що хочете безповоротно видалити кампанію «{campaign.Title}»? Уся історія діалогу буде втрачена.";
            ConfirmModalConfirmButtonText = "Так";
            ConfirmModalCancelButtonText = "Ні";
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
            if (IsCharacterCreationActive)
            {
                PromptUnfinishedWizardExit(() =>
                {
                    ResetWizardState();
                    return Task.CompletedTask;
                });
                return;
            }
            ResetWizardState();
        }

        private void ResetWizardState()
        {
            IsCharacterCreationActive = true;
            IsMenuOpen = false;
            WizardMessages.Clear();
            WizardCharName = "";
            WizardCharTitles = "";
            WizardCharAge = "";
            WizardCharBackground = "";
            WizardCharAppearance = "";
            WizardPhysique = "";
            WizardHeight = "";
            WizardEyes = "";
            WizardHair = "";
            WizardRaceTraits = "";
            WizardBiography = "";
            WizardCharLocation = "";
            WizardCharHealth = "";
            IsWizardAppearanceDetailsExpanded = false;
            IsSyncingDraft = false;
            WizardInjuries.Clear();
            WizardAbilities.Clear();
            WizardEquipment.Clear();
            WizardCustomBlocks.Clear();
            _lastWizardDraftState = null;
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
        public void ToggleWizardAppearanceDetails()
        {
            IsWizardAppearanceDetailsExpanded = !IsWizardAppearanceDetailsExpanded;
        }

        [RelayCommand]
        public void ToggleDrawerDetails()
        {
            IsDrawerDetailsExpanded = !IsDrawerDetailsExpanded;
        }

        private PlayerState? _lastWizardDraftState;
        private int _wizardWornItemsCount;

        public void UpdateLivePreviewFromDraft(PlayerState draft)
        {
            if (draft == null) return;
            _lastWizardDraftState = draft;
            _wizardWornItemsCount = draft.StorageAndEquipment?.Worn?.Count ?? 0;

            if (!string.IsNullOrWhiteSpace(draft.Meta?.Name))
                WizardCharName = draft.Meta.Name;

            if (!string.IsNullOrWhiteSpace(draft.Meta?.Titles))
                WizardCharTitles = draft.Meta.Titles;

            if (!string.IsNullOrWhiteSpace(draft.Meta?.Age))
                WizardCharAge = draft.Meta.Age;

            if (!string.IsNullOrWhiteSpace(draft.Meta?.Background))
                WizardCharBackground = draft.Meta.Background;

            if (!string.IsNullOrWhiteSpace(draft.Meta?.Appearance))
                WizardCharAppearance = draft.Meta.Appearance;

            if (draft.Meta?.AppearanceDetails != null)
            {
                if (!string.IsNullOrWhiteSpace(draft.Meta.AppearanceDetails.Physique))
                    WizardPhysique = draft.Meta.AppearanceDetails.Physique;
                if (!string.IsNullOrWhiteSpace(draft.Meta.AppearanceDetails.Height))
                    WizardHeight = draft.Meta.AppearanceDetails.Height;
                if (!string.IsNullOrWhiteSpace(draft.Meta.AppearanceDetails.Eyes))
                    WizardEyes = draft.Meta.AppearanceDetails.Eyes;
                if (!string.IsNullOrWhiteSpace(draft.Meta.AppearanceDetails.Hair))
                    WizardHair = draft.Meta.AppearanceDetails.Hair;
                if (!string.IsNullOrWhiteSpace(draft.Meta.AppearanceDetails.RaceTraits))
                    WizardRaceTraits = draft.Meta.AppearanceDetails.RaceTraits;
            }

            if (!string.IsNullOrWhiteSpace(draft.Meta?.Biography))
                WizardBiography = draft.Meta.Biography;

            if (!string.IsNullOrWhiteSpace(draft.Meta?.Location))
                WizardCharLocation = draft.Meta.Location;

            if (!string.IsNullOrWhiteSpace(draft.AnatomyAndHealth?.OverallState))
                WizardCharHealth = draft.AnatomyAndHealth.OverallState;

            WizardInjuries.Clear();
            if (draft.AnatomyAndHealth?.Injuries != null)
            {
                foreach (var inj in draft.AnatomyAndHealth.Injuries)
                {
                    WizardInjuries.Add(inj);
                }
            }

            WizardAbilities.Clear();
            if (draft.Abilities != null)
            {
                foreach (var ab in draft.Abilities)
                {
                    WizardAbilities.Add(ab);
                }
            }

            WizardEquipment.Clear();
            if (draft.StorageAndEquipment?.Worn != null)
            {
                foreach (var w in draft.StorageAndEquipment.Worn)
                {
                    WizardEquipment.Add(w);
                }
            }
            if (draft.StorageAndEquipment?.Containers != null)
            {
                foreach (var kvp in draft.StorageAndEquipment.Containers)
                {
                    if (kvp.Value != null)
                    {
                        foreach (var item in kvp.Value)
                        {
                            WizardEquipment.Add(item);
                        }
                    }
                }
            }

            WizardCustomBlocks.Clear();
            var parsedBlocks = DynamicSheetHelper.ParseCustomBlocks(draft.CustomBlocks, draft.ExtraProperties);
            foreach (var block in parsedBlocks)
            {
                WizardCustomBlocks.Add(block);
            }

            OnPropertyChanged(nameof(HasWizardCustomBlocks));
            OnPropertyChanged(nameof(HasWizardInjuries));
        }

        public PlayerState BuildCurrentWizardDraftState()
        {
            var state = _lastWizardDraftState != null
                ? JsonSerializer.Deserialize<PlayerState>(JsonSerializer.Serialize(_lastWizardDraftState)) ?? new PlayerState()
                : new PlayerState();

            state.Meta ??= new();
            state.Meta.AppearanceDetails ??= new();
            state.AnatomyAndHealth ??= new();
            state.StorageAndEquipment ??= new();
            state.CustomBlocks ??= new();

            state.Meta.Name = WizardCharName;
            state.Meta.Titles = WizardCharTitles;
            state.Meta.Age = WizardCharAge;
            state.Meta.Background = WizardCharBackground;
            state.Meta.Appearance = WizardCharAppearance;

            state.Meta.AppearanceDetails.Physique = WizardPhysique;
            state.Meta.AppearanceDetails.Height = WizardHeight;
            state.Meta.AppearanceDetails.Eyes = WizardEyes;
            state.Meta.AppearanceDetails.Hair = WizardHair;
            state.Meta.AppearanceDetails.RaceTraits = WizardRaceTraits;

            state.Meta.Biography = WizardBiography;
            state.Meta.Location = string.IsNullOrWhiteSpace(WizardCharLocation) ? "Невідомий ліс" : WizardCharLocation;

            state.AnatomyAndHealth.OverallState = string.IsNullOrWhiteSpace(WizardCharHealth) ? "Повний сил" : WizardCharHealth;
            state.AnatomyAndHealth.Injuries = new List<Injury>(WizardInjuries);

            state.Abilities = new List<AbilityInfo>(WizardAbilities);

            // Зберігаємо контейнери; у Worn записуємо тільки елементи персонального екіпірування
            if (_wizardWornItemsCount > 0 && WizardEquipment.Count >= _wizardWornItemsCount)
            {
                state.StorageAndEquipment.Worn = WizardEquipment.Take(_wizardWornItemsCount).ToList();
            }
            else if (state.StorageAndEquipment.Containers == null || state.StorageAndEquipment.Containers.Count == 0)
            {
                state.StorageAndEquipment.Worn = new List<ItemInfo>(WizardEquipment);
            }

            // Зворотна серіалізація динамічних блоків кастомного шаблону з WizardCustomBlocks у state.CustomBlocks
            foreach (var block in WizardCustomBlocks)
            {
                if (string.IsNullOrWhiteSpace(block.Key)) continue;

                if (block.HasFields)
                {
                    var dict = new Dictionary<string, object>();
                    foreach (var field in block.Fields)
                    {
                        dict[field.Key] = field.Value;
                    }
                    state.CustomBlocks[block.Key] = JsonSerializer.SerializeToElement(dict);
                }
                else if (block.HasTags)
                {
                    state.CustomBlocks[block.Key] = JsonSerializer.SerializeToElement(block.Tags);
                }
                else if (block.HasItems)
                {
                    state.CustomBlocks[block.Key] = JsonSerializer.SerializeToElement(block.Items);
                }
            }

            return state;
        }

        [RelayCommand]
        public async Task SyncDraftAsync()
        {
            if (IsSyncingDraft || IsWizardTyping) return;

            IsSyncingDraft = true;
            try
            {
                var draft = BuildCurrentWizardDraftState();
                var harmonized = await _gameApiService.SyncCharacterDraftAsync(draft);
                if (harmonized != null)
                {
                    UpdateLivePreviewFromDraft(harmonized);
                    WizardMessages.Add(new ChatMessage
                    {
                        Sender = "Творець Долі:",
                        Text = "✨ Картку персонажа гармонізовано! Характеристики та навички узгоджено з вашими правками.",
                        SenderColor = "#A78BFA"
                    });
                }
                else
                {
                    WizardMessages.Add(new ChatMessage
                    {
                        Sender = "Система:",
                        Text = "⚠️ Не вдалося синхронізувати драфт із ШІ. Спробуйте пізніше.",
                        SenderColor = "#EF4444"
                    });
                }
            }
            catch (Exception ex)
            {
                WizardMessages.Add(new ChatMessage
                {
                    Sender = "Система:",
                    Text = $"⚠️ Помилка синхронізації драфту: {ex.Message}",
                    SenderColor = "#EF4444"
                });
            }
            finally
            {
                IsSyncingDraft = false;
            }
        }

        [RelayCommand]
        public void CancelCharacterCreation()
        {
            if (WizardMessages.Count > 1 || !string.IsNullOrWhiteSpace(WizardCharName) || !string.IsNullOrWhiteSpace(WizardInput))
            {
                PromptUnfinishedWizardExit(() =>
                {
                    IsCharacterCreationActive = false;
                    return Task.CompletedTask;
                });
                return;
            }
            IsCharacterCreationActive = false;
        }

        [RelayCommand]
        public async Task SendWizardMessageAsync()
        {
            if (string.IsNullOrWhiteSpace(WizardInput) || IsWizardTyping) return;

            var userText = WizardInput.Trim();
            WizardInput = "";

            // Очищаємо сирі символи ** (Markdown bold) з відповіді гравця у візарді
            var cleanUserText = userText.Replace("**", "");

            WizardMessages.Add(new ChatMessage
            {
                Sender = "Ти:",
                Text = cleanUserText,
                SenderColor = "#60A5FA",
                IsPlayer = true
            });

            IsWizardTyping = true;
            WizardStatusText = "Творець Долі розмірковує";
            _ = AnimateWizardDotsAsync();

            try
            {
                var history = WizardMessages.Select(m => new CharacterDialogHistoryItem
                {
                    Role = m.Sender.Contains("Творець Долі") ? "narrator" : "player",
                    Content = m.Text
                }).ToList();

                var dialogResponse = await _gameApiService.SendCharacterDialogMessageAsync(userText, history, includeDraft: true);
                var reply = dialogResponse?.Reply;

                if (string.IsNullOrWhiteSpace(reply))
                {
                    reply = "Цікавий образ. Нитки долі починають сплітатися. Чи має твій персонаж особливі прикмети, спорядження або магічний дар, про який варто знати?";
                }

                // Очищаємо сирі символи ** (Markdown bold) з реплік Творця Долі
                reply = reply.Replace("**", "");

                WizardMessages.Add(new ChatMessage
                {
                    Sender = "Творець Долі:",
                    Text = reply,
                    SenderColor = "#C084FC"
                });

                // Автоматичне оновлення панелі Live Preview при отриманні draft_state (API v1.5.0)
                if (dialogResponse?.DraftState != null)
                {
                    UpdateLivePreviewFromDraft(dialogResponse.DraftState);
                }
                else
                {
                    // Базове автовизначення імені якщо draft_state відсутній
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
            WizardStatusText = "Генерація фінального листа персонажа";
            _ = AnimateWizardDotsAsync();

            try
            {
                var summary = string.Join("\n", WizardMessages.Select(m => $"{m.Sender} {m.Text}"));
                var currentDraft = BuildCurrentWizardDraftState();
                var playerState = await _gameApiService.FinalizeCharacterAsync(summary, currentDraft);

                // 1. Обробка помилки при фіналізації: якщо бекенд повернув 503/null
                if (playerState == null || playerState.Meta == null)
                {
                    WizardMessages.Add(new ChatMessage
                    {
                        Sender = "Система:",
                        Text = "⚠️ ШІ тимчасово перевантажений або ліміт запитів вичерпано, зачекайте 15–20 секунд і спробуйте знову.",
                        SenderColor = "#EF4444"
                    });
                    return; // Залишаємо користувача у майстрі створення персонажа
                }

                // 2. Усунення дублювання: бекенд у /character/finalize вже зберіг героя в базі
                await InitializeHierarchyAsync();

                var targetCharName = !string.IsNullOrWhiteSpace(WizardCharName)
                    ? WizardCharName.Trim()
                    : playerState.Meta.Name;

                var selected = Characters.FirstOrDefault(c => c.Name.Equals(targetCharName, StringComparison.OrdinalIgnoreCase))
                            ?? Characters.LastOrDefault();

                if (selected != null)
                {
                    await SelectCharacterAsync(selected);

                    // Автоматично створюємо першу кампанію зі вступним постом
                    var firstCamp = await _gameApiService.CreateCampaignAsync(selected.CharId, $"Пригода {selected.Name} #1");
                    if (firstCamp != null)
                    {
                        await LoadCampaignsForCharacterAsync(selected.CharId, autoSelectFirstCampaign: false);
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
                        Text = "⚠️ Не вдалося знайти збереженого персонажа у списку.",
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
                WizardStatusText = "Творець Долі чекає на відповідь";
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
            ConfirmModalConfirmButtonText = "Так";
            ConfirmModalCancelButtonText = "Ні";
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

        // --- 1.4 ГОЛОСОВЕ ВВЕДЕННЯ (VOICE-TO-TEXT) ТА ДИНАМІЧНА КНОПКА ВІДПРАВКИ ---
        [RelayCommand]
        public async Task SendOrRecordAsync()
        {
            if (IsTyping || IsTranscribingVoice) return;

            if (IsRecordingVoice)
            {
                await StopVoiceRecordingAsync(isWizard: false);
                return;
            }

            if (HasUserInput)
            {
                await SendAsync();
                return;
            }

            StartVoiceRecording(isWizard: false);
        }

        [RelayCommand]
        public async Task SendOrRecordWizardAsync()
        {
            if (IsWizardTyping || IsTranscribingVoice) return;

            if (IsRecordingVoice)
            {
                await StopVoiceRecordingAsync(isWizard: true);
                return;
            }

            if (HasWizardInput)
            {
                await SendWizardMessageAsync();
                return;
            }

            StartVoiceRecording(isWizard: true);
        }

        private void StartVoiceRecording(bool isWizard)
        {
            if (!_audioRecordingService.IsSupported)
            {
                string msg = "Мікрофон не виявлено або пристрої запису відсутні в системі.";
                if (isWizard) WizardStatusText = msg;
                else StatusIndicatorText = msg;
                return;
            }

            try
            {
                _audioRecordingService.StartRecording();
                IsRecordingVoice = true;
                string recordingMsg = "🎙️ Запис голосу... Говоріть дію (натисніть кнопку ще раз для завершення)";
                if (isWizard) WizardStatusText = recordingMsg;
                else StatusIndicatorText = recordingMsg;
            }
            catch (Exception ex)
            {
                string err = $"Помилка старту запису: {ex.Message}";
                if (isWizard) WizardStatusText = err;
                else StatusIndicatorText = err;
            }
        }

        private async Task StopVoiceRecordingAsync(bool isWizard)
        {
            if (!IsRecordingVoice) return;

            try
            {
                IsRecordingVoice = false;
                IsTranscribingVoice = true;
                string transcribingMsg = "Перетворення голосу в текст через ШІ...";
                if (isWizard) WizardStatusText = transcribingMsg;
                else StatusIndicatorText = transcribingMsg;

                byte[] audioData = await _audioRecordingService.StopRecordingAsync();
                if (audioData.Length > 0)
                {
                    string? text = await _gameApiService.TranscribeAudioAsync(audioData);
                    if (!string.IsNullOrWhiteSpace(text))
                    {
                        if (isWizard)
                        {
                            WizardInput = string.IsNullOrWhiteSpace(WizardInput)
                                ? text.Trim()
                                : $"{WizardInput.Trim()} {text.Trim()}";
                            WizardStatusText = "Творець Долі слухає...";
                        }
                        else
                        {
                            UserInput = string.IsNullOrWhiteSpace(UserInput)
                                ? text.Trim()
                                : $"{UserInput.Trim()} {text.Trim()}";
                            StatusIndicatorText = "Готовий до нових дій";
                        }
                    }
                    else
                    {
                        string failMsg = "Не вдалося розпізнати мову або запис був порожнім.";
                        if (isWizard) WizardStatusText = failMsg;
                        else StatusIndicatorText = failMsg;
                    }
                }
            }
            catch (Exception ex)
            {
                string err = $"Помилка розпізнавання: {ex.Message}";
                if (isWizard) WizardStatusText = err;
                else StatusIndicatorText = err;
            }
            finally
            {
                IsTranscribingVoice = false;
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
                SenderColor = "#60A5FA", // Блакитний
                TimeText = DateTime.Now.ToString("HH:mm"),
                IsPlayer = true
            });
            UpdateRollbackAvailability();
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
                var streamQueue = new System.Collections.Concurrent.ConcurrentQueue<string>();
                using var streamCts = new CancellationTokenSource();
                Task? drainTask = null;

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
                                        SenderColor = "#EAB308",
                                        TimeText = DateTime.Now.ToString("HH:mm")
                                    };
                                    ChatMessages.Add(aiMessage);
                                    drainTask = Task.Run(() => DrainStreamQueueAsync(streamQueue, aiMessage, storyBuilder, streamCts.Token));
                                }

                                streamQueue.Enqueue(sse.TextChunk);
                            }
                            break;

                        case SseEventType.StateAnalyzing:
                            StatusIndicatorText = sse.StatusMessage ?? "Аналізую зміни інвентарю та здоров'я...";
                            break;

                        case SseEventType.Complete:
                            streamCts.Cancel();
                            if (drainTask != null)
                            {
                                try { await drainTask; } catch { }
                            }

                            while (streamQueue.TryDequeue(out var remaining))
                            {
                                storyBuilder.Append(remaining);
                            }

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
                                else if (aiMessage != null)
                                {
                                    aiMessage.Text = storyBuilder.ToString();
                                }
                            }

                            if (SelectedCampaign != null)
                            {
                                SelectedCampaign.LastPlayed = DateTime.UtcNow.ToString("o");
                                ReorderCampaigns();
                            }
                            UpdateRollbackAvailability();
                            break;

                        case SseEventType.Error:
                            ChatMessages.Add(new ChatMessage
                            {
                                Sender = "Система:",
                                Text = sse.ErrorMessage ?? "Помилка під час генерації ходу.",
                                SenderColor = "#EF4444",
                                TimeText = DateTime.Now.ToString("HH:mm")
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
                    SenderColor = "#EF4444",
                    TimeText = DateTime.Now.ToString("HH:mm")
                });
            }
            finally
            {
                IsTyping = false;
                StatusIndicatorText = "Розмірковує над дією";
                UpdateRollbackAvailability();
            }
        }

        private async Task DrainStreamQueueAsync(
            System.Collections.Concurrent.ConcurrentQueue<string> queue,
            ChatMessage targetMessage,
            StringBuilder fullStory,
            CancellationToken ct)
        {
            while (!ct.IsCancellationRequested || !queue.IsEmpty)
            {
                if (queue.TryDequeue(out var chunk))
                {
                    var matches = System.Text.RegularExpressions.Regex.Matches(chunk, @"\S+|\s+");
                    foreach (System.Text.RegularExpressions.Match match in matches)
                    {
                        fullStory.Append(match.Value);
                        var currentText = fullStory.ToString();
                        Avalonia.Threading.Dispatcher.UIThread.Post(() => targetMessage.Text = currentText);

                        int delay = queue.Count > 3 ? 6 : 22;
                        try
                        {
                            await Task.Delay(delay, ct);
                        }
                        catch (OperationCanceledException)
                        {
                            break;
                        }
                    }
                }
                else
                {
                    if (ct.IsCancellationRequested) break;
                    try
                    {
                        await Task.Delay(15, ct);
                    }
                    catch (OperationCanceledException)
                    {
                        break;
                    }
                }
            }
        }

        [RelayCommand]
        public async Task RollbackTurnAsync()
        {
            if (SelectedCampaign == null || IsTyping) return;

            try
            {
                StatusIndicatorText = "Відкочую останній хід...";
                IsTyping = true;

                var rollbackResponse = await _gameApiService.RollbackTurnAsync(SelectedCampaign.CampaignId);
                if (rollbackResponse != null)
                {
                    // 1. Оновлюємо стан гравця
                    if (rollbackResponse.CurrentState != null)
                    {
                        ApplyPlayerState(rollbackResponse.CurrentState);
                    }

                    // 2. Перезавантажуємо журнал чату з сервера
                    await LoadCampaignHistoryAsync(SelectedCampaign.CampaignId);

                    // 3. Повертаємо текст попередньої дії гравця в поле вводу
                    if (!string.IsNullOrWhiteSpace(rollbackResponse.PreviousUserInput))
                    {
                        UserInput = rollbackResponse.PreviousUserInput;
                    }

                    StatusIndicatorText = "Хід успішно відкочено";
                }
                else
                {
                    StatusIndicatorText = "Не вдалося відкотити хід";
                }
            }
            catch (Exception ex)
            {
                System.Diagnostics.Debug.WriteLine($"[RollbackTurn error]: {ex.Message}");
                StatusIndicatorText = "Помилка відкату";
            }
            finally
            {
                IsTyping = false;
                UpdateRollbackAvailability();
            }
        }

        private void UpdateRollbackAvailability()
        {
            if (ChatMessages.Count == 0) return;

            for (int i = 0; i < ChatMessages.Count; i++)
            {
                ChatMessages[i].CanRollback = false;
            }

            var lastMsg = ChatMessages.LastOrDefault();
            if (lastMsg != null && lastMsg.Sender.StartsWith("Оповідач") && ChatMessages.Count > 1)
            {
                lastMsg.CanRollback = true;
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

            // Додаткові метадані та деталі зовнішності (_template.json)
            CharacterTitles = state.Meta?.Titles ?? string.Empty;
            CharacterAge = state.Meta?.Age ?? string.Empty;
            CharacterBiography = state.Meta?.Biography ?? string.Empty;

            if (state.Meta?.AppearanceDetails != null)
            {
                CharacterPhysique = state.Meta.AppearanceDetails.Physique ?? string.Empty;
                CharacterHeight = state.Meta.AppearanceDetails.Height ?? string.Empty;
                CharacterEyes = state.Meta.AppearanceDetails.Eyes ?? string.Empty;
                CharacterHair = state.Meta.AppearanceDetails.Hair ?? string.Empty;
                CharacterRaceTraits = state.Meta.AppearanceDetails.RaceTraits ?? string.Empty;
            }
            else
            {
                CharacterPhysique = "";
                CharacterHeight = "";
                CharacterEyes = "";
                CharacterHair = "";
                CharacterRaceTraits = "";
            }

            // Динамічні довільні блоки (Custom Blocks)
            CharacterCustomBlocks.Clear();
            var parsedBlocks = DynamicSheetHelper.ParseCustomBlocks(state.CustomBlocks, state.ExtraProperties);
            foreach (var b in parsedBlocks)
            {
                CharacterCustomBlocks.Add(b);
            }
            OnPropertyChanged(nameof(HasDrawerDetails));

            InventoryText = allItemNames.Any() ? string.Join(", ", allItemNames) : "порожньо";
        }

        private async Task AnimateDotsAsync()
        {
            int count = 0;
            while (IsTyping)
            {
                AnimatedDots = new string('.', (count % 3) + 1);
                count++;
                await Task.Delay(400);
            }
            AnimatedDots = "";
        }

        private async Task AnimateWizardDotsAsync()
        {
            int count = 0;
            while (IsWizardTyping)
            {
                WizardAnimatedDots = new string('.', (count % 3) + 1);
                count++;
                await Task.Delay(400);
            }
            WizardAnimatedDots = "";
        }
    }
}
