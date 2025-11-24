"""
Whisper Integration Tests
Task 3.2: Whisper Audio Recognition Integration
Requirements: R4.1, R3.3
"""

import pytest
from unittest.mock import Mock, patch, MagicMock
import numpy as np


@pytest.fixture
def mock_whisper_model():
    """Mock Whisper model"""
    with patch('whisper.load_model') as mock_load:
        mock_model = MagicMock()
        mock_load.return_value = mock_model
        yield mock_model


@pytest.fixture
def sample_audio_data():
    """Generate sample audio data (48kHz, stereo, float32)"""
    # 1 second of audio
    sample_rate = 48000
    duration = 1.0
    channels = 2
    
    # Generate sine wave
    t = np.linspace(0, duration, int(sample_rate * duration))
    audio = np.sin(2 * np.pi * 440 * t)  # 440Hz tone
    
    # Convert to stereo float32
    audio_stereo = np.stack([audio, audio]).T.astype(np.float32)
    
    return audio_stereo.tobytes()


class TestWhisperIntegration:
    """Test suite for Whisper integration (Task 3.2)"""

    def test_whisper_model_loading(self, mock_whisper_model):
        """
        Test: Whisper large-v3 model loading
        Given: GPUPipeline is initialized
        When: _load_whisper_model() is called
        Then: Whisper large-v3 model is loaded to CUDA
        """
        from services.gpu_pipeline import GPUPipeline
        
        with patch('torch.cuda.is_available', return_value=True):
            pipeline = GPUPipeline()
            pipeline._load_whisper_model()
            
            # Verify model was loaded
            assert hasattr(pipeline, 'whisper_model')
            assert pipeline.whisper_model is not None

    @pytest.mark.asyncio
    async def test_transcribe_audio_buffer(self, mock_whisper_model, sample_audio_data):
        """
        Test: Transcribe audio buffer with Whisper
        Given: Audio buffer is ready for transcription
        When: transcribe_audio() is called
        Then: Japanese text and timestamped segments are returned
        """
        from services.gpu_pipeline import GPUPipeline
        
        # Mock Whisper transcription result
        mock_result = {
            'text': 'これはテスト音声です。',
            'segments': [
                {
                    'start': 0.0,
                    'end': 2.5,
                    'text': 'これはテスト音声です。'
                }
            ]
        }
        mock_whisper_model.transcribe.return_value = mock_result
        
        with patch('torch.cuda.is_available', return_value=True):
            pipeline = GPUPipeline()
            pipeline.whisper_model = mock_whisper_model
            
            # Transcribe audio
            buffer_start_time = 1234567890.0
            result = await pipeline.transcribe_audio(
                audio_data=sample_audio_data,
                buffer_start_time=buffer_start_time
            )
            
            assert result is not None
            assert 'text' in result
            assert 'segments' in result
            assert result['text'] == 'これはテスト音声です。'

    @pytest.mark.asyncio
    async def test_relative_timestamp_conversion(self, mock_whisper_model, sample_audio_data):
        """
        Test: Convert Whisper timestamps to buffer-relative timestamps
        Given: Whisper returns absolute timestamps
        When: transcribe_audio() processes results
        Then: Timestamps are converted to buffer-relative (starting from 0.0)
        """
        from services.gpu_pipeline import GPUPipeline
        
        mock_result = {
            'text': 'テスト',
            'segments': [
                {
                    'start': 0.0,
                    'end': 1.5,
                    'text': 'テスト'
                }
            ]
        }
        mock_whisper_model.transcribe.return_value = mock_result
        
        with patch('torch.cuda.is_available', return_value=True):
            pipeline = GPUPipeline()
            pipeline.whisper_model = mock_whisper_model
            
            buffer_start_time = 1234567890.0
            result = await pipeline.transcribe_audio(
                audio_data=sample_audio_data,
                buffer_start_time=buffer_start_time
            )
            
            # Timestamps should be relative to buffer start (0.0)
            segment = result['segments'][0]
            assert segment['start'] == 0.0
            assert segment['end'] == 1.5

    @pytest.mark.asyncio
    async def test_whisper_japanese_language_parameter(self, mock_whisper_model, sample_audio_data):
        """
        Test: Whisper is configured for Japanese language
        Given: Audio buffer contains Japanese speech
        When: transcribe_audio() is called
        Then: Whisper is invoked with language='ja' parameter
        """
        from services.gpu_pipeline import GPUPipeline
        
        mock_result = {
            'text': '日本語テスト',
            'segments': []
        }
        mock_whisper_model.transcribe.return_value = mock_result
        
        with patch('torch.cuda.is_available', return_value=True):
            pipeline = GPUPipeline()
            pipeline.whisper_model = mock_whisper_model
            
            await pipeline.transcribe_audio(
                audio_data=sample_audio_data,
                buffer_start_time=1234567890.0
            )
            
            # Verify Whisper was called with Japanese language
            mock_whisper_model.transcribe.assert_called_once()
            call_kwargs = mock_whisper_model.transcribe.call_args.kwargs
            assert call_kwargs.get('language') == 'ja'

    @pytest.mark.asyncio
    async def test_audio_format_conversion(self, mock_whisper_model):
        """
        Test: Audio data conversion from bytes to numpy array
        Given: Audio buffer is in bytes format (float32)
        When: transcribe_audio() prepares audio for Whisper
        Then: Audio is converted to numpy array correctly
        """
        from services.gpu_pipeline import GPUPipeline
        
        # Create test audio: 48kHz stereo float32
        sample_rate = 48000
        duration = 0.5
        audio_np = np.random.randn(int(sample_rate * duration), 2).astype(np.float32)
        audio_bytes = audio_np.tobytes()
        
        mock_result = {
            'text': 'テスト',
            'segments': []
        }
        mock_whisper_model.transcribe.return_value = mock_result
        
        with patch('torch.cuda.is_available', return_value=True):
            pipeline = GPUPipeline()
            pipeline.whisper_model = mock_whisper_model
            
            result = await pipeline.transcribe_audio(
                audio_data=audio_bytes,
                buffer_start_time=1234567890.0
            )
            
            # Verify transcription was called
            assert mock_whisper_model.transcribe.called

    @pytest.mark.asyncio
    async def test_whisper_error_handling(self, mock_whisper_model, sample_audio_data):
        """
        Test: Error handling during Whisper transcription
        Given: Whisper transcription fails
        When: Exception is raised during transcribe()
        Then: Error is handled gracefully and returned
        """
        from services.gpu_pipeline import GPUPipeline
        
        mock_whisper_model.transcribe.side_effect = Exception("Whisper transcription failed")
        
        with patch('torch.cuda.is_available', return_value=True):
            pipeline = GPUPipeline()
            pipeline.whisper_model = mock_whisper_model
            
            result = await pipeline.transcribe_audio(
                audio_data=sample_audio_data,
                buffer_start_time=1234567890.0
            )
            
            assert 'error' in result
            assert result['error'] == True

    def test_whisper_model_device_placement(self, mock_whisper_model):
        """
        Test: Whisper model is placed on CUDA device
        Given: GPUPipeline is initialized with CUDA
        When: Whisper model is loaded
        Then: Model is placed on 'cuda' device
        """
        from services.gpu_pipeline import GPUPipeline
        
        with patch('torch.cuda.is_available', return_value=True):
            pipeline = GPUPipeline()
            pipeline._load_whisper_model()
            
            # Verify model device
            assert pipeline.device == 'cuda'

    @pytest.mark.asyncio
    async def test_empty_transcription_result(self, mock_whisper_model, sample_audio_data):
        """
        Test: Handle empty transcription result (silence)
        Given: Audio buffer contains only silence
        When: Whisper returns empty text
        Then: Empty result is handled gracefully
        """
        from services.gpu_pipeline import GPUPipeline
        
        mock_result = {
            'text': '',
            'segments': []
        }
        mock_whisper_model.transcribe.return_value = mock_result
        
        with patch('torch.cuda.is_available', return_value=True):
            pipeline = GPUPipeline()
            pipeline.whisper_model = mock_whisper_model
            
            result = await pipeline.transcribe_audio(
                audio_data=sample_audio_data,
                buffer_start_time=1234567890.0
            )
            
            assert result is not None
            assert result['text'] == ''
            assert result['segments'] == []
