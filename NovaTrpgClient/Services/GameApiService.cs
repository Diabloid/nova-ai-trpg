using Newtonsoft.Json;
using NovaTrpgClient.Models;
using System;
using System.Net.Http;
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

        public async Task<PlayerState?> GetPlayerStateAsync(CancellationToken cancellationToken = default)
        {
            var response = await _httpClient.GetAsync("api/v1/state", cancellationToken);
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
    }
}
