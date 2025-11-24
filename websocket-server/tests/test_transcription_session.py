"""
TranscriptionSession Tests
Task 2.1: TranscriptionSession Implementation
Requirements: R2.2, R3.3
"""

import pytest
import time
from datetime import datetime
from services.transcription_session import TranscriptionSession


class TestTranscriptionSession:
    """Test suite for TranscriptionSession"""

    def test_session_initialization(self):
        """
        Test: Session initialization
        Given: Creating a new TranscriptionSession
        When: Session is initialized
        Then: Session has empty buffer and generated buffer_id
        """
        session = TranscriptionSession()
        
        assert session.get_buffer_size() == 0
        assert session.get_buffer_id() is not None
        assert session.get_buffer_id().startswith("buff_")

    def test_buffer_id_format(self):
        """
        Test: buffer_id format (buff_YYYYMMDD_HHMMSS_NNN)
        Given: Creating a new TranscriptionSession
        When: Getting buffer_id
        Then: buffer_id follows buff_YYYYMMDD_HHMMSS_NNN format
        """
        session = TranscriptionSession()
        buffer_id = session.get_buffer_id()
        
        # Format: buff_20251105_123456_001
        parts = buffer_id.split("_")
        assert len(parts) == 4
        assert parts[0] == "buff"
        assert len(parts[1]) == 8  # YYYYMMDD
        assert len(parts[2]) == 6  # HHMMSS
        assert len(parts[3]) == 3  # NNN

    def test_add_audio_chunk(self):
        """
        Test: Adding audio chunks to buffer
        Given: TranscriptionSession with empty buffer
        When: Audio chunk is added
        Then: Buffer size increases
        """
        session = TranscriptionSession()
        
        # 1KB audio chunk
        chunk = b'\x00' * 1024
        session.add_audio_chunk(chunk)
        
        assert session.get_buffer_size() == 1024

    def test_add_multiple_chunks(self):
        """
        Test: Adding multiple audio chunks
        Given: TranscriptionSession
        When: Multiple chunks are added
        Then: Buffer accumulates all chunks
        """
        session = TranscriptionSession()
        
        session.add_audio_chunk(b'\x00' * 1024)
        session.add_audio_chunk(b'\x00' * 2048)
        session.add_audio_chunk(b'\x00' * 512)
        
        assert session.get_buffer_size() == 1024 + 2048 + 512

    def test_buffer_start_time_recording(self):
        """
        Test: Recording buffer start time (for relative timestamps)
        Given: TranscriptionSession initialized
        When: First audio chunk is added
        Then: Buffer start time is recorded
        """
        session = TranscriptionSession()
        
        before_time = time.time()
        session.add_audio_chunk(b'\x00' * 1024)
        after_time = time.time()
        
        buffer_start_time = session.get_buffer_start_time()
        assert buffer_start_time is not None
        assert before_time <= buffer_start_time <= after_time

    def test_should_flush_empty_buffer(self):
        """
        Test: should_flush() with empty buffer
        Given: TranscriptionSession with no audio
        When: Checking if should flush
        Then: Returns False
        """
        session = TranscriptionSession()
        assert session.should_flush() == False

    def test_should_flush_after_max_duration(self):
        """
        Test: Flush trigger after 30 seconds max duration
        Given: TranscriptionSession
        When: 30 seconds worth of audio is buffered
        Then: should_flush() returns True
        """
        session = TranscriptionSession()
        
        # 48kHz, stereo (2ch), 4 bytes per sample = 384,000 bytes/sec
        # 30 seconds = 11,520,000 bytes
        chunk_size = 384000  # 1 second
        for _ in range(30):
            session.add_audio_chunk(b'\x00' * chunk_size)
        
        assert session.should_flush() == True

    @pytest.mark.asyncio
    async def test_flush_buffer(self):
        """
        Test: Flushing buffer
        Given: TranscriptionSession with buffered audio
        When: flush() is called
        Then: Buffer is cleared and new buffer_id is generated
        """
        session = TranscriptionSession()
        
        session.add_audio_chunk(b'\x00' * 1024)
        old_buffer_id = session.get_buffer_id()
        
        # Flush (returns audio data and buffer_id)
        audio_data, buffer_id = await session.flush()
        
        assert buffer_id == old_buffer_id
        assert len(audio_data) == 1024
        assert session.get_buffer_size() == 0
        assert session.get_buffer_id() != old_buffer_id  # New buffer_id generated

    @pytest.mark.asyncio
    async def test_flush_resets_buffer_start_time(self):
        """
        Test: Flushing resets buffer start time
        Given: TranscriptionSession with recorded buffer_start_time
        When: flush() is called
        Then: buffer_start_time is reset to None
        """
        session = TranscriptionSession()
        
        session.add_audio_chunk(b'\x00' * 1024)
        assert session.get_buffer_start_time() is not None
        
        await session.flush()
        
        assert session.get_buffer_start_time() is None

    @pytest.mark.asyncio
    async def test_multiple_flush_cycles(self):
        """
        Test: Multiple flush cycles
        Given: TranscriptionSession
        When: Adding chunks, flushing, adding more chunks
        Then: Each cycle has unique buffer_id
        """
        session = TranscriptionSession()
        
        # Cycle 1
        session.add_audio_chunk(b'\x00' * 1024)
        _, buffer_id_1 = await session.flush()
        
        # Cycle 2
        session.add_audio_chunk(b'\x00' * 2048)
        _, buffer_id_2 = await session.flush()
        
        # Cycle 3
        session.add_audio_chunk(b'\x00' * 512)
        _, buffer_id_3 = await session.flush()
        
        assert buffer_id_1 != buffer_id_2 != buffer_id_3
        assert all(bid.startswith("buff_") for bid in [buffer_id_1, buffer_id_2, buffer_id_3])

    def test_should_flush_after_2_seconds_silence(self):
        """
        Test: Flush trigger after 2 seconds silence
        Given: TranscriptionSession with silence tracking
        When: 2 seconds of silence is detected
        Then: should_flush() returns True
        """
        session = TranscriptionSession()
        
        # Add some audio
        session.add_audio_chunk(b'\x00' * 1024)
        
        # Track 2 seconds of silence
        session.track_silence(2.0)
        
        assert session.should_flush() == True

    def test_track_silence_accumulation(self):
        """
        Test: Silence duration accumulation
        Given: TranscriptionSession
        When: track_silence() is called multiple times
        Then: Silence duration accumulates
        """
        session = TranscriptionSession()
        
        session.track_silence(0.5)
        assert session.get_silence_duration() == 0.5
        
        session.track_silence(1.0)
        assert session.get_silence_duration() == 1.5
        
        session.track_silence(0.7)
        assert session.get_silence_duration() == 2.2

    def test_reset_silence_on_voice(self):
        """
        Test: Reset silence duration on voice detection
        Given: TranscriptionSession with accumulated silence
        When: Voice is detected (reset_silence() called)
        Then: Silence duration is reset to 0
        """
        session = TranscriptionSession()
        
        session.track_silence(1.5)
        assert session.get_silence_duration() == 1.5
        
        session.reset_silence()
        assert session.get_silence_duration() == 0

    @pytest.mark.asyncio
    async def test_flush_resets_silence_duration(self):
        """
        Test: Flushing resets silence duration
        Given: TranscriptionSession with accumulated silence
        When: flush() is called
        Then: Silence duration is reset to 0
        """
        session = TranscriptionSession()
        
        session.add_audio_chunk(b'\x00' * 1024)
        session.track_silence(1.8)
        assert session.get_silence_duration() == 1.8
        
        await session.flush()
        
        assert session.get_silence_duration() == 0
