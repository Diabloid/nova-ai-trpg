using Avalonia.Controls;
using Avalonia.Input;
using Avalonia.Interactivity;
using Avalonia.Platform;
using Avalonia.VisualTree;
using AvaloniaEdit.Highlighting;
using AvaloniaEdit.Highlighting.Xshd;
using NovaTrpgClient.ViewModels;
using System;
using System.Threading.Tasks;
using System.Xml;

namespace NovaTrpgClient.Views
{
    public partial class MainWindow : Window
    {
        public MainWindow()
        {
            InitializeComponent();
            LoadCodeHighlighting();

            // Зняття фокусу з полів вводу при кліку поза їхніми межами
            this.AddHandler(InputElement.PointerPressedEvent, (s, e) =>
            {
                var visual = e.Source as Avalonia.Visual;
                if (visual?.FindAncestorOfType<TextBox>(includeSelf: true) == null &&
                    visual?.FindAncestorOfType<AvaloniaEdit.TextEditor>(includeSelf: true) == null)
                {
                    this.FocusManager?.Focus(null);
                }
            }, RoutingStrategies.Tunnel);

            if (ChatInputEditor != null)
            {
                ChatInputEditor.TextArea.AddHandler(InputElement.KeyDownEvent, ChatInputEditor_TunnelKeyDown, Avalonia.Interactivity.RoutingStrategies.Tunnel);

                // Керування плейсхолдером (Watermark) та синхронізація введеного тексту з ViewModel
                ChatInputEditor.TextChanged += (s, e) =>
                {
                    if (WatermarkText != null)
                    {
                        WatermarkText.IsVisible = string.IsNullOrEmpty(ChatInputEditor.Text);
                    }

                    if (this.DataContext is MainWindowViewModel vm && !vm.IsTyping)
                    {
                        vm.UserInput = ChatInputEditor.Text ?? string.Empty;
                    }
                };
            }

            if (WizardInputBox != null)
            {
                WizardInputBox.AddHandler(InputElement.KeyDownEvent, WizardInputBox_TunnelKeyDown, Avalonia.Interactivity.RoutingStrategies.Tunnel);
            }

            // Автоскрол чату при зміні розміру вікна або області повідомлень
            var mainChatScroll = this.FindControl<ScrollViewer>("ChatScroll");
            if (mainChatScroll != null)
            {
                mainChatScroll.SizeChanged += (s, e) =>
                {
                    mainChatScroll.ScrollToEnd();
                };
            }

            this.DataContextChanged += (s, e) =>
            {
                if (this.DataContext is MainWindowViewModel vm)
                {
                    // Очищення редактора, коли ViewModel скидає UserInput після відправки
                    vm.PropertyChanged += (sender, args) =>
                    {
                        if (args.PropertyName == nameof(MainWindowViewModel.UserInput))
                        {
                            if (string.IsNullOrEmpty(vm.UserInput) && !string.IsNullOrEmpty(ChatInputEditor?.Text))
                            {
                                ChatInputEditor.Text = string.Empty;
                            }
                        }
                        else if (args.PropertyName == nameof(MainWindowViewModel.IsCharacterSheetOpen))
                        {
                            // Усунення сповзання чату: фіксація скролу під час та після розгортання шторки
                            Avalonia.Threading.Dispatcher.UIThread.Post(async () =>
                            {
                                var scroll = this.FindControl<ScrollViewer>("ChatScroll");
                                scroll?.ScrollToEnd();
                                await Task.Delay(460);
                                scroll?.ScrollToEnd();
                            }, Avalonia.Threading.DispatcherPriority.Loaded);
                        }
                    };

                    vm.ChatMessages.CollectionChanged += (sender, args) =>
                    {
                        // Автоматична прокрутка до останнього повідомлення після рендеру
                        Avalonia.Threading.Dispatcher.UIThread.Post(() =>
                        {
                            var scroll = this.FindControl<ScrollViewer>("ChatScroll");
                            scroll?.ScrollToEnd();
                        }, Avalonia.Threading.DispatcherPriority.Loaded);
                    };

                    vm.WizardMessages.CollectionChanged += (sender, args) =>
                    {
                        // Автоматична прокрутка діалогу Творця Долі
                        Avalonia.Threading.Dispatcher.UIThread.Post(() =>
                        {
                            var scroll = this.FindControl<ScrollViewer>("WizardScroll");
                            scroll?.ScrollToEnd();
                        }, Avalonia.Threading.DispatcherPriority.Loaded);
                    };
                }
            };
        }

