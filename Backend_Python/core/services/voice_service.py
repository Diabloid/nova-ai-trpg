import os
import sys
import base64
import re
from typing import Optional
import httpx

# Безпечне кодування консолі для Windows
if sys.stdout and hasattr(sys.stdout, "reconfigure"):
    try:
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass


class VoiceService:
    """
    Сервіс голосового розпізнавання (Voice-to-Text, v1.5.0):
    Підтримує каскадну транскрипцію:
    1. Через мультимодальні ШІ-моделі (input_audio в Gemini Flash через Odirouter).
    2. Резервний виклик стандартного OpenAI-сумісного Audio Transcription API (Whisper/Groq), якщо вказано ключ/URL.
    """
    def __init__(self, api_key: Optional[str] = None, base_url: Optional[str] = None):
        self.api_key = api_key or os.getenv("ODIROUTER_API_KEY")
        self.base_url = base_url or os.getenv("ODIROUTER_BASE_URL", "https://api.odirouter.ai/v1")

    async def transcribe_audio(
        self,
        audio_bytes: bytes,
        filename: str = "audio.wav",
        content_type: Optional[str] = None
    ) -> str:
        """
        Перетворює аудіофайл (WAV, OGG, MP3) у розпізнаний текст дії гравця.
        """
        if not audio_bytes:
            return ""

        # Визначаємо формат аудіо
        fname_lower = filename.lower()
        if fname_lower.endswith(".ogg") or (content_type and "ogg" in content_type):
            audio_format = "ogg"
        elif fname_lower.endswith(".mp3") or (content_type and "mpeg" in content_type):
            audio_format = "mp3"
        elif fname_lower.endswith(".flac") or (content_type and "flac" in content_type):
            audio_format = "flac"
        else:
            audio_format = "wav"

        # 1. Мультимодальна транскрипція через Odirouter (Gemini Flash / Flash-Lite)
        text = await self._transcribe_via_multimodal(audio_bytes, audio_format)
        if text:
            return text

        # 2. Резерв через OpenAI-сумісний Whisper API (якщо налаштовано окремий Whisper URL)
        whisper_url = os.getenv("WHISPER_BASE_URL")
        whisper_key = os.getenv("WHISPER_API_KEY") or self.api_key
        if whisper_url and whisper_key:
            text = await self._transcribe_via_whisper(audio_bytes, filename, whisper_url, whisper_key)
            if text:
                return text

        return ""

    async def _transcribe_via_multimodal(self, audio_bytes: bytes, audio_format: str) -> str:
        """Транскрипція через input_audio в OpenAI-сумісному інтерфейсі Odirouter."""
        if not self.api_key:
            print("⚠️ [VoiceService] ODIROUTER_API_KEY відсутній.")
            return ""

        b64_audio = base64.b64encode(audio_bytes).decode("utf-8")
        models_to_try = [
            "free-gemini-3-flash-preview",
            "free-gemini-3.1-flash-lite",
            "free-gemini-2.5-flash"
        ]

        endpoint = f"{self.base_url.rstrip('/')}/chat/completions"
        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json"
        }

        system_instruction = (
            "Ти — професійний модуль розпізнавання мови для текстової рольової гри. "
            "Твоє завдання: ТОЧНО транскрибувати вимовлені в аудіо слова, репліку або дію гравця. "
            "Правила:\n"
            "1. Поверни ВИКЛЮЧНО розпізнаний текст без лапок, пояснень чи вступів.\n"
            "2. Якщо в аудіо немає чіткої людської мови (тиша, шум, подих, фонові звуки) — поверни порожній рядок.\n"
            "3. Зберігай мову оригіналу (українська/англійська)."
        )

        for model in models_to_try:
            payload = {
                "model": model,
                "messages": [
                    {
                        "role": "user",
                        "content": [
                            {"type": "text", "text": system_instruction},
                            {
                                "type": "input_audio",
                                "input_audio": {
                                    "data": b64_audio,
                                    "format": audio_format
                                }
                            }
                        ]
                    }
                ],
                "temperature": 0.0,
                "max_tokens": 400
            }

            try:
                async with httpx.AsyncClient(timeout=25.0) as client:
                    resp = await client.post(endpoint, headers=headers, json=payload)
                    if resp.status_code == 200:
                        data = resp.json()
                        choices = data.get("choices", [])
                        if choices:
                            raw_content = choices[0].get("message", {}).get("content", "") or ""
                            clean_text = self._sanitize_transcription(raw_content)
                            if clean_text:
                                print(f"🎙️ [VoiceService] Успішно розпізнано через {model}: '{clean_text}'")
                                return clean_text
                            return ""
                    else:
                        print(f"⚠️ [VoiceService] Модель {model} повернула статус {resp.status_code}: {resp.text[:120]}")
            except Exception as e:
                print(f"⚠️ [VoiceService] Помилка мультимодальної транскрипції на {model}: {e}")

        return ""

    async def _transcribe_via_whisper(
        self,
        audio_bytes: bytes,
        filename: str,
        whisper_url: str,
        whisper_key: str
    ) -> str:
        """Транскрипція через класичний Whisper endpoint /audio/transcriptions."""
        endpoint = f"{whisper_url.rstrip('/')}/audio/transcriptions"
        headers = {"Authorization": f"Bearer {whisper_key}"}

        try:
            files = {"file": (filename, audio_bytes)}
            data = {"model": "whisper-1"}
            async with httpx.AsyncClient(timeout=30.0) as client:
                resp = await client.post(endpoint, headers=headers, data=data, files=files)
                if resp.status_code == 200:
                    result = resp.json()
                    raw_text = result.get("text", "")
                    return self._sanitize_transcription(raw_text)
                else:
                    print(f"⚠️ [VoiceService] Whisper API статус {resp.status_code}: {resp.text[:120]}")
        except Exception as e:
            print(f"⚠️ [VoiceService] Помилка Whisper API: {e}")

        return ""

    def _sanitize_transcription(self, text: str) -> str:
        """Очищення тексту від шумів, артефактів та лапок."""
        if not text:
            return ""

        t = text.strip()
        # Якщо модель повертає артефакти на кшталт <noise>, [тиша], (шум)
        if re.fullmatch(r"^[<\[\(].*?[>\]\)]$", t):
            return ""

        # Зняття зовнішніх лапок
        if (t.startswith('"') and t.endswith('"')) or (t.startswith('«') and t.endswith('»')):
            t = t[1:-1].strip()

        return t
