using NovaTrpgClient.Models;
using System.Threading;
using System.Threading.Tasks;

namespace NovaTrpgClient.Services
{
    public interface IGameApiService
    {
        Task<PlayerState?> GetPlayerStateAsync(CancellationToken cancellationToken = default);
        Task<ActionResponse?> SendActionAsync(ActionRequest request, CancellationToken cancellationToken = default);
    }
}
