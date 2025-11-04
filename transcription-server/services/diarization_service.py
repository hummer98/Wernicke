"""
Diarization Service
話者分離サービス
"""

import os
from typing import List, Dict, Any
from dataclasses import dataclass


@dataclass
class DiarizationResult:
    """Diarization result data class"""

    speakers: List[Dict[str, Any]]

    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary"""
        return {"speakers": self.speakers}

    @classmethod
    def from_pyannote_output(cls, pyannote_output: List[Dict[str, Any]]) -> "DiarizationResult":
        """
        Create from pyannote.audio output

        Args:
            pyannote_output: List of speaker segments from pyannote

        Returns:
            DiarizationResult instance
        """
        speakers = []
        for segment in pyannote_output:
            # Normalize speaker labels from SPEAKER_XX to Speaker_XX
            speaker_label = segment["speaker"].replace("SPEAKER_", "Speaker_")
            speakers.append(
                {
                    "speaker": speaker_label,
                    "start": segment["start"],
                    "end": segment["end"],
                }
            )
        return cls(speakers=speakers)


class DiarizationService:
    """
    Speaker Diarization Service using pyannote.audio

    Note: This is a mock implementation for development on Mac.
    On CUDA server, this will use actual pyannote.audio with GPU acceleration.
    """

    def __init__(self, device: str = "cpu"):
        """
        Initialize diarization service

        Args:
            device: Device to use (cpu, cuda)
        """
        self.device = device
        self.hf_token = os.environ.get("HF_TOKEN")
        if not self.hf_token:
            print("Warning: HF_TOKEN not found. Set it for production use.")
        self.pipeline = self._load_pipeline()

    def _load_pipeline(self) -> Any:
        """
        Load pyannote.audio pipeline

        On CUDA server, this will load actual pyannote pipeline:
        from pyannote.audio import Pipeline
        pipeline = Pipeline.from_pretrained(
            "pyannote/speaker-diarization-3.1",
            use_auth_token=self.hf_token
        )
        return pipeline.to(self.device)
        """
        # Mock implementation for Mac
        return {
            "model": "speaker-diarization-3.1",
            "device": self.device,
            "loaded": True,
        }

    def diarize(self, audio_path: str, min_duration: float = 3.0) -> DiarizationResult:
        """
        Perform speaker diarization on audio file

        Args:
            audio_path: Path to audio file
            min_duration: Minimum audio duration for diarization (seconds)

        Returns:
            DiarizationResult with speaker segments

        Raises:
            FileNotFoundError: If audio file doesn't exist
        """
        if not os.path.exists(audio_path):
            raise FileNotFoundError(f"Audio file not found: {audio_path}")

        # Mock implementation for Mac
        # On CUDA server, this will use actual pyannote.audio:
        # diarization = self.pipeline(audio_path)
        # speakers = []
        # for turn, _, speaker in diarization.itertracks(yield_label=True):
        #     speakers.append({
        #         "speaker": speaker,
        #         "start": turn.start,
        #         "end": turn.end
        #     })

        # Mock diarization result with 2 speakers
        mock_speakers = [
            {"speaker": "Speaker_00", "start": 0.0, "end": 3.5},
            {"speaker": "Speaker_01", "start": 4.0, "end": 6.5},
            {"speaker": "Speaker_00", "start": 7.0, "end": 9.0},
        ]

        return DiarizationResult(speakers=mock_speakers)


def assign_speakers_to_segments(
    segments: List[Dict[str, Any]], diarization: DiarizationResult
) -> List[Dict[str, Any]]:
    """
    Assign speaker labels to transcription segments

    Uses segment midpoint to determine which speaker was talking.

    Args:
        segments: List of transcription segments
        diarization: Diarization result with speaker timing

    Returns:
        List of segments with added "speaker" field
    """
    result_segments = []

    for segment in segments:
        # Calculate segment midpoint
        midpoint = (segment["start"] + segment["end"]) / 2.0

        # Find speaker at this midpoint
        speaker_label = "Unknown"
        for speaker in diarization.speakers:
            if speaker["start"] <= midpoint <= speaker["end"]:
                speaker_label = speaker["speaker"]
                break

        # Add speaker to segment
        segment_with_speaker = segment.copy()
        segment_with_speaker["speaker"] = speaker_label
        result_segments.append(segment_with_speaker)

    return result_segments


class DiarizationError(Exception):
    """Diarization service error"""

    pass


class ShortAudioError(DiarizationError):
    """Audio too short for diarization error"""

    pass
