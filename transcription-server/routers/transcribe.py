"""
Transcribe Router
文字起こしAPIルーター
"""

import os
import tempfile
from pathlib import Path
from typing import Dict, Any
from fastapi import APIRouter, File, UploadFile, HTTPException
from services.whisperx_service import WhisperXService, WhisperXError
from services.diarization_service import (
    DiarizationService,
    assign_speakers_to_segments,
    DiarizationError,
)

router = APIRouter()

# Initialize services (singleton pattern for model loading)
whisperx_service = None
diarization_service = None


def get_whisperx_service() -> WhisperXService:
    """Get or create WhisperX service instance"""
    global whisperx_service
    if whisperx_service is None:
        whisperx_service = WhisperXService(model_name="base", device="cpu")
    return whisperx_service


def get_diarization_service() -> DiarizationService:
    """Get or create diarization service instance"""
    global diarization_service
    if diarization_service is None:
        diarization_service = DiarizationService(device="cpu")
    return diarization_service


@router.post("/transcribe")
async def transcribe_audio(file: UploadFile = File(...)) -> Dict[str, Any]:
    """
    Transcribe audio file with speaker diarization

    Args:
        file: Audio file (WAV, MP3, M4A)

    Returns:
        JSON response with:
        - segments: List of transcription segments with speaker labels
        - language: Detected language
        - duration: Audio duration in seconds

    Raises:
        HTTPException: 400, 408, 500, 503 for various errors
    """
    temp_path = None

    try:
        # Validate file
        if not file.filename:
            raise HTTPException(status_code=400, detail="No filename provided")

        # Save uploaded file to temporary location
        with tempfile.NamedTemporaryFile(
            delete=False, suffix=Path(file.filename).suffix
        ) as temp_file:
            temp_path = temp_file.name
            content = await file.read()
            temp_file.write(content)

        # Step 1: Transcribe with WhisperX
        whisperx = get_whisperx_service()
        transcription_result = whisperx.transcribe(temp_path)

        # Step 2: Speaker diarization with pyannote.audio
        diarization = get_diarization_service()
        diarization_result = diarization.diarize(temp_path)

        # Step 3: Assign speakers to segments
        segments_with_speakers = assign_speakers_to_segments(
            transcription_result.segments, diarization_result
        )

        # Return combined result
        return {
            "segments": segments_with_speakers,
            "language": transcription_result.language,
            "duration": transcription_result.duration,
        }

    except FileNotFoundError as e:
        raise HTTPException(status_code=400, detail=f"File error: {str(e)}")

    except WhisperXError as e:
        raise HTTPException(
            status_code=500, detail=f"Transcription error: {str(e)}"
        )

    except DiarizationError as e:
        raise HTTPException(
            status_code=500, detail=f"Diarization error: {str(e)}"
        )

    except Exception as e:
        raise HTTPException(
            status_code=500, detail=f"Internal server error: {str(e)}"
        )

    finally:
        # Clean up temporary file
        if temp_path and os.path.exists(temp_path):
            try:
                os.unlink(temp_path)
            except Exception:
                pass  # Ignore cleanup errors
