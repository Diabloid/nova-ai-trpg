using System;
using System.Threading.Tasks;

namespace NovaTrpgClient.Services
{
    public interface IAudioRecordingService
    {
        bool IsRecording { get; }
        bool IsSupported { get; }
        void StartRecording();
        Task<byte[]> StopRecordingAsync();
    }
}
