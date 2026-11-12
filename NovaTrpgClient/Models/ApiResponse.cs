using System;
using System.Collections.Generic;
using System.Text.Json;
using System.Text.Json.Serialization;

namespace NovaTrpgClient.Models
{
    public class AppearanceDetails
    {
        [JsonPropertyName("physique")]
        public string Physique { get; set; } = string.Empty;

        [JsonPropertyName("height")]
        public string Height { get; set; } = string.Empty;

        [JsonPropertyName("eyes")]
        public string Eyes { get; set; } = string.Empty;

        [JsonPropertyName("hair")]
        public string Hair { get; set; } = string.Empty;

        [JsonPropertyName("race_traits")]
        public string RaceTraits { get; set; } = string.Empty;

        [JsonExtensionData]
        public Dictionary<string, JsonElement>? ExtraDetails { get; set; }
    }

    public class PlayerMeta
    {
        [JsonPropertyName("name")]
        public string Name { get; set; } = string.Empty;

        [JsonPropertyName("first_name")]
        public string? FirstName { get; set; }

        [JsonPropertyName("last_name")]
        public string? LastName { get; set; }

        [JsonPropertyName("patronymic")]
        public string? Patronymic { get; set; }

        [JsonPropertyName("titles")]
        public object? TitlesRaw { get; set; }

        [JsonIgnore]
        public string Titles
        {
            get
            {
                if (TitlesRaw is JsonElement elem)
                {
                    if (elem.ValueKind == JsonValueKind.String)
                        return elem.GetString() ?? "";
                    if (elem.ValueKind == JsonValueKind.Array)
                    {
                        var list = new List<string>();
                        foreach (var it in elem.EnumerateArray())
                        {
                            var s = it.GetString();
                            if (!string.IsNullOrEmpty(s)) list.Add(s);
                        }
                        return string.Join(", ", list);
                    }
                }
                return TitlesRaw?.ToString() ?? "";
            }
            set => TitlesRaw = value;
        }

        [JsonPropertyName("age")]
        public object? AgeRaw { get; set; }

        [JsonIgnore]
        public string Age
        {
            get
            {
                if (AgeRaw is JsonElement elem)
                {
                    if (elem.ValueKind == JsonValueKind.String)
                        return elem.GetString() ?? "";
                    if (elem.ValueKind == JsonValueKind.Number)
                        return elem.ToString();
                }
                return AgeRaw?.ToString() ?? "";
            }
            set => AgeRaw = value;
        }

        [JsonPropertyName("background")]
        public string Background { get; set; } = string.Empty;

        [JsonPropertyName("location")]
        public string Location { get; set; } = string.Empty;

        [JsonPropertyName("appearance")]
        public string Appearance { get; set; } = string.Empty;

        [JsonPropertyName("appearance_details")]
        public AppearanceDetails AppearanceDetails { get; set; } = new();

        [JsonPropertyName("biography")]
        public string Biography { get; set; } = string.Empty;

        [JsonExtensionData]
        public Dictionary<string, JsonElement>? ExtraMeta { get; set; }
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

        [JsonPropertyName("custom_blocks")]
        public Dictionary<string, JsonElement> CustomBlocks { get; set; } = new();

        [JsonExtensionData]
        public Dictionary<string, JsonElement>? ExtraProperties { get; set; }
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
