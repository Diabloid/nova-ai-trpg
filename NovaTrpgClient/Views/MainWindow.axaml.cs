using Avalonia;
using Avalonia.Controls;
using Avalonia.Input;
using Avalonia.Interactivity;
using Avalonia.LogicalTree;
using Avalonia.Platform;
using Avalonia.VisualTree;
using AvaloniaEdit.Highlighting;
using AvaloniaEdit.Highlighting.Xshd;
using NovaTrpgClient.ViewModels;
using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;
using System.Xml;

namespace NovaTrpgClient.Views
{
    public partial class MainWindow : Window
    {
        public MainWindow()
        {
            InitializeComponent();
            Win32Properties.AddWndProcHookCallback(this, CustomWndProc);
            this.AttachedToVisualTree += (s, e) => SuppressManagedWindowDecorations();
            this.Opened += (s, e) =>
            {
                SuppressManagedWindowDecorations();
                EnableWindowsDwmAnimations();
            };
            LoadCodeHighlighting();

            // Зняття фокусу з полів вводу при кліку поза їхніми межами (не чіпати кліки по кнопках)
            this.AddHandler(InputElement.PointerPressedEvent, (s, e) =>
            {
                var visual = e.Source as Avalonia.Visual;
                if (visual?.FindAncestorOfType<Button>(includeSelf: true) != null)
                {
                    return;
                }

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
                            if (ChatInputEditor != null && ChatInputEditor.Text != vm.UserInput)
                            {
                                ChatInputEditor.Text = vm.UserInput ?? string.Empty;
                                if (!string.IsNullOrEmpty(vm.UserInput))
                                {
                                    ChatInputEditor.CaretOffset = ChatInputEditor.Text.Length;
                                }
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
            int selStart = ChatInputEditor.SelectionStart;
            int selLength = ChatInputEditor.SelectionLength;
            string doc = ChatInputEditor.Text;

            // Збираємо окремо всі можливі блоки: думки, дії, OOC та пряму мову
            var allMatches = new List<System.Text.RegularExpressions.Match>();
            allMatches.AddRange(System.Text.RegularExpressions.Regex.Matches(doc, @"(?<!\\)\"".*?(?<!\\)\""").Cast<System.Text.RegularExpressions.Match>());
            allMatches.AddRange(System.Text.RegularExpressions.Regex.Matches(doc, @"(?<!\\)\(.*?(?<!\\)\)").Cast<System.Text.RegularExpressions.Match>());
            allMatches.AddRange(System.Text.RegularExpressions.Regex.Matches(doc, @"(?<!\\)\*\*.*?(?<!\\)\*\*").Cast<System.Text.RegularExpressions.Match>());
            allMatches.AddRange(System.Text.RegularExpressions.Regex.Matches(doc, @"(?<!\\)[\-\u2013\u2014].*?$").Cast<System.Text.RegularExpressions.Match>());

            if (allMatches.Count == 0) return;

            // 1. Якщо виділено текст: знімаємо форматування з усіх блоків всередині виділення
            if (selLength > 0)
            {
                int selEnd = selStart + selLength;
                var selMatches = allMatches.Where(m => m.Index >= selStart && (m.Index + m.Length) <= selEnd)
                                           .OrderByDescending(m => m.Index)
                                           .ToList();
                foreach (var m in selMatches)
                {
                    string clean = UnformatMatch(m.Value);
                    ChatInputEditor.Document.Replace(m.Index, m.Length, clean);
                }
                return;
            }

            // 2. Якщо курсор всередині блоку: обираємо найвужчий вкладений блок (наприклад, думку всередині дії)
            var enclosingMatches = allMatches
                .Where(m => offset >= m.Index && offset <= m.Index + m.Length)
                .OrderBy(m => m.Length)
                .ToList();

            if (enclosingMatches.Count > 0)
            {
                var target = enclosingMatches.First();
                string clean = UnformatMatch(target.Value);
                ChatInputEditor.Document.Replace(target.Index, target.Length, clean);
                return;
            }

            // 3. Якщо курсор не потрапив у блок: знімаємо форматування з усіх блоків
            var ordered = allMatches.OrderByDescending(m => m.Index).ToList();
            foreach (var m in ordered)
            {
                string clean = UnformatMatch(m.Value);
                ChatInputEditor.Document.Replace(m.Index, m.Length, clean);
            }
        }

        private static string UnformatMatch(string inner)
        {
            // Очищаємо залишки зворотних слешів якщо вони були введені
            if (inner.Contains(@"\"))
            {
                return inner.Replace(@"\", "");
            }

            // Перемикаємо форматування через невидимий Zero-Width Space без слешів
            if (inner.StartsWith("\"") && inner.EndsWith("\"") && inner.Length >= 2)
            {
                if (inner.Length > 2 && inner[1] == '\u200B')
                    return "\"" + inner.Substring(2);
                return "\"\u200B" + inner.Substring(1);
            }

            if (inner.StartsWith("**") && inner.EndsWith("**") && inner.Length >= 4)
            {
                if (inner.Length > 4 && inner[1] == '\u200B')
                    return "**" + inner.Substring(3, inner.Length - 5) + "**";
                return "*\u200B*" + inner.Substring(2, inner.Length - 4) + "*\u200B*";
            }

            if (inner.StartsWith("(") && inner.EndsWith(")") && inner.Length >= 2)
            {
                if (inner.Length > 2 && inner[1] == '\u200B')
                    return "(" + inner.Substring(2);
                return "(\u200B" + inner.Substring(1);
            }

            if (inner.StartsWith("-") || inner.StartsWith("–") || inner.StartsWith("—"))
            {
                if (inner.Length > 1 && inner[1] == '\u200B')
                    return inner.Substring(0, 1) + inner.Substring(2);
                return inner.Substring(0, 1) + "\u200B" + inner.Substring(1);
            }

            return inner;
        }

        private void TitleBar_PointerPressed(object? sender, Avalonia.Input.PointerPressedEventArgs e)
        {
            if (e.GetCurrentPoint(this).Properties.IsLeftButtonPressed)
            {
                if (e.ClickCount == 2)
                {
                    WindowState = WindowState == WindowState.Maximized 
                        ? WindowState.Normal 
                        : WindowState.Maximized;
                }
                else
                {
                    BeginMoveDrag(e);
                }
            }
        }

        private void MinimizeButton_Click(object? sender, Avalonia.Interactivity.RoutedEventArgs e)
        {
            WindowState = WindowState.Minimized;
        }

        private void MaximizeButton_Click(object? sender, Avalonia.Interactivity.RoutedEventArgs e)
        {
            ToggleMaximize();
        }

        private void ToggleMaximize()
        {
            WindowState = WindowState == WindowState.Maximized 
                ? WindowState.Normal 
                : WindowState.Maximized;
        }

        private void CloseButton_Click(object? sender, Avalonia.Interactivity.RoutedEventArgs e)
        {
            Close();
        }

        [System.Runtime.InteropServices.DllImport("user32.dll", EntryPoint = "GetWindowLong")]
        private static extern int GetWindowLong32(IntPtr hWnd, int nIndex);

        [System.Runtime.InteropServices.DllImport("user32.dll", EntryPoint = "GetWindowLongPtr")]
        private static extern IntPtr GetWindowLongPtr64(IntPtr hWnd, int nIndex);

        [System.Runtime.InteropServices.DllImport("user32.dll", EntryPoint = "SetWindowLong")]
        private static extern int SetWindowLong32(IntPtr hWnd, int nIndex, int dwNewLong);

        [System.Runtime.InteropServices.DllImport("user32.dll", EntryPoint = "SetWindowLongPtr")]
        private static extern IntPtr SetWindowLongPtr64(IntPtr hWnd, int nIndex, IntPtr dwNewLong);

        private static IntPtr GetWindowLongPtr(IntPtr hWnd, int nIndex)
        {
            return IntPtr.Size == 8 ? GetWindowLongPtr64(hWnd, nIndex) : (IntPtr)GetWindowLong32(hWnd, nIndex);
        }

        private static IntPtr SetWindowLongPtr(IntPtr hWnd, int nIndex, IntPtr dwNewLong)
        {
            return IntPtr.Size == 8 ? SetWindowLongPtr64(hWnd, nIndex, dwNewLong) : (IntPtr)SetWindowLong32(hWnd, nIndex, (int)dwNewLong);
        }

        private IntPtr CustomWndProc(IntPtr hWnd, uint msg, IntPtr wParam, IntPtr lParam, ref bool handled)
        {
            const uint WM_NCHITTEST = 0x0084;
            if (msg == WM_NCHITTEST && CaptionButtonsPanel != null && CaptionButtonsPanel.Bounds.Width > 0)
            {
                int screenX = (short)(lParam.ToInt64() & 0xFFFF);
                int screenY = (short)((lParam.ToInt64() >> 16) & 0xFFFF);
                var clientPt = this.PointToClient(new Avalonia.PixelPoint(screenX, screenY));
                var localPt = this.TranslatePoint(clientPt, CaptionButtonsPanel);
                if (localPt.HasValue)
                {
                    var hitRect = new Avalonia.Rect(
                        -1,
                        -8,
                        CaptionButtonsPanel.Bounds.Width + 10,
                        CaptionButtonsPanel.Bounds.Height + 8);

                    if (hitRect.Contains(localPt.Value))
                    {
                        handled = true;
                        return new IntPtr(1); // HTCLIENT = 1
                    }
                }
            }
            return IntPtr.Zero;
        }

        private void SuppressManagedWindowDecorations()
        {
            var topHost = this.GetVisualParent() ?? (Visual)this;
            if (topHost is ILogical logicalRoot)
            {
                foreach (var logical in logicalRoot.GetLogicalDescendants())
                {
                    if (logical is Avalonia.Controls.Chrome.WindowDrawnDecorations decorations)
                    {
                        decorations.Template = null;
                        decorations.DefaultTitleBarHeight = 0;
                    }
                }
            }

            foreach (var visual in topHost.GetVisualDescendants())
            {
                if (visual is Control ctrl)
                {
                    var autoId = Avalonia.Automation.AutomationProperties.GetAutomationId(ctrl);
                    if (autoId == "WindowChromeOverlay" || autoId == "AvaloniaTitleBar")
                    {
                        ctrl.IsVisible = false;
                        ctrl.IsHitTestVisible = false;
                    }
                }
            }
        }

        private void EnableWindowsDwmAnimations()
        {
            if (OperatingSystem.IsWindows())
            {
                var platformHandle = this.TryGetPlatformHandle();
                if (platformHandle != null && platformHandle.Handle != IntPtr.Zero)
                {
                    const int GWL_STYLE = -16;
                    const long WS_CAPTION = 0x00C00000L;
                    const long WS_MINIMIZEBOX = 0x00020000L;
                    const long WS_MAXIMIZEBOX = 0x00010000L;
                    const long WS_THICKFRAME = 0x00040000L;

                    long style = (long)GetWindowLongPtr(platformHandle.Handle, GWL_STYLE);
                    style |= WS_CAPTION | WS_MINIMIZEBOX | WS_MAXIMIZEBOX | WS_THICKFRAME;
                    SetWindowLongPtr(platformHandle.Handle, GWL_STYLE, (IntPtr)style);
                }
            }
        }
    }
}
