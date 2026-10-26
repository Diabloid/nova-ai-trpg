using NovaTrpgClient.Models;
using System;
using System.Collections.Generic;
using System.IO;
using System.Net.Http;
using System.Runtime.CompilerServices;
using System.Text;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;

namespace NovaTrpgClient.Services
{
    public class GameApiService : IGameApiService
    {
        private static readonly JsonSerializerOptions JsonOptions = new()
        {
            PropertyNameCaseInsensitive = true
        };

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
            return JsonSerializer.Deserialize<PlayerState>(json, JsonOptions);
        }

        public async Task<ActionResponse?> SendActionAsync(ActionRequest request, CancellationToken cancellationToken = default)
        {
            var jsonContent = JsonSerializer.Serialize(request, JsonOptions);
            using var content = new StringContent(jsonContent, Encoding.UTF8, "application/json");

            var response = await _httpClient.PostAsync("api/v1/action", content, cancellationToken);
            response.EnsureSuccessStatusCode();

            var responseString = await response.Content.ReadAsStringAsync(cancellationToken);
            return JsonSerializer.Deserialize<ActionResponse>(responseString, JsonOptions);
        }

        public async IAsyncEnumerable<SseEvent> StreamActionAsync(
            ActionRequest request,
            [EnumeratorCancellation] CancellationToken cancellationToken = default)
        {
            var jsonContent = JsonSerializer.Serialize(request, JsonOptions);
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
                                using (var doc = JsonDocument.Parse(dataStr))
                                {
                                    var chunkText = doc.RootElement.TryGetProperty("chunk", out var p) ? p.GetString() ?? string.Empty : string.Empty;
                                    sseResult = new SseEvent
                                    {
                                        Type = SseEventType.StoryChunk,
                                        TextChunk = chunkText
                                    };
                                }
                                break;

                            case "state_analyzing":
                                using (var doc = JsonDocument.Parse(dataStr))
                                {
                                    var msg = doc.RootElement.TryGetProperty("message", out var p)
                                        ? p.GetString() ?? "Аналізую зміни інвентарю та здоров'я..."
                                        : "Аналізую зміни інвентарю та здоров'я...";
                                    sseResult = new SseEvent
                                    {
                                        Type = SseEventType.StateAnalyzing,
                                        StatusMessage = msg
                                    };
                                }
                                break;

                            case "complete":
                                var completeResponse = JsonSerializer.Deserialize<ActionResponse>(dataStr, JsonOptions);
                                sseResult = new SseEvent
                                {
                                    Type = SseEventType.Complete,
                                    FinalResponse = completeResponse
                                };
                                break;

                            case "error":
                                using (var doc = JsonDocument.Parse(dataStr))
                                {
                                    var errMsg = doc.RootElement.TryGetProperty("error_message", out var p)
                                        ? p.GetString() ?? "Помилка стрімінгу"
                                        : "Помилка стрімінгу";
                                    sseResult = new SseEvent
                                    {
                                        Type = SseEventType.Error,
                                        ErrorMessage = errMsg
                                    };
                                }
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
