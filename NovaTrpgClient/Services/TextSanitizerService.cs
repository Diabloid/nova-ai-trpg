using System.Text.RegularExpressions;

namespace NovaTrpgClient.Services
{
    public class TextSanitizerService : ITextSanitizerService
    {
        private static readonly Regex BrokenWordRegex = new(@"(?<=\p{L})\n+(?=\p{Ll})", RegexOptions.Compiled);
        private static readonly Regex BrokenPunctuationRegex = new(@"(?<=\S)\n+(?=[.,!?:;])", RegexOptions.Compiled);
        private static readonly Regex BrokenSentenceRegex = new(@"\s*\n+\s*(?=\p{Ll})", RegexOptions.Compiled);
        private static readonly Regex ParagraphRegex = new(@"\n{2,}", RegexOptions.Compiled);

        public string SanitizeStory(string rawStory)
        {
            if (string.IsNullOrEmpty(rawStory))
            {
                return string.Empty;
            }

            // 1. Уніфікуємо переноси рядків
            string cleanStory = rawStory.Replace("\r\n", "\n").Replace("\r", "\n");

            // 2. Зшиваємо розірвані слова ("Х\n\nолодний" -> "Холодний")
            cleanStory = BrokenWordRegex.Replace(cleanStory, "");

            // 3. Зшиваємо відірвану пунктуацію ("наверші\n\n." -> "наверші.")
            cleanStory = BrokenPunctuationRegex.Replace(cleanStory, "");

            // 4. Зшиваємо розірвані речення
            cleanStory = BrokenSentenceRegex.Replace(cleanStory, " ");

            // 5. Зберігаємо справжні абзаци (2+ нових рядків)
            cleanStory = ParagraphRegex.Replace(cleanStory, "◄PARAGRAPH►");

            // 6. Будь-які залишкові одинарні переноси міняємо на пробіл
            cleanStory = cleanStory.Replace("\n", " ");

            // 7. Повертаємо абзаци
            cleanStory = cleanStory.Replace("◄PARAGRAPH►", "\n\n");

            return cleanStory.Trim();
        }
    }
}
