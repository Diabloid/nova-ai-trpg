using System.Collections.Generic;

namespace NovaTrpgClient.Services
{
    public class UserSettings
    {
        public HashSet<string> ExpandedContainers { get; set; } = new();
        public string UserName { get; set; } = "Мандрівник";
        public string UserEmail { get; set; } = "cute_metalhead@nova.ai";
        public string SubscriptionStatus { get; set; } = "Без підписки";
        public string? LastSelectedCharId { get; set; }
        public string? LastSelectedCampaignId { get; set; }
    }

    public interface IClientStorageService
    {
        UserSettings GetSettings();
        void SetContainerExpanded(string containerName, bool isExpanded);
        bool IsContainerExpanded(string containerName);
        void SaveSettings();
    }
}
