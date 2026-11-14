from fastapi import APIRouter, UploadFile, File
from schemas.game_dto import VoiceTranscriptionResponse
from dependencies import llm_controller, logger

router = APIRouter(prefix="/api/v1/voice", tags=["Голосові сервіси"])


@router.post(
    "/transcribe",
    response_model=VoiceTranscriptionResponse,
    summary="Розпізнавання голосового запису гравця у текст дії (Voice-to-Text)"
)
async def transcribe_voice(file: UploadFile = File(..., description="Аудіофайл (WAV або OGG)")):
    try:
        audio_bytes = await file.read()
        if not audio_bytes:
            return VoiceTranscriptionResponse(text="")

        recognized_text = await llm_controller.transcribe_audio(
            audio_bytes=audio_bytes,
            filename=file.filename or "audio.wav",
            content_type=file.content_type
        )
        return VoiceTranscriptionResponse(text=recognized_text)
    except Exception as e:
        logger.error(f"❌ Помилка розпізнавання аудіо: {e}", exc_info=True)
        return VoiceTranscriptionResponse(text="")
