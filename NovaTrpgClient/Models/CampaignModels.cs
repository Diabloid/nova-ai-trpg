using System;
using System.Collections.Generic;
using System.Text.Json.Serialization;
using CommunityToolkit.Mvvm.ComponentModel;

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

    public class CampaignSummary : ObservableObject
    {
        [JsonPropertyName("campaign_id")]
        public string CampaignId { get; set; } = string.Empty;

        [JsonPropertyName("char_id")]
        public string CharId { get; set; } = string.Empty;

        [JsonPropertyName("title")]
        public string Title { get; set; } = string.Empty;

        [JsonPropertyName("current_location")]
        public string CurrentLocation { get; set; } = string.Empty;

        private bool _isPinned;
        [JsonPropertyName("is_pinned")]
        public bool IsPinned
        {
            get => _isPinned;
            set => SetProperty(ref _isPinned, value);
        }

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

    public class CharacterDialogHistoryItem
    {
        [JsonPropertyName("role")]
        public string Role { get; set; } = string.Empty;

        [JsonPropertyName("content")]
        public string Content { get; set; } = string.Empty;
    }

    public class CharacterDialogRequest
    {
        [JsonPropertyName("message")]
        public string Message { get; set; } = string.Empty;

        [JsonPropertyName("history")]
        public List<CharacterDialogHistoryItem> History { get; set; } = new();

        [JsonPropertyName("include_draft")]
        public bool IncludeDraft { get; set; } = true;
    }

    public class CharacterDialogResponse
    {
        [JsonPropertyName("reply")]
        public string Reply { get; set; } = string.Empty;

        [JsonPropertyName("draft_state")]
        public PlayerState? DraftState { get; set; }
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
