namespace NovaTrpgClient.Services
{
    public interface ITextSanitizerService
    {
        string SanitizeStory(string rawStory);
    }
}
