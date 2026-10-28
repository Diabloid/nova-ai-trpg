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
            try
            {
                var url = string.IsNullOrWhiteSpace(sessionId) || sessionId == "default"
                    ? "api/v1/state"
                    : $"api/v1/state?session_id={Uri.EscapeDataString(sessionId)}";

                var response = await _httpClient.GetAsync(url, cancellationToken);
                response.EnsureSuccessStatusCode();

                var json = await response.Content.ReadAsStringAsync(cancellationToken);
                return JsonSerializer.Deserialize<PlayerState>(json, JsonOptions);
            }
            catch (Exception ex)
            {
                System.Diagnostics.Debug.WriteLine($"[GetPlayerStateAsync error]: {ex.Message}");
                return null;
            }
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

        public async Task<List<CharacterSummary>> GetCharactersAsync(CancellationToken cancellationToken = default)
        {
            try
            {
                var response = await _httpClient.GetAsync("api/v1/characters", cancellationToken);
                if (!response.IsSuccessStatusCode) return new List<CharacterSummary>();

                var json = await response.Content.ReadAsStringAsync(cancellationToken);
                return JsonSerializer.Deserialize<List<CharacterSummary>>(json, JsonOptions) ?? new List<CharacterSummary>();
            }
            catch (Exception ex)
            {
                System.Diagnostics.Debug.WriteLine($"[GetCharactersAsync error]: {ex.Message}");
                return new List<CharacterSummary>();
            }
        }

        public async Task<PlayerState?> GetCharacterDetailsAsync(string charId, CancellationToken cancellationToken = default)
        {
            try
            {
                var response = await _httpClient.GetAsync($"api/v1/characters/{Uri.EscapeDataString(charId)}", cancellationToken);
                if (!response.IsSuccessStatusCode) return null;

                var json = await response.Content.ReadAsStringAsync(cancellationToken);
                return JsonSerializer.Deserialize<PlayerState>(json, JsonOptions);
            }
            catch (Exception ex)
            {
                System.Diagnostics.Debug.WriteLine($"[GetCharacterDetailsAsync error]: {ex.Message}");
                return null;
            }
        }

        public async Task<CharacterSummary?> CreateCharacterAsync(PlayerState character, CancellationToken cancellationToken = default)
        {
            try
            {
                var jsonContent = JsonSerializer.Serialize(character, JsonOptions);
                using var content = new StringContent(jsonContent, Encoding.UTF8, "application/json");

                var response = await _httpClient.PostAsync("api/v1/characters", content, cancellationToken);
                if (!response.IsSuccessStatusCode) return null;

                var json = await response.Content.ReadAsStringAsync(cancellationToken);
                return JsonSerializer.Deserialize<CharacterSummary>(json, JsonOptions);
            }
            catch (Exception ex)
            {
                System.Diagnostics.Debug.WriteLine($"[CreateCharacterAsync error]: {ex.Message}");
                return null;
            }
        }

        public async Task<PlayerState?> UpdateCharacterAsync(string charId, PlayerState character, CancellationToken cancellationToken = default)
        {
            try
            {
                var jsonContent = JsonSerializer.Serialize(character, JsonOptions);
                using var content = new StringContent(jsonContent, Encoding.UTF8, "application/json");

                var response = await _httpClient.PutAsync($"api/v1/characters/{Uri.EscapeDataString(charId)}", content, cancellationToken);
                if (!response.IsSuccessStatusCode) return null;

                var json = await response.Content.ReadAsStringAsync(cancellationToken);
                return JsonSerializer.Deserialize<PlayerState>(json, JsonOptions);
            }
            catch (Exception ex)
            {
                System.Diagnostics.Debug.WriteLine($"[UpdateCharacterAsync error]: {ex.Message}");
                return null;
            }
        }

        public async Task<bool> DeleteCharacterAsync(string charId, CancellationToken cancellationToken = default)
        {
            try
            {
                var response = await _httpClient.DeleteAsync($"api/v1/characters/{Uri.EscapeDataString(charId)}", cancellationToken);
                return response.IsSuccessStatusCode;
            }
            catch (Exception ex)
            {
                System.Diagnostics.Debug.WriteLine($"[DeleteCharacterAsync error]: {ex.Message}");
                return false;
            }
        }

        public async Task<List<CampaignSummary>> GetCampaignsAsync(string charId, CancellationToken cancellationToken = default)
        {
            try
            {
                var response = await _httpClient.GetAsync($"api/v1/characters/{Uri.EscapeDataString(charId)}/campaigns", cancellationToken);
                if (!response.IsSuccessStatusCode) return new List<CampaignSummary>();

                var json = await response.Content.ReadAsStringAsync(cancellationToken);
                return JsonSerializer.Deserialize<List<CampaignSummary>>(json, JsonOptions) ?? new List<CampaignSummary>();
            }
            catch (Exception ex)
            {
                System.Diagnostics.Debug.WriteLine($"[GetCampaignsAsync error]: {ex.Message}");
                return new List<CampaignSummary>();
            }
        }

        public async Task<CampaignSummary?> CreateCampaignAsync(string charId, string title, CancellationToken cancellationToken = default)
        {
            try
            {
                var req = new CreateCampaignRequest { Title = title };
                var jsonContent = JsonSerializer.Serialize(req, JsonOptions);
                using var content = new StringContent(jsonContent, Encoding.UTF8, "application/json");

                var response = await _httpClient.PostAsync($"api/v1/characters/{Uri.EscapeDataString(charId)}/campaigns", content, cancellationToken);
                if (!response.IsSuccessStatusCode) return null;

                var json = await response.Content.ReadAsStringAsync(cancellationToken);
                return JsonSerializer.Deserialize<CampaignSummary>(json, JsonOptions);
            }
            catch (Exception ex)
            {
                System.Diagnostics.Debug.WriteLine($"[CreateCampaignAsync error]: {ex.Message}");
                return null;
            }
        }

        public async Task<List<HistoryMessage>> GetCampaignHistoryAsync(string campaignId, CancellationToken cancellationToken = default)
        {
            try
            {
                var response = await _httpClient.GetAsync($"api/v1/campaigns/{Uri.EscapeDataString(campaignId)}/history", cancellationToken);
                if (!response.IsSuccessStatusCode) return new List<HistoryMessage>();

                var json = await response.Content.ReadAsStringAsync(cancellationToken);
                return JsonSerializer.Deserialize<List<HistoryMessage>>(json, JsonOptions) ?? new List<HistoryMessage>();
            }
            catch (Exception ex)
            {
                System.Diagnostics.Debug.WriteLine($"[GetCampaignHistoryAsync error]: {ex.Message}");
                return new List<HistoryMessage>();
            }
        }

        public async Task<CampaignSummary?> PinCampaignAsync(string campaignId, bool isPinned, CancellationToken cancellationToken = default)
        {
            try
            {
                var req = new PinCampaignRequest { IsPinned = isPinned };
                var jsonContent = JsonSerializer.Serialize(req, JsonOptions);
                using var content = new StringContent(jsonContent, Encoding.UTF8, "application/json");

                var requestMessage = new HttpRequestMessage(HttpMethod.Patch, $"api/v1/campaigns/{Uri.EscapeDataString(campaignId)}/pin")
                {
                    Content = content
                };

                var response = await _httpClient.SendAsync(requestMessage, cancellationToken);
                if (!response.IsSuccessStatusCode) return null;

                var json = await response.Content.ReadAsStringAsync(cancellationToken);
                return JsonSerializer.Deserialize<CampaignSummary>(json, JsonOptions);
            }
            catch (Exception ex)
            {
                System.Diagnostics.Debug.WriteLine($"[PinCampaignAsync error]: {ex.Message}");
                return null;
            }
        }

        public async Task<bool> DeleteCampaignAsync(string campaignId, CancellationToken cancellationToken = default)
        {
            try
            {
                var response = await _httpClient.DeleteAsync($"api/v1/campaigns/{Uri.EscapeDataString(campaignId)}", cancellationToken);
                return response.IsSuccessStatusCode;
            }
            catch (Exception ex)
            {
                System.Diagnostics.Debug.WriteLine($"[DeleteCampaignAsync error]: {ex.Message}");
                return false;
            }
        }

        public async Task<RollbackResponse?> RollbackTurnAsync(string campaignId, CancellationToken cancellationToken = default)
        {
            try
            {
                var response = await _httpClient.PostAsync($"api/v1/campaigns/{Uri.EscapeDataString(campaignId)}/rollback", null, cancellationToken);
                if (!response.IsSuccessStatusCode) return null;

                var json = await response.Content.ReadAsStringAsync(cancellationToken);
                return JsonSerializer.Deserialize<RollbackResponse>(json, JsonOptions);
            }
            catch (Exception ex)
            {
                System.Diagnostics.Debug.WriteLine($"[RollbackTurnAsync error]: {ex.Message}");
                return null;
            }
        }

        public async Task<CharacterDialogResponse?> SendCharacterDialogMessageAsync(string message, List<CharacterDialogHistoryItem> history, bool includeDraft = true, CancellationToken cancellationToken = default)
        {
            try
            {
                var req = new CharacterDialogRequest
                {
                    Message = message,
                    History = history,
                    IncludeDraft = includeDraft
                };
                var jsonContent = JsonSerializer.Serialize(req, JsonOptions);
                using var content = new StringContent(jsonContent, Encoding.UTF8, "application/json");

                var response = await _httpClient.PostAsync("api/v1/character/dialog", content, cancellationToken);
                if (!response.IsSuccessStatusCode) return null;

                var json = await response.Content.ReadAsStringAsync(cancellationToken);
                return JsonSerializer.Deserialize<CharacterDialogResponse>(json, JsonOptions);
            }
            catch (Exception ex)
            {
                System.Diagnostics.Debug.WriteLine($"[SendCharacterDialogMessageAsync error]: {ex.Message}");
                return null;
            }
        }

        public Task<CharacterDialogResponse?> SendCharacterDialogAsync(string message, List<CharacterDialogHistoryItem> history, bool includeDraft = true, CancellationToken cancellationToken = default)
        {
            return SendCharacterDialogMessageAsync(message, history, includeDraft, cancellationToken);
        }

        public async Task<PlayerState?> FinalizeCharacterAsync(string dialogSummary, CancellationToken cancellationToken = default)
        {
            try
            {
                var req = new CharacterFinalizeRequest { DialogSummary = dialogSummary };
                var jsonContent = JsonSerializer.Serialize(req, JsonOptions);
                using var content = new StringContent(jsonContent, Encoding.UTF8, "application/json");

                var response = await _httpClient.PostAsync("api/v1/character/finalize", content, cancellationToken);
                if (!response.IsSuccessStatusCode) return null;

                var json = await response.Content.ReadAsStringAsync(cancellationToken);
                return JsonSerializer.Deserialize<PlayerState>(json, JsonOptions);
            }
            catch (Exception ex)
            {
                System.Diagnostics.Debug.WriteLine($"[FinalizeCharacterAsync error]: {ex.Message}");
                return null;
            }
        }
    }
}
