using Avalonia;
using Avalonia.Controls.ApplicationLifetimes;
using Avalonia.Markup.Xaml;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using NovaTrpgClient.Services;
using NovaTrpgClient.ViewModels;
using NovaTrpgClient.Views;
using System;
using System.IO;

namespace NovaTrpgClient;

public partial class App : Application
{
    public static IServiceProvider Services { get; private set; } = null!;
    public static IConfiguration Configuration { get; private set; } = null!;

    public override void Initialize()
    {
        AvaloniaXamlLoader.Load(this);
    }

    public override void OnFrameworkInitializationCompleted()
    {
        // Побудова конфігурації з appsettings.json
        Configuration = new ConfigurationBuilder()
            .SetBasePath(AppContext.BaseDirectory)
            .AddJsonFile("appsettings.json", optional: true, reloadOnChange: true)
            .Build();

        var services = new ServiceCollection();
        ConfigureServices(services, Configuration);
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

    private static void ConfigureServices(IServiceCollection services, IConfiguration configuration)
    {
        services.AddSingleton<IConfiguration>(configuration);

        // Отримання базової адреси бекенду з appsettings.json без хардкоду
        var baseUrl = configuration["GameApi:BaseUrl"] ?? "http://127.0.0.1:8000/";
        if (!baseUrl.EndsWith('/'))
        {
            baseUrl += "/";
        }

        int timeoutSeconds = int.TryParse(configuration["GameApi:TimeoutSeconds"], out var t) ? t : 60;

        // Реєстрація типізованого HttpClient для комунікації з FastAPI бекендом
        services.AddHttpClient<IGameApiService, GameApiService>(client =>
        {
            client.BaseAddress = new Uri(baseUrl);
            client.Timeout = TimeSpan.FromSeconds(timeoutSeconds);
        });

        // Реєстрація сервісів обробки тексту, намірів та локального сховища
        services.AddSingleton<IIntentParserService, IntentParserService>();
        services.AddSingleton<ITextSanitizerService, TextSanitizerService>();
        services.AddSingleton<IClientStorageService, ClientStorageService>();

        // Реєстрація ViewModels
        services.AddTransient<MainWindowViewModel>();
    }
}
