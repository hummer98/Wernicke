"""
WhisperX Transcription Service
WhisperX文字起こしサービス
"""

import os
from pathlib import Path
from typing import List, Dict, Any, Optional
from dataclasses import dataclass


@dataclass
class TranscriptionResult:
    """Transcription result data class"""

    segments: List[Dict[str, Any]]
    language: str
    duration: float

    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary"""
        return {
            "segments": self.segments,
            "language": self.language,
            "duration": self.duration,
        }

    @classmethod
    def from_whisperx_output(
        cls, whisperx_output: Dict[str, Any], duration: float
    ) -> "TranscriptionResult":
        """Create from WhisperX output"""
        return cls(
            segments=whisperx_output.get("segments", []),
            language=whisperx_output.get("language", "unknown"),
            duration=duration,
        )


class WhisperXService:
    """
    WhisperX Transcription Service

    Note: This is a mock implementation for development on Mac.
    On CUDA server, this will use actual WhisperX with GPU acceleration.
    """

    def __init__(
        self,
        model_name: str = "base",
        device: str = "cpu",
        batch_size: int = 16,
        compute_type: str = "int8",
    ):
        """
        Initialize WhisperX service

        Args:
            model_name: WhisperX model name (base, small, medium, large-v2)
            device: Device to use (cpu, cuda)
            batch_size: Batch size for processing
            compute_type: Compute type (int8, float16, float32)
        """
        self.model_name = model_name
        self.device = device
        self.batch_size = batch_size
        self.compute_type = compute_type
        self.model = self._load_model()

    def _load_model(self) -> Any:
        """
        Load WhisperX model

        On CUDA server, this will load actual WhisperX model:
        import whisperx
        return whisperx.load_model(self.model_name, self.device, compute_type=self.compute_type)
        """
        # Mock implementation for Mac
        return {"model_name": self.model_name, "device": self.device, "loaded": True}

    def transcribe(self, audio_path: str) -> TranscriptionResult:
        """
        Transcribe audio file

        Args:
            audio_path: Path to audio file

        Returns:
            TranscriptionResult with segments, language, and duration

        Raises:
            FileNotFoundError: If audio file doesn't exist
        """
        if not os.path.exists(audio_path):
            raise FileNotFoundError(f"Audio file not found: {audio_path}")

        # Mock implementation for Mac
        # On CUDA server, this will use actual WhisperX:
        # audio = whisperx.load_audio(audio_path)
        # result = self.model.transcribe(audio, batch_size=self.batch_size)
        # aligned = whisperx.align(result["segments"], self.model, audio, self.device)

        # Mock transcription result
        mock_segments = [
            {
                "start": 0.0,
                "end": 2.5,
                "text": "これはモック文字起こし結果です。",
                "words": [
                    {"start": 0.0, "end": 0.5, "word": "これは"},
                    {"start": 0.6, "end": 1.2, "word": "モック"},
                    {"start": 1.3, "end": 2.0, "word": "文字起こし"},
                    {"start": 2.1, "end": 2.5, "word": "結果です"},
                ],
            }
        ]

        return TranscriptionResult(
            segments=mock_segments,
            language="ja",
            duration=2.5,
        )

    def adjust_batch_size(self) -> None:
        """
        Adjust batch size for VRAM constraints

        Called when CUDA out of memory error occurs
        """
        if self.batch_size > 1:
            self.batch_size = self.batch_size // 2
            print(f"Adjusted batch_size to {self.batch_size} due to VRAM constraints")


class WhisperXError(Exception):
    """WhisperX service error"""

    pass


class AudioFormatError(WhisperXError):
    """Invalid audio format error"""

    pass


class TranscriptionTimeoutError(WhisperXError):
    """Transcription timeout error"""

    pass
