import { useCallback, useRef, useState } from 'react';
import { gameApi } from '../api/gameApi';
import { stripZeroWidth } from '../utils/novaSyntax';

interface UseVoiceRecorderOptions {
  onTranscribed: (text: string) => void;
  onError: (message: string) => void;
}

export function useVoiceRecorder({ onTranscribed, onError }: UseVoiceRecorderOptions) {
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);

  const startRecording = useCallback(async () => {
    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        onError('Аудіозапис не підтримується у цьому середовищі');
        return;
      }

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioChunksRef.current = [];

      const recorder = new MediaRecorder(stream);
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      recorder.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, {
          type: recorder.mimeType || 'audio/webm',
        });
        stream.getTracks().forEach((track) => track.stop());

        setIsTranscribing(true);
        try {
          const text = stripZeroWidth(await gameApi.transcribeAudio(audioBlob, 'recording.webm'));
          if (text) {
            onTranscribed(text);
          }
        } catch (err: unknown) {
          const message = err instanceof Error ? err.message : 'Невідома помилка';
          onError(`Помилка розпізнавання: ${message}`);
        } finally {
          setIsTranscribing(false);
        }
      };

      recorder.start();
      setIsRecording(true);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Невідома помилка';
      onError(`Не вдалося отримати доступ до мікрофона: ${message}`);
    }
  }, [onTranscribed, onError]);

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  }, [isRecording]);

  return {
    isRecording,
    isTranscribing,
    startRecording,
    stopRecording,
  };
}
