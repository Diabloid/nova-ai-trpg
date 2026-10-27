using System;
using System.Collections.Generic;
using System.Text.Json.Serialization;

namespace NovaTrpgClient.Models
{
    public class CharacterSummary
    {
        [JsonPropertyName("char_id")]
        public string CharId { get; set; } = string.Empty;

        [JsonPropertyName("name")]
        public string Name { get; set; } = string.Empty;

        [JsonPropertyName("background")]
        public string Background { get; set; } = string.Empty;

        [JsonPropertyName("appearance")]
        public string Appearance { get; set; } = string.Empty;

        [JsonPropertyName("created_at")]
        public string? CreatedAt { get; set; }
    }

    public class CampaignSummary
    {
        [JsonPropertyName("campaign_id")]
        public string CampaignId { get; set; } = string.Empty;

        [JsonPropertyName("char_id")]
        public string CharId { get; set; } = string.Empty;

        [JsonPropertyName("title")]
        public string Title { get; set; } = string.Empty;

        [JsonPropertyName("current_location")]
        public string CurrentLocation { get; set; } = string.Empty;

        [JsonPropertyName("is_pinned")]
        public bool IsPinned { get; set; }

        [JsonPropertyName("created_at")]
        public string? CreatedAt { get; set; }

        [JsonPropertyName("last_played")]
        public string? LastPlayed { get; set; }
    }

    public class HistoryMessage
    {
        [JsonPropertyName("role")]
        public string Role { get; set; } = string.Empty;

        [JsonPropertyName("text")]
        public string Text { get; set; } = string.Empty;

        [JsonPropertyName("timestamp")]
        public string? Timestamp { get; set; }
    }

    public class CreateCampaignRequest
    {
        [JsonPropertyName("title")]
        public string Title { get; set; } = string.Empty;
    }

    public class PinCampaignRequest
    {
        [JsonPropertyName("is_pinned")]
        public bool IsPinned { get; set; }
    }

    public class CharacterDialogRequest
    {
        [JsonPropertyName("message")]
        public string Message { get; set; } = string.Empty;

        [JsonPropertyName("history")]
        public List<string> History { get; set; } = new();
    }

    public class CharacterDialogResponse
    {
        [JsonPropertyName("reply")]
        public string Reply { get; set; } = string.Empty;
    }

    public class CharacterFinalizeRequest
    {
        [JsonPropertyName("dialog_summary")]
        public string DialogSummary { get; set; } = string.Empty;
    }

    public class SimpleStatusResponse
    {
        [JsonPropertyName("status")]
        public string Status { get; set; } = string.Empty;
    }
}
