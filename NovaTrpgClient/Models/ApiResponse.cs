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

        [JsonProperty("description")]
        public string Description { get; set; } = string.Empty;
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
        public List<string> Worn { get; set; } = new();

        [JsonProperty("containers")]
        public Dictionary<string, List<string>> Containers { get; set; } = new();
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
        public List<string> Abilities { get; set; } = new();
    }

    public class ActionRequest
    {
        [JsonProperty("raw_text")]
        public string RawText { get; set; } = string.Empty;

        [JsonProperty("intents")]
        public List<IntentToken> Intents { get; set; } = new();
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
}
