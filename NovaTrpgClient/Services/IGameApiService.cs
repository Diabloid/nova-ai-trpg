using NovaTrpgClient.Models;
using System.Collections.Generic;
using System.Threading;
using System.Threading.Tasks;

namespace NovaTrpgClient.Services
{
    public interface IGameApiService
    {
        Task<PlayerState?> GetPlayerStateAsync(string sessionId = "default", CancellationToken cancellationToken = default);
        Task<ActionResponse?> SendActionAsync(ActionRequest request, CancellationToken cancellationToken = default);
        IAsyncEnumerable<SseEvent> StreamActionAsync(ActionRequest request, CancellationToken cancellationToken = default);
    }
}
