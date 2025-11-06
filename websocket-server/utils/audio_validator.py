"""
Audio Validation Utilities
Task 18.1: Input validation and size limits
Requirements: R9.1
"""

import logging
from typing import Dict, Any, Optional, Tuple

logger = logging.getLogger(__name__)

# Audio format constants (16kHz, mono, float32)
# Changed from 48kHz stereo to 16kHz mono for Whisper/Silero-VAD optimization (83% bandwidth reduction)
EXPECTED_SAMPLE_RATE = 16000
EXPECTED_CHANNELS = 1
EXPECTED_BYTES_PER_SAMPLE = 4  # float32 = 4 bytes
EXPECTED_FRAME_SIZE = EXPECTED_CHANNELS * EXPECTED_BYTES_PER_SAMPLE  # 4 bytes per frame

# Maximum payload size: 30 seconds = 30 * 16000 * 1 * 4 = 1,920,000 bytes (was 11.52MB)
MAX_DURATION_SECONDS = 30
MAX_PAYLOAD_BYTES = MAX_DURATION_SECONDS * EXPECTED_SAMPLE_RATE * EXPECTED_CHANNELS * EXPECTED_BYTES_PER_SAMPLE


class AudioValidationError(Exception):
    """Exception raised for audio validation errors"""
    def __init__(self, code: str, message: str):
        self.code = code
        self.message = message
        super().__init__(message)


def validate_audio_chunk(audio_data: bytes) -> Tuple[bool, Optional[Dict[str, Any]]]:
    """
    Validate audio chunk format and size

    Expected format: 16kHz, mono, float32
    Max size: 1.92MB (30 seconds)

    Args:
        audio_data: Raw audio bytes

    Returns:
        Tuple of (is_valid, error_dict)
        If valid: (True, None)
        If invalid: (False, {"type": "error", "code": "INVALID_FORMAT", "message": "..."})
    """
    try:
        # Validation 1: Empty payload
        if len(audio_data) == 0:
            error_msg = "Empty audio payload"
            logger.warning(f"Audio validation failed: {error_msg}")
            return False, {
                "type": "error",
                "code": "INVALID_FORMAT",
                "message": error_msg
            }

        # Validation 2: Payload size limit (11.52MB max)
        if len(audio_data) > MAX_PAYLOAD_BYTES:
            duration_seconds = len(audio_data) / (EXPECTED_SAMPLE_RATE * EXPECTED_CHANNELS * EXPECTED_BYTES_PER_SAMPLE)
            error_msg = f"Audio payload exceeds size limit: {len(audio_data)} bytes ({duration_seconds:.1f}s), max {MAX_PAYLOAD_BYTES} bytes ({MAX_DURATION_SECONDS}s)"
            logger.warning(f"Audio validation failed: {error_msg}")
            return False, {
                "type": "error",
                "code": "INVALID_FORMAT",
                "message": error_msg
            }

        # Validation 3: Frame alignment (must be multiple of 4 bytes for mono float32)
        if len(audio_data) % EXPECTED_FRAME_SIZE != 0:
            error_msg = f"Audio payload size not aligned to frame size: {len(audio_data)} bytes (expected multiple of {EXPECTED_FRAME_SIZE} bytes for mono float32)"
            logger.warning(f"Audio validation failed: {error_msg}")
            return False, {
                "type": "error",
                "code": "INVALID_FORMAT",
                "message": error_msg
            }

        # Validation 4: Minimum reasonable size (at least 1ms of audio = 384 bytes)
        min_bytes = int(0.001 * EXPECTED_SAMPLE_RATE * EXPECTED_CHANNELS * EXPECTED_BYTES_PER_SAMPLE)
        if len(audio_data) < min_bytes:
            error_msg = f"Audio payload too small: {len(audio_data)} bytes (minimum {min_bytes} bytes for 1ms)"
            logger.warning(f"Audio validation failed: {error_msg}")
            return False, {
                "type": "error",
                "code": "INVALID_FORMAT",
                "message": error_msg
            }

        # All validations passed
        return True, None

    except Exception as e:
        error_msg = f"Audio validation error: {str(e)}"
        logger.error(error_msg, exc_info=True)
        return False, {
            "type": "error",
            "code": "INVALID_FORMAT",
            "message": error_msg
        }


def validate_audio_format_metadata(
    sample_rate: int,
    channels: int,
    sample_format: str
) -> Tuple[bool, Optional[Dict[str, Any]]]:
    """
    Validate audio format metadata

    Args:
        sample_rate: Audio sample rate (Hz)
        channels: Number of audio channels
        sample_format: Sample format string (e.g., "float32")

    Returns:
        Tuple of (is_valid, error_dict)
    """
    try:
        # Validation 1: Sample rate
        if sample_rate != EXPECTED_SAMPLE_RATE:
            error_msg = f"Invalid sample rate: {sample_rate} Hz (expected {EXPECTED_SAMPLE_RATE} Hz)"
            logger.warning(f"Audio format validation failed: {error_msg}")
            return False, {
                "type": "error",
                "code": "INVALID_FORMAT",
                "message": error_msg
            }

        # Validation 2: Channel count
        if channels != EXPECTED_CHANNELS:
            error_msg = f"Invalid channel count: {channels} (expected {EXPECTED_CHANNELS} for mono)"
            logger.warning(f"Audio format validation failed: {error_msg}")
            return False, {
                "type": "error",
                "code": "INVALID_FORMAT",
                "message": error_msg
            }

        # Validation 3: Sample format
        if sample_format.lower() not in ["float32", "f32", "float"]:
            error_msg = f"Invalid sample format: {sample_format} (expected float32)"
            logger.warning(f"Audio format validation failed: {error_msg}")
            return False, {
                "type": "error",
                "code": "INVALID_FORMAT",
                "message": error_msg
            }

        # All validations passed
        return True, None

    except Exception as e:
        error_msg = f"Audio format validation error: {str(e)}"
        logger.error(error_msg, exc_info=True)
        return False, {
            "type": "error",
            "code": "INVALID_FORMAT",
            "message": error_msg
        }


def get_audio_duration_seconds(audio_data: bytes) -> float:
    """
    Calculate audio duration in seconds

    Args:
        audio_data: Raw audio bytes

    Returns:
        Duration in seconds
    """
    num_frames = len(audio_data) // EXPECTED_FRAME_SIZE
    duration = num_frames / EXPECTED_SAMPLE_RATE
    return duration


def get_validation_stats() -> Dict[str, Any]:
    """
    Get audio validation configuration

    Returns:
        Dictionary with validation configuration
    """
    return {
        "sample_rate": EXPECTED_SAMPLE_RATE,
        "channels": EXPECTED_CHANNELS,
        "bytes_per_sample": EXPECTED_BYTES_PER_SAMPLE,
        "frame_size": EXPECTED_FRAME_SIZE,
        "max_duration_seconds": MAX_DURATION_SECONDS,
        "max_payload_bytes": MAX_PAYLOAD_BYTES
    }
