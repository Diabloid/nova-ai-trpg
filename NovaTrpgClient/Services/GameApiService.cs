using Newtonsoft.Json;
using Newtonsoft.Json.Linq;
using NovaTrpgClient.Models;
using System;
using System.Collections.Generic;
using System.IO;
using System.Net.Http;
using System.Runtime.CompilerServices;
using System.Text;
using System.Threading;
using System.Threading.Tasks;

namespace NovaTrpgClient.Services
{
    public class GameApiService : IGameApiService
    {
        private readonly HttpClient _httpClient;

        public GameApiService(HttpClient httpClient)
        {
            _httpClient = httpClient;
        }

        public async Task<PlayerState?> GetPlayerStateAsync(string sessionId = "default", CancellationToken cancellationToken = default)
        {
            var url = string.IsNullOrWhiteSpace(sessionId) || sessionId == "default"
                ? "api/v1/state"
                : $"api/v1/state?session_id={Uri.EscapeDataString(sessionId)}";

            var response = await _httpClient.GetAsync(url, cancellationToken);
            response.EnsureSuccessStatusCode();

            var json = await response.Content.ReadAsStringAsync(cancellationToken);
            return JsonConvert.DeserializeObject<PlayerState>(json);
        }

        public async Task<ActionResponse?> SendActionAsync(ActionRequest request, CancellationToken cancellationToken = default)
        {
            var jsonContent = JsonConvert.SerializeObject(request);
            using var content = new StringContent(jsonContent, Encoding.UTF8, "application/json");

            var response = await _httpClient.PostAsync("api/v1/action", content, cancellationToken);
            response.EnsureSuccessStatusCode();

            var responseString = await response.Content.ReadAsStringAsync(cancellationToken);
            return JsonConvert.DeserializeObject<ActionResponse>(responseString);
        }

        public async IAsyncEnumerable<SseEvent> StreamActionAsync(
            ActionRequest request,
            [EnumeratorCancellation] CancellationToken cancellationToken = default)
        {
            var jsonContent = JsonConvert.SerializeObject(request);
            using var content = new StringContent(jsonContent, Encoding.UTF8, "application/json");

            var requestMessage = new HttpRequestMessage(HttpMethod.Post, "api/v1/action/stream")
            {
                Content = content
            };

            using var response = await _httpClient.SendAsync(
                requestMessage,
                HttpCompletionOption.ResponseHeadersRead,
                cancellationToken);

            response.EnsureSuccessStatusCode();

            using var stream = await response.Content.ReadAsStreamAsync(cancellationToken);
            using var reader = new StreamReader(stream, Encoding.UTF8);

            string? currentEvent = null;

            while (!cancellationToken.IsCancellationRequested)
            {
                var line = await reader.ReadLineAsync(cancellationToken);
                if (line == null) break;

                line = line.Trim();

                if (string.IsNullOrEmpty(line))
                {
                    currentEvent = null;
                    continue;
                }

                if (line.StartsWith("event:"))
                {
                    currentEvent = line.Substring(6).Trim();
                }
                else if (line.StartsWith("data:"))
                {
                    var dataStr = line.Substring(5).Trim();
                    if (string.IsNullOrEmpty(dataStr)) continue;

                    SseEvent? sseResult = null;

                    try
                    {
                        switch (currentEvent)
                        {
                            case "story_chunk":
                                var chunkObj = JObject.Parse(dataStr);
                                var chunkText = chunkObj["chunk"]?.ToString() ?? string.Empty;
                                sseResult = new SseEvent
                                {
                                    Type = SseEventType.StoryChunk,
                                    TextChunk = chunkText
                                };
                                break;

                            case "state_analyzing":
                                var statusObj = JObject.Parse(dataStr);
                                var msg = statusObj["message"]?.ToString() ?? "Аналізую зміни інвентарю та здоров'я...";
                                sseResult = new SseEvent
                                {
                                    Type = SseEventType.StateAnalyzing,
                                    StatusMessage = msg
                                };
                                break;

                            case "complete":
                                var completeResponse = JsonConvert.DeserializeObject<ActionResponse>(dataStr);
                                sseResult = new SseEvent
                                {
                                    Type = SseEventType.Complete,
                                    FinalResponse = completeResponse
                                };
                                break;

                            case "error":
                                var errorObj = JObject.Parse(dataStr);
                                var errMsg = errorObj["error_message"]?.ToString() ?? "Помилка стрімінгу";
                                sseResult = new SseEvent
                                {
                                    Type = SseEventType.Error,
                                    ErrorMessage = errMsg
                                };
                                break;
                        }
                    }
                    catch (Exception ex)
                    {
                        sseResult = new SseEvent
                        {
                            Type = SseEventType.Error,
                            ErrorMessage = $"Помилка парсингу SSE даних: {ex.Message}"
                        };
                    }

                    if (sseResult != null)
                    {
                        yield return sseResult;
                    }
                }
            }
        }
    }
}
