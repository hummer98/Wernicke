"""
E2E Test: Silero-VAD + Whisper Integration
End-to-End testing for voice activity detection and transcription pipeline

Test Scenarios:
1. Complete silence (hallucination prevention)
2. Japanese speech (VAD + Whisper integration)
3. Audio format validation (16kHz mono float32)
"""

import pytest
import numpy as np
import logging
from pathlib import Path
import sys

# Add parent directory to path for imports
sys.path.insert(0, str(Path(__file__).parent.parent))

from services.gpu_pipeline import GPUPipeline

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


class TestE2EVADWhisper:
    """E2E tests for VAD + Whisper integration"""

    @pytest.fixture(scope="class")
    def gpu_pipeline(self):
        """Initialize GPUPipeline once for all tests"""
        logger.info("Initializing GPUPipeline for E2E tests...")
        pipeline = GPUPipeline()
        yield pipeline
        logger.info("E2E tests completed")

    @pytest.mark.asyncio
    async def test_silence_hallucination_prevention(self, gpu_pipeline):
        """
        Test 1: Complete Silence (Hallucination Prevention)

        Input: 5 seconds of complete silence (zeros)
        Expected: VAD detects no speech, returns empty result
        Verifies: vad_skipped=True, text='', segments=[]
        """
        logger.info("=" * 60)
        logger.info("Test 1: Complete Silence (Hallucination Prevention)")
        logger.info("=" * 60)

        # Generate 5 seconds of silence at 16kHz mono
        duration_seconds = 5.0
        sample_rate = 16000
        num_samples = int(duration_seconds * sample_rate)

        # Create silent audio (all zeros)
        silence_audio = np.zeros(num_samples, dtype=np.float32)
        audio_bytes = silence_audio.tobytes()

        logger.info(f"Input: {duration_seconds}s of silence ({len(audio_bytes)} bytes)")

        # Process through pipeline
        result = await gpu_pipeline.transcribe_audio(audio_bytes, 0.0)

        # Assertions
        assert 'vad_skipped' in result, "VAD should mark as skipped"
        assert result['vad_skipped'] is True, "VAD should skip transcription on silence"
        assert result['text'] == '', f"Expected empty text, got: '{result['text']}'"
        assert result['segments'] == [], f"Expected empty segments, got: {result['segments']}"

        logger.info("✅ Test 1 PASSED: VAD successfully prevented hallucination on silence")
        logger.info("")

    @pytest.mark.asyncio
    async def test_japanese_speech_transcription(self, gpu_pipeline):
        """
        Test 2: Japanese Speech (VAD + Whisper Integration)

        Input: 33.49s Japanese dialogue (16kHz mono float32)
        Expected: VAD detects speech segments, Whisper transcribes correctly
        Verifies: Speech detection, transcription output exists
        """
        logger.info("=" * 60)
        logger.info("Test 2: Japanese Speech (VAD + Whisper Integration)")
        logger.info("=" * 60)

        # Load test audio file
        test_audio_path = Path(__file__).parent.parent.parent / "test_audio" / "test_dialogue_16k_mono.raw"

        if not test_audio_path.exists():
            pytest.skip(f"Test audio file not found: {test_audio_path}")

        # Read audio file (16kHz mono float32)
        audio_bytes = test_audio_path.read_bytes()

        # Calculate duration
        num_samples = len(audio_bytes) // 4  # float32 = 4 bytes per sample
        duration_seconds = num_samples / 16000

        logger.info(f"Input: {duration_seconds:.2f}s Japanese dialogue ({len(audio_bytes)} bytes)")

        # Process through pipeline
        result = await gpu_pipeline.transcribe_audio(audio_bytes, 0.0)

        # Assertions
        assert 'vad_skipped' not in result or result.get('vad_skipped') is False, \
            "VAD should detect speech in Japanese dialogue"

        assert 'text' in result, "Result should contain 'text' field"
        assert len(result['text']) > 0, "Transcription text should not be empty"

        assert 'segments' in result, "Result should contain 'segments' field"
        assert len(result['segments']) > 0, "Should have at least one segment"

        logger.info(f"✅ Test 2 PASSED: VAD detected speech, Whisper transcribed successfully")
        logger.info(f"   Transcription: {result['text'][:100]}...")
        logger.info("")

    @pytest.mark.asyncio
    async def test_audio_format_validation(self, gpu_pipeline):
        """
        Test 3: Audio Format Validation (16kHz mono float32)

        Input: 3s sine wave (440Hz) at 16kHz mono float32
        Expected: Server accepts format and processes successfully
        Verifies: Format compatibility, processing success
        """
        logger.info("=" * 60)
        logger.info("Test 3: Audio Format Validation (16kHz mono float32)")
        logger.info("=" * 60)

        # Generate 3 seconds of 440Hz sine wave at 16kHz mono
        duration_seconds = 3.0
        sample_rate = 16000
        frequency = 440.0  # A4 note

        t = np.linspace(0, duration_seconds, int(sample_rate * duration_seconds), dtype=np.float32)
        audio_np = np.sin(2 * np.pi * frequency * t).astype(np.float32)
        audio_bytes = audio_np.tobytes()

        logger.info(f"Input: {duration_seconds}s sine wave ({frequency}Hz) at 16kHz mono")
        logger.info(f"Size: {len(audio_bytes)} bytes ({len(audio_np)} samples)")

        # Process through pipeline
        result = await gpu_pipeline.transcribe_audio(audio_bytes, 0.0)

        # Assertions
        assert 'error' not in result or result.get('error') is False, \
            f"Processing should succeed, got error: {result.get('message', 'Unknown')}"

        # Note: Sine wave may or may not be detected as speech by VAD
        # We're primarily testing format acceptance here
        assert 'text' in result, "Result should contain 'text' field"
        assert 'segments' in result, "Result should contain 'segments' field"

        logger.info("✅ Test 3 PASSED: Audio format validation successful")
        logger.info(f"   VAD result: {'skipped' if result.get('vad_skipped') else 'processed'}")
        logger.info("")

    @pytest.mark.asyncio
    async def test_vad_model_loaded(self, gpu_pipeline):
        """
        Test 4: VAD Model Initialization

        Verifies: Silero-VAD model is properly loaded
        """
        logger.info("=" * 60)
        logger.info("Test 4: VAD Model Initialization")
        logger.info("=" * 60)

        assert hasattr(gpu_pipeline, 'vad_model'), "GPUPipeline should have vad_model attribute"
        assert gpu_pipeline.vad_model is not None, "VAD model should be loaded"

        logger.info("✅ Test 4 PASSED: VAD model initialized successfully")
        logger.info("")

    @pytest.mark.asyncio
    async def test_whisper_model_loaded(self, gpu_pipeline):
        """
        Test 5: Whisper Model Initialization

        Verifies: Whisper large-v3 model is properly loaded
        """
        logger.info("=" * 60)
        logger.info("Test 5: Whisper Model Initialization")
        logger.info("=" * 60)

        assert hasattr(gpu_pipeline, 'whisper_model'), "GPUPipeline should have whisper_model attribute"
        assert gpu_pipeline.whisper_model is not None, "Whisper model should be loaded"

        assert hasattr(gpu_pipeline, 'whisper_processor'), "GPUPipeline should have whisper_processor"
        assert gpu_pipeline.whisper_processor is not None, "Whisper processor should be loaded"

        logger.info("✅ Test 5 PASSED: Whisper model initialized successfully")
        logger.info("")


if __name__ == "__main__":
    # Run tests with pytest
    pytest.main([__file__, "-v", "-s"])
