using System;
using System.IO;
using System.Text.Json;

namespace NovaTrpgClient.Services
{
    public class ClientStorageService : IClientStorageService
    {
        private static readonly JsonSerializerOptions JsonOptions = new()
        {
            WriteIndented = true,
            PropertyNameCaseInsensitive = true
        };

        private readonly string _filePath;
        private UserSettings _settings;

        public ClientStorageService()
        {
            _filePath = Path.Combine(AppContext.BaseDirectory, "user_settings.json");
            _settings = LoadSettings();
        }

        public UserSettings GetSettings() => _settings;

        public bool IsContainerExpanded(string containerName)
        {
            if (string.IsNullOrWhiteSpace(containerName)) return false;
            return _settings.ExpandedContainers.Contains(containerName);
        }

        public void SetContainerExpanded(string containerName, bool isExpanded)
        {
            if (string.IsNullOrWhiteSpace(containerName)) return;

            if (isExpanded)
            {
                _settings.ExpandedContainers.Add(containerName);
            }
            else
            {
                _settings.ExpandedContainers.Remove(containerName);
            }

            SaveSettings();
        }

        public void SaveSettings()
        {
            try
            {
                var json = JsonSerializer.Serialize(_settings, JsonOptions);
                File.WriteAllText(_filePath, json);
            }
            catch (Exception ex)
            {
                System.Diagnostics.Debug.WriteLine($"[ClientStorageService.Save error]: {ex.Message}");
            }
        }

        private UserSettings LoadSettings()
        {
            try
            {
                if (File.Exists(_filePath))
                {
                    var json = File.ReadAllText(_filePath);
                    return JsonSerializer.Deserialize<UserSettings>(json, JsonOptions) ?? new UserSettings();
                }
            }
            catch (Exception ex)
            {
                System.Diagnostics.Debug.WriteLine($"[ClientStorageService.Load error]: {ex.Message}");
            }

            return new UserSettings();
        }
    }
}
