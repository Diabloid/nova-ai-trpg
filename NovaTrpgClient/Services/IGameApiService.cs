using NovaTrpgClient.Models;
using System.Collections.Generic;
using System.Threading;
using System.Threading.Tasks;

namespace NovaTrpgClient.Services
{
    public interface IGameApiService
    {
        // Стан гравця та ігровий цикл
        Task<PlayerState?> GetPlayerStateAsync(string sessionId = "default", CancellationToken cancellationToken = default);
        Task<ActionResponse?> SendActionAsync(ActionRequest request, CancellationToken cancellationToken = default);
        IAsyncEnumerable<SseEvent> StreamActionAsync(ActionRequest request, CancellationToken cancellationToken = default);

        // Керування персонажами (Blueprints)
        Task<List<CharacterSummary>> GetCharactersAsync(CancellationToken cancellationToken = default);
        Task<PlayerState?> GetCharacterDetailsAsync(string charId, CancellationToken cancellationToken = default);
        Task<CharacterSummary?> CreateCharacterAsync(PlayerState character, CancellationToken cancellationToken = default);
        Task<PlayerState?> UpdateCharacterAsync(string charId, PlayerState character, CancellationToken cancellationToken = default);
        Task<bool> DeleteCharacterAsync(string charId, CancellationToken cancellationToken = default);

        // Керування кампаніями (Campaigns)
        Task<List<CampaignSummary>> GetCampaignsAsync(string charId, CancellationToken cancellationToken = default);
        Task<CampaignSummary?> CreateCampaignAsync(string charId, string title, CancellationToken cancellationToken = default);
        Task<List<HistoryMessage>> GetCampaignHistoryAsync(string campaignId, CancellationToken cancellationToken = default);
        Task<CampaignSummary?> PinCampaignAsync(string campaignId, bool isPinned, CancellationToken cancellationToken = default);
        Task<bool> DeleteCampaignAsync(string campaignId, CancellationToken cancellationToken = default);

        // Створення героя з AI (Character Wizard) з еластичним Live Preview драфтом
        Task<CharacterDialogResponse?> SendCharacterDialogMessageAsync(string message, List<CharacterDialogHistoryItem> history, bool includeDraft = true, CancellationToken cancellationToken = default);
        Task<CharacterDialogResponse?> SendCharacterDialogAsync(string message, List<CharacterDialogHistoryItem> history, bool includeDraft = true, CancellationToken cancellationToken = default);
        Task<PlayerState?> FinalizeCharacterAsync(string dialogSummary, CancellationToken cancellationToken = default);
    }
}
