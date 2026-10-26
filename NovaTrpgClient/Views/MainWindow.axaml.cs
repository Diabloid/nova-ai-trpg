using Avalonia.Controls;
using Avalonia.Input;
using AvaloniaEdit.Highlighting;
using AvaloniaEdit.Highlighting.Xshd;
using NovaTrpgClient.ViewModels;
using System.IO;
using System.Reflection;
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
                        // Виконуємо прокрутку після того, як UI встигне оновитися
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

            // Завантажуємо правила через вбудований парсер визначень AvaloniaEdit
            // Це на 100% сумісно з будь-якими версіями бібліотеки
            var syntaxXml = @"
            <SyntaxDefinition name='NovaSyntax' xmlns='http://icsharpcode.net/sharpdevelop/syntaxdefinition/2008'>
                <Color name='Action' foreground='#EAB308' fontWeight='bold' />
                <Color name='Speech' foreground='#4ADE80' />
                <Color name='Thought' foreground='#60A5FA' fontStyle='italic' />
                <Color name='OOC' foreground='#9CA3AF' />

                <RuleSet>
                    <!-- Зверни увагу на (?&lt;!\\) - це захист від екранування -->
                    <Span color='Action' multiline='true'>
                        <Begin>(?&lt;!\\)\*\*</Begin>
                        <End>(?&lt;!\\)\*\*</End>
                    </Span>
                    <Span color='Thought' multiline='true'>
                        <Begin>(?&lt;!\\)&quot;</Begin>
                        <End>(?&lt;!\\)&quot;</End>
                    </Span>
                    <Span color='OOC' multiline='true'>
                        <Begin>(?&lt;!\\)\(</Begin>
                        <End>(?&lt;!\\)\)</End>
                    </Span>
                    <Span color='Speech' multiline='false'>
                        <Begin>(?&lt;!\\)\-</Begin>
                        <End>$</End>
                    </Span>
                </RuleSet>
            </SyntaxDefinition>";

            using (var reader = new XmlTextReader(new StringReader(syntaxXml)))
            {
                ChatInputEditor.SyntaxHighlighting = HighlightingLoader.Load(reader, HighlightingManager.Instance);
            }
        }

        // Перехоплюємо подію ДО того, як TextEditor її з'їсть
        private void ChatInputEditor_TunnelKeyDown(object? sender, KeyEventArgs e)
        {
            if (e.Key == Key.Enter)
            {
                if (e.KeyModifiers == KeyModifiers.Shift) return; // Дозволяємо новий рядок

                e.Handled = true; // Блокуємо Enter
                
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

            // Шукаємо лише не екрановані блоки
            var matches = System.Text.RegularExpressions.Regex.Matches(doc, @"(?<!\\)\*\*.*?(?<!\\)\*\*|(?<!\\)"".*?(?<!\\)""|(?<!\\)\(.*?(?<!\\)\)");

            for (int i = matches.Count - 1; i >= 0; i--)
            {
                var m = matches[i];
                // Якщо курсор всередині цього форматування
                if (offset >= m.Index && offset <= m.Index + m.Length)
                {
                    string inner = doc.Substring(m.Index, m.Length);

                    // Екрануємо символи
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
