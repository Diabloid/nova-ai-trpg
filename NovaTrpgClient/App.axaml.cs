using Avalonia;
using Avalonia.Controls.ApplicationLifetimes;
using Avalonia.Markup.Xaml;
using Microsoft.Extensions.DependencyInjection;
using NovaTrpgClient.Services;
using NovaTrpgClient.ViewModels;
using NovaTrpgClient.Views;
using System;

namespace NovaTrpgClient;

public partial class App : Application
{
    public static IServiceProvider Services { get; private set; } = null!;

    public override void Initialize()
    {
        AvaloniaXamlLoader.Load(this);
    }

    public override void OnFrameworkInitializationCompleted()
    {
        var services = new ServiceCollection();
        ConfigureServices(services);
        Services = services.BuildServiceProvider();

        if (ApplicationLifetime is IClassicDesktopStyleApplicationLifetime desktop)
        {
            desktop.MainWindow = new MainWindow
            {
                DataContext = Services.GetRequiredService<MainWindowViewModel>(),
            };
        }

        base.OnFrameworkInitializationCompleted();
    }

    private static void ConfigureServices(IServiceCollection services)
    {
        // Реєстрація типізованого HttpClient для комунікації з FastAPI бекендом
        services.AddHttpClient<IGameApiService, GameApiService>(client =>
        {
            client.BaseAddress = new Uri("http://127.0.0.1:8000/");
            client.Timeout = TimeSpan.FromSeconds(30);
        });

        // Реєстрація сервісів обробки тексту та намірів
        services.AddSingleton<IIntentParserService, IntentParserService>();
        services.AddSingleton<ITextSanitizerService, TextSanitizerService>();

        // Реєстрація ViewModels
        services.AddTransient<MainWindowViewModel>();
    }
}
