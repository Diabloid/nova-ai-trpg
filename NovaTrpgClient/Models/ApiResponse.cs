using Newtonsoft.Json;
using System.Collections.Generic;

namespace NovaTrpgClient.Models
{
    public class PlayerMeta
    {
        [JsonProperty("name")]
        public string Name { get; set; } = string.Empty;

        [JsonProperty("background")]
        public string Background { get; set; } = string.Empty;

        [JsonProperty("location")]
        public string Location { get; set; } = string.Empty;

        [JsonProperty("appearance")]
        public string Appearance { get; set; } = string.Empty;
    }

    public class Injury
    {
        [JsonProperty("location")]
        public string Location { get; set; } = string.Empty;

        [JsonProperty("type")]
        public string Type { get; set; } = string.Empty;

        // Властивість для зворотної сумісності (якщо прийде description або звернення з UI)
        [JsonProperty("description")]
        public string Description
        {
            get => !string.IsNullOrEmpty(Type) ? Type : _description;
            set => _description = value;
        }
        private string _description = string.Empty;
    }

    public class ItemInfo
    {
        [JsonProperty("name")]
        public string Name { get; set; } = string.Empty;

        [JsonProperty("desc")]
        public string Desc { get; set; } = string.Empty;
    }

    public class AbilityInfo
    {
        [JsonProperty("name")]
        public string Name { get; set; } = string.Empty;

        [JsonProperty("desc")]
        public string Desc { get; set; } = string.Empty;
    }

    public class AnatomyAndHealth
    {
        [JsonProperty("overall_state")]
        public string OverallState { get; set; } = string.Empty;

        [JsonProperty("injuries")]
        public List<Injury> Injuries { get; set; } = new();
    }

    public class StorageAndEquipment
    {
        [JsonProperty("worn")]
        public List<ItemInfo> Worn { get; set; } = new();

        [JsonProperty("containers")]
        public Dictionary<string, List<ItemInfo>> Containers { get; set; } = new();
    }

    public class PlayerState
    {
        [JsonProperty("meta")]
        public PlayerMeta Meta { get; set; } = new();

        [JsonProperty("anatomy_and_health")]
        public AnatomyAndHealth AnatomyAndHealth { get; set; } = new();

        [JsonProperty("storage_and_equipment")]
        public StorageAndEquipment StorageAndEquipment { get; set; } = new();

        [JsonProperty("abilities")]
        public List<AbilityInfo> Abilities { get; set; } = new();
    }

    public class ActionRequest
    {
        [JsonProperty("raw_text")]
        public string RawText { get; set; } = string.Empty;

        [JsonProperty("intents")]
        public List<IntentToken> Intents { get; set; } = new();

        [JsonProperty("session_id")]
        public string SessionId { get; set; } = "default";
    }

    public class ActionResponse
    {
        [JsonProperty("status")]
        public string Status { get; set; } = string.Empty;

        [JsonProperty("story")]
        public string Story { get; set; } = string.Empty;

        [JsonProperty("raw_llm_state")]
        public string? RawLlmState { get; set; }

        [JsonProperty("player_state")]
        public PlayerState? PlayerState { get; set; }

        [JsonProperty("error_message")]
        public string? ErrorMessage { get; set; }
    }

    public enum SseEventType
    {
        StoryChunk,
        StateAnalyzing,
        Complete,
        Error
    }

    public class SseEvent
    {
        public SseEventType Type { get; set; }
        public string? TextChunk { get; set; }
        public string? StatusMessage { get; set; }
        public ActionResponse? FinalResponse { get; set; }
        public string? ErrorMessage { get; set; }
    }
}
