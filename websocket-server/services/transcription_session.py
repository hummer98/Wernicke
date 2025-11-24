"""
Transcription Session Service
Task 2.1: TranscriptionSession Implementation
Requirements: R2.2, R3.3

Manages audio buffering, buffer_id generation, and VAD triggering for WebSocket sessions
"""

import time
import asyncio
from datetime import datetime
from typing import Optional, Tuple
import logging

logger = logging.getLogger(__name__)


class TranscriptionSession:
    """
    Manages transcription session for a single WebSocket connection
    
    Responsibilities:
    - Audio buffer management per session
    - buffer_id generation (buff_YYYYMMDD_HHMMSS_NNN format)
    - Buffer start time recording (for relative timestamps)
    - Audio chunk accumulation
    - Flush trigger logic (30 seconds max duration)
    """
    
    # Audio configuration
    SAMPLE_RATE = 16000  # 16kHz (Whisper/Silero-VAD optimized)
    CHANNELS = 1  # Mono (Whisper/Silero-VAD requirement)
    BYTES_PER_SAMPLE = 4  # 32-bit float
    BYTES_PER_SECOND = SAMPLE_RATE * CHANNELS * BYTES_PER_SAMPLE  # 64,000 bytes/sec
    MAX_BUFFER_DURATION = 30  # seconds
    MAX_BUFFER_SIZE = BYTES_PER_SECOND * MAX_BUFFER_DURATION  # 1,920,000 bytes (83% reduction)

    # VAD configuration (VAD-driven flush)
    SILENCE_THRESHOLD = 2.0  # seconds (speech pause detection)
    MIN_BUFFER_DURATION = 5.0  # seconds (minimum buffer size before VAD flush)
    MIN_BUFFER_SIZE = int(BYTES_PER_SECOND * MIN_BUFFER_DURATION)  # 320,000 bytes (5 seconds)

    def __init__(self):
        """Initialize transcription session"""
        self._buffer: bytearray = bytearray()
        self._buffer_counter = 1
        self._buffer_id: str = self._generate_buffer_id()
        self._buffer_start_time: Optional[float] = None
        self._silence_duration: float = 0.0
        self._lock = asyncio.Lock()

        logger.info(f"TranscriptionSession initialized: buffer_id={self._buffer_id}")
    
    def _generate_buffer_id(self) -> str:
        """
        Generate buffer_id in buff_YYYYMMDD_HHMMSS_NNN format
        
        Returns:
            buffer_id string
        """
        now = datetime.now()
        date_str = now.strftime("%Y%m%d")
        time_str = now.strftime("%H%M%S")
        counter_str = f"{self._buffer_counter:03d}"
        
        buffer_id = f"buff_{date_str}_{time_str}_{counter_str}"
        return buffer_id
    
    def add_audio_chunk(self, chunk: bytes) -> None:
        """
        Add audio chunk to buffer
        
        Args:
            chunk: Binary audio data
        """
        # Record buffer start time on first chunk
        if len(self._buffer) == 0:
            self._buffer_start_time = time.time()
        
        self._buffer.extend(chunk)
        logger.debug(f"Audio chunk added: {len(chunk)} bytes, total={len(self._buffer)} bytes")
    
    def get_buffer_size(self) -> int:
        """
        Get current buffer size in bytes
        
        Returns:
            Buffer size in bytes
        """
        return len(self._buffer)
    
    def get_buffer_id(self) -> str:
        """
        Get current buffer_id
        
        Returns:
            buffer_id string
        """
        return self._buffer_id
    
    def get_buffer_start_time(self) -> Optional[float]:
        """
        Get buffer start time (Unix timestamp)
        
        Returns:
            Buffer start time or None if buffer is empty
        """
        return self._buffer_start_time
    
    def track_silence(self, duration: float) -> None:
        """
        Track silence duration

        Args:
            duration: Silence duration in seconds to add
        """
        self._silence_duration += duration
        logger.debug(f"Silence tracked: +{duration}s, total={self._silence_duration}s")

    def reset_silence(self) -> None:
        """Reset silence duration (called when voice is detected)"""
        self._silence_duration = 0.0
        logger.debug("Silence duration reset")

    def get_silence_duration(self) -> float:
        """
        Get current silence duration

        Returns:
            Silence duration in seconds
        """
        return self._silence_duration

    def should_flush(self) -> bool:
        """
        Check if buffer should be flushed

        Flush triggers:
        - 30 seconds max duration (MAX_BUFFER_SIZE reached)
        - 2.0 seconds silence (SILENCE_THRESHOLD) - VAD-driven flush
          (only if buffer >= 5 seconds MIN_BUFFER_SIZE)

        Returns:
            True if should flush, False otherwise
        """
        if len(self._buffer) == 0:
            return False

        # Check max duration (30 seconds)
        if len(self._buffer) >= self.MAX_BUFFER_SIZE:
            logger.info(f"Flush trigger: MAX_BUFFER_SIZE reached ({len(self._buffer)} bytes)")
            return True

        # Check silence duration (1.5 seconds) - VAD-driven flush
        # Only trigger if buffer has at least MIN_BUFFER_SIZE (3 seconds)
        if self._silence_duration >= self.SILENCE_THRESHOLD:
            if len(self._buffer) >= self.MIN_BUFFER_SIZE:
                buffer_duration = len(self._buffer) / self.BYTES_PER_SECOND
                logger.info(f"Flush trigger: VAD silence detected ({self._silence_duration:.2f}s, buffer={buffer_duration:.1f}s)")
                return True
            else:
                # Buffer too small - ignore silence
                buffer_duration = len(self._buffer) / self.BYTES_PER_SECOND
                logger.debug(f"VAD silence ignored: buffer too small ({buffer_duration:.1f}s < {self.MIN_BUFFER_DURATION}s)")
                return False

        return False
    
    async def flush(self) -> Tuple[bytes, str]:
        """
        Flush buffer and return audio data with buffer_id
        
        Returns:
            Tuple of (audio_data, buffer_id)
        """
        async with self._lock:
            # Get current buffer data and buffer_id
            audio_data = bytes(self._buffer)
            buffer_id = self._buffer_id
            
            logger.info(f"Flushing buffer: buffer_id={buffer_id}, size={len(audio_data)} bytes")
            
            # Clear buffer
            self._buffer.clear()
            self._buffer_start_time = None
            self._silence_duration = 0.0  # Reset silence duration

            # Generate new buffer_id for next cycle
            self._buffer_counter += 1
            self._buffer_id = self._generate_buffer_id()

            logger.info(f"New buffer initialized: buffer_id={self._buffer_id}")

            return audio_data, buffer_id
