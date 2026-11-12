using System;
using System.IO;
using System.Threading.Tasks;
using NAudio.Wave;

namespace NovaTrpgClient.Services
{
    public class AudioRecordingService : IAudioRecordingService, IDisposable
    {
        private WaveIn? _waveIn;
        private MemoryStream? _outputStream;
        private WaveFileWriter? _writer;
        private readonly object _lock = new();

        public bool IsRecording { get; private set; }

        public bool IsSupported
        {
            get
            {
                if (!OperatingSystem.IsWindows()) return false;
                try
                {
                    return WaveIn.DeviceCount > 0;
                }
                catch
                {
                    return false;
                }
            }
        }

        public void StartRecording()
        {
            if (!OperatingSystem.IsWindows())
            {
                throw new PlatformNotSupportedException("Запис аудіо підтримується на Windows.");
            }

            lock (_lock)
            {
                if (IsRecording) return;
                if (!IsSupported)
                {
                    throw new InvalidOperationException("Мікрофон не виявлено або пристрої запису звуку відсутні.");
                }

                _outputStream = new MemoryStream();
                // 16 000 Гц, 16 біт, Моно — стандарт високої точності для розпізнавання Whisper
                var waveFormat = new WaveFormat(16000, 16, 1);
                _writer = new WaveFileWriter(_outputStream, waveFormat);

                _waveIn = new WaveIn
                {
                    WaveFormat = waveFormat,
                    BufferMilliseconds = 100
                };

                _waveIn.DataAvailable += (s, e) =>
                {
                    lock (_lock)
                    {
                        if (_writer != null && e.BytesRecorded > 0)
                        {
                            _writer.Write(e.Buffer, 0, e.BytesRecorded);
                        }
                    }
                };

                _waveIn.StartRecording();
                IsRecording = true;
            }
        }

        public Task<byte[]> StopRecordingAsync()
        {
            byte[] result = Array.Empty<byte>();

            if (!OperatingSystem.IsWindows())
            {
                return Task.FromResult(result);
            }

            WaveIn? waveInToStop = null;
            lock (_lock)
            {
                if (!IsRecording) return Task.FromResult(result);
                IsRecording = false;
                waveInToStop = _waveIn;
            }

            // Зупиняємо запис ПОЗА lock, щоб усунути будь-який ризик взаємного блокування (deadlock) з потоком DataAvailable
            try
            {
                waveInToStop?.StopRecording();
            }
            catch (Exception ex)
            {
                System.Diagnostics.Debug.WriteLine($"[WaveIn StopRecording warning]: {ex.Message}");
            }

            lock (_lock)
            {
                try
                {
                    _writer?.Flush();
                    _writer?.Dispose();
                    _writer = null;

                    if (_outputStream != null)
                    {
                        result = _outputStream.ToArray();
                        _outputStream.Dispose();
                        _outputStream = null;
                    }
                }
                catch (Exception ex)
                {
                    System.Diagnostics.Debug.WriteLine($"[Audio buffer flush error]: {ex.Message}");
                }

                waveInToStop?.Dispose();
                _waveIn = null;
            }

            return Task.FromResult(result);
        }

        public void Dispose()
        {
            if (!OperatingSystem.IsWindows()) return;

            WaveIn? waveInToStop = null;
            lock (_lock)
            {
                if (IsRecording)
                {
                    IsRecording = false;
                    waveInToStop = _waveIn;
                }
            }

            try
            {
                waveInToStop?.StopRecording();
            }
            catch { }

            lock (_lock)
            {
                _writer?.Dispose();
                _outputStream?.Dispose();
                waveInToStop?.Dispose();
                _waveIn?.Dispose();
                _writer = null;
                _outputStream = null;
                _waveIn = null;
                IsRecording = false;
            }
        }
    }
}