        private void LoadCodeHighlighting()
        {
            if (ChatInputEditor == null) return;

            try
            {
                // Завантажуємо правила підсвітки синтаксису напряму з вбудованого ресурсу Assets/NovaSyntax.xshd
                var uri = new Uri("avares://NovaTrpgClient/Assets/NovaSyntax.xshd");
                if (AssetLoader.Exists(uri))
                {
                    using var stream = AssetLoader.Open(uri);
                    using var reader = new XmlTextReader(stream);
                    ChatInputEditor.SyntaxHighlighting = HighlightingLoader.Load(reader, HighlightingManager.Instance);
                }
            }
            catch (Exception)
            {
                // Дозволяємо працювати редактору навіть якщо підсвітка не завантажилася
            }
        }

        // Перехоплюємо натискання Enter для відправки повідомлення
        private void ChatInputEditor_TunnelKeyDown(object? sender, KeyEventArgs e)
        {
            if (e.Key == Key.Enter)
            {
                if (e.KeyModifiers == KeyModifiers.Shift) return; // Дозволяємо перенесення рядка через Shift+Enter

                e.Handled = true; // Блокуємо стандартну поведінку Enter
                
                if (this.DataContext is MainWindowViewModel vm)
                {
                    var text = ChatInputEditor?.Text?.Trim();
                    if (!string.IsNullOrWhiteSpace(text))
                    {
                        vm.UserInput = text;
                        if (vm.SendCommand.CanExecute(null))
                        {
                            vm.SendCommand.Execute(null);
                        }
                    }
                }
            }
        }

        // Перехоплюємо натискання Enter у полі діалогу з Творцем Долі на стадії Tunnel
        private void WizardInputBox_TunnelKeyDown(object? sender, KeyEventArgs e)
        {
            if (e.Key == Key.Enter)
            {
                if (e.KeyModifiers.HasFlag(KeyModifiers.Shift)) return; // Shift+Enter вставляє перенесення рядка

                e.Handled = true; // Блокуємо стандартне перенесення рядка в TextBox

                if (sender is TextBox tb && this.DataContext is MainWindowViewModel vm)
                {
                    var text = tb.Text?.Trim();
                    if (!string.IsNullOrWhiteSpace(text) && !vm.IsWizardTyping)
                    {
                        vm.WizardInput = text;
                        if (vm.SendWizardMessageCommand.CanExecute(null))
                        {
                            vm.SendWizardMessageCommand.Execute(null);
                        }
                    }
                }
            }
        }

        private void RemoveFormatting_Click(object? sender, Avalonia.Interactivity.RoutedEventArgs e)
        {
            if (ChatInputEditor == null || string.IsNullOrEmpty(ChatInputEditor.Text)) return;

            int offset = ChatInputEditor.CaretOffset;
            string doc = ChatInputEditor.Text;

            // Шукаємо лише не екрановані блоки розмітки
            var matches = System.Text.RegularExpressions.Regex.Matches(doc, @"(?<!\\)\*\*.*?(?<!\\)\*\*|(?<!\\)"".*?(?<!\\)""|(?<!\\)\(.*?(?<!\\)\)");

            for (int i = matches.Count - 1; i >= 0; i--)
            {
                var m = matches[i];
                if (offset >= m.Index && offset <= m.Index + m.Length)
                {
                    string inner = doc.Substring(m.Index, m.Length);

                    if (inner.StartsWith("**"))
                        inner = @"\*\*" + inner.Substring(2, inner.Length - 4) + @"\*\*";
                    else if (inner.StartsWith("\""))
                        inner = @"\""" + inner.Substring(1, inner.Length - 2) + @"\""";
                    else if (inner.StartsWith("("))
                        inner = @"\(" + inner.Substring(1, inner.Length - 2) + @"\)";

                    ChatInputEditor.Document.Replace(m.Index, m.Length, inner);
                    break;
                }
            }
        }
    }
}
