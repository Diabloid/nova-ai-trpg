using System.Collections.Generic;
using System.Text.Json.Serialization;

namespace NovaTrpgClient.Models
{
    public class PlayerMeta
    {
        [JsonPropertyName("name")]
        public string Name { get; set; } = string.Empty;

        [JsonPropertyName("background")]
        public string Background { get; set; } = string.Empty;

        [JsonPropertyName("location")]
        public string Location { get; set; } = string.Empty;

        [JsonPropertyName("appearance")]
        public string Appearance { get; set; } = string.Empty;
    }

    public class Injury
    {
        [JsonPropertyName("location")]
        public string Location { get; set; } = string.Empty;

        [JsonPropertyName("type")]
        public string Type { get; set; } = string.Empty;

        [JsonPropertyName("description")]
        public string? RawDescription { get; set; }

        [JsonIgnore]
        public string Description
        {
            get => !string.IsNullOrEmpty(Type) ? Type : (RawDescription ?? string.Empty);
            set => Type = value;
        }
    }

    public class ItemInfo
    {
        [JsonPropertyName("name")]
        public string Name { get; set; } = string.Empty;

        [JsonPropertyName("desc")]
        public string Desc { get; set; } = string.Empty;
    }

    public class AbilityInfo
    {
        [JsonPropertyName("name")]
        public string Name { get; set; } = string.Empty;

        [JsonPropertyName("desc")]
        public string Desc { get; set; } = string.Empty;
    }

    public class AnatomyAndHealth
    {
        [JsonPropertyName("overall_state")]
        public string OverallState { get; set; } = string.Empty;

        [JsonPropertyName("injuries")]
        public List<Injury> Injuries { get; set; } = new();
    }

    public class StorageAndEquipment
    {
        [JsonPropertyName("worn")]
        public List<ItemInfo> Worn { get; set; } = new();

        [JsonPropertyName("containers")]
        public Dictionary<string, List<ItemInfo>> Containers { get; set; } = new();
    }

    public class PlayerState
    {
        [JsonPropertyName("meta")]
        public PlayerMeta Meta { get; set; } = new();

        [JsonPropertyName("anatomy_and_health")]
        public AnatomyAndHealth AnatomyAndHealth { get; set; } = new();

        [JsonPropertyName("storage_and_equipment")]
        public StorageAndEquipment StorageAndEquipment { get; set; } = new();

        [JsonPropertyName("abilities")]
        public List<AbilityInfo> Abilities { get; set; } = new();
    }

    public class ActionRequest
    {
        [JsonPropertyName("raw_text")]
        public string RawText { get; set; } = string.Empty;

        [JsonPropertyName("intents")]
        public List<IntentToken> Intents { get; set; } = new();

        [JsonPropertyName("session_id")]
        public string SessionId { get; set; } = "default";
    }

    public class ActionResponse
    {
        [JsonPropertyName("status")]
        public string Status { get; set; } = string.Empty;

        [JsonPropertyName("story")]
        public string Story { get; set; } = string.Empty;

        [JsonPropertyName("raw_llm_state")]
        public string? RawLlmState { get; set; }

        [JsonPropertyName("player_state")]
        public PlayerState? PlayerState { get; set; }

        [JsonPropertyName("error_message")]
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
