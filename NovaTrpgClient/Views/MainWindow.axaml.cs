using Avalonia.Controls;
using Avalonia.Input;
using Avalonia.Platform;
using AvaloniaEdit.Highlighting;
using AvaloniaEdit.Highlighting.Xshd;
using NovaTrpgClient.ViewModels;
using System;
using System.Xml;

namespace NovaTrpgClient.Views
{
    public partial class MainWindow : Window
    {
        public MainWindow()
        {
            InitializeComponent();
            LoadCodeHighlighting();

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
