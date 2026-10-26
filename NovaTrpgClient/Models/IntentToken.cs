using Newtonsoft.Json;

namespace NovaTrpgClient.Models
{
    public class IntentToken
    {
        [JsonProperty("type")]
        public string Type { get; set; } = string.Empty;

        [JsonProperty("content")]
        public string Content { get; set; } = string.Empty;
    }
}
