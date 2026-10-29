using NovaTrpgClient.Models;
using System.Collections.Generic;
using System.Text.RegularExpressions;

namespace NovaTrpgClient.Services
{
    public class IntentParserService : IIntentParserService
    {
        private static readonly Regex ActionRegex = new(@"(?<!\\)\*\*(?![\u200B])(.*?)(?<!\\)\*\*", RegexOptions.Compiled);
        private static readonly Regex ThoughtRegex = new(@"(?<!\\)\""(?![\u200B])(.*?)(?<!\\)\""", RegexOptions.Compiled);
        private static readonly Regex OocRegex = new(@"(?<!\\)\((?![\u200B])(.*?)(?<!\\)\)", RegexOptions.Compiled);
        private static readonly Regex SpeechRegex = new(@"(?<!\\)[\-\u2013\u2014](?![\u200B])(.*)$", RegexOptions.Compiled | RegexOptions.Multiline);

        public List<IntentToken> ParseIntents(string rawAction)
        {
            var intents = new List<IntentToken>();
            if (string.IsNullOrWhiteSpace(rawAction))
            {
                return intents;
            }

            foreach (Match m in ActionRegex.Matches(rawAction))
            {
                intents.Add(new IntentToken { Type = "action", Content = m.Groups[1].Value.Trim() });
            }

            foreach (Match m in ThoughtRegex.Matches(rawAction))
            {
                intents.Add(new IntentToken { Type = "thought", Content = m.Groups[1].Value.Trim() });
            }

            foreach (Match m in OocRegex.Matches(rawAction))
            {
                intents.Add(new IntentToken { Type = "ooc", Content = m.Groups[1].Value.Trim() });
            }

            foreach (Match m in SpeechRegex.Matches(rawAction))
            {
                intents.Add(new IntentToken { Type = "speech", Content = m.Groups[1].Value.Trim() });
            }

            return intents;
        }

        public string CleanDisplayAction(string rawAction)
        {
            if (string.IsNullOrEmpty(rawAction))
            {
                return string.Empty;
            }

            return rawAction
                .Replace("**", "") // Приховуємо сирі зірочки для чистого відображення
                .Replace(@"\*\*", "")
                .Replace(@"\""", "\"")
                .Replace(@"\(", "(")
                .Replace(@"\)", ")")
                .Replace(@"\-", "-")
                .Replace("\u200B", "")
                .Trim();
        }
    }
}
