using NovaTrpgClient.Models;
using System.Collections.Generic;

namespace NovaTrpgClient.Services
{
    public interface IIntentParserService
    {
        List<IntentToken> ParseIntents(string rawAction);
        string CleanDisplayAction(string rawAction);
    }
}
