using System.Text.Json.Serialization;

namespace NovaTrpgClient.Models
{
    public class IntentToken
    {
        [JsonPropertyName("type")]
        public string Type { get; set; } = string.Empty;

        [JsonPropertyName("content")]
        public string Content { get; set; } = string.Empty;
    }
}
