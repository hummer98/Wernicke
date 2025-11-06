"""
Partial Results Pipeline Tests
Task 4.1: Partial Results Processing Pipeline
Requirements: R3.1, R5.1, R8.1
"""

import pytest
from unittest.mock import Mock, patch, MagicMock
import time


@pytest.fixture
def mock_whisper_result():
    """Mock Whisper transcription result"""
    return {
        'text': 'これはテスト音声です。',
        'segments': [
            {
                'start': 0.0,
                'end': 2.5,
                'text': 'これはテスト音声です。'
            }
        ]
    }


class TestPartialResultsPipeline:
    """Test suite for partial results processing (Task 4.1)"""

    @pytest.mark.asyncio
    async def test_process_partial_only_whisper(self, mock_whisper_result):
        """
        Test: Process partial results (Whisper only)
        Given: Audio buffer is ready for partial transcription
        When: process_partial() is called
        Then: Only Whisper transcription is executed (no alignment, diarization, LLM)
        """
        from services.gpu_pipeline import GPUPipeline

        with patch('torch.cuda.is_available', return_value=True):
            with patch('torch.cuda.get_device_name', return_value='NVIDIA RTX 3090'):
                with patch.object(GPUPipeline, '_load_models'):
                    pipeline = GPUPipeline()
                    pipeline.whisper_model = MagicMock()
                    pipeline.whisper_processor = MagicMock()
                    pipeline.whisper_processor.return_value = MagicMock(input_features=MagicMock(to=MagicMock(return_value=MagicMock())))
                    pipeline.whisper_model.generate = MagicMock(return_value=[[1, 2, 3]])
                    pipeline.whisper_processor.batch_decode = MagicMock(return_value=['これはテスト音声です。'])
                    pipeline.device = 'cuda'
            
            # Mock audio data
            audio_data = b'\x00' * 1024
            buffer_id = 'buff_20250105_120000_001'
            buffer_start_time = 1234567890.0
            
            result = await pipeline.process_partial(
                audio_data=audio_data,
                buffer_id=buffer_id,
                buffer_start_time=buffer_start_time
            )
            
            assert result is not None
            assert result['type'] == 'partial'
            assert result['buffer_id'] == buffer_id
            assert 'text' in result
            assert 'segments' in result

    @pytest.mark.asyncio
    async def test_partial_result_json_format(self, mock_whisper_result):
        """
        Test: Partial result JSON format
        Given: Partial transcription is complete
        When: Result is formatted for WebSocket
        Then: JSON contains type="partial", buffer_id, timestamp_range, segments
        """
        from services.gpu_pipeline import GPUPipeline

        with patch('torch.cuda.is_available', return_value=True):
            with patch('torch.cuda.get_device_name', return_value='NVIDIA RTX 3090'):
                with patch.object(GPUPipeline, '_load_models'):
                    pipeline = GPUPipeline()
                    pipeline.whisper_model = MagicMock()
                    pipeline.whisper_processor = MagicMock()
                    pipeline.whisper_processor.return_value = MagicMock(input_features=MagicMock(to=MagicMock(return_value=MagicMock())))
                    pipeline.whisper_model.generate = MagicMock(return_value=[[1, 2, 3]])
                    pipeline.whisper_processor.batch_decode = MagicMock(return_value=['これはテスト音声です。'])
                    pipeline.device = 'cuda'
            
            audio_data = b'\x00' * 1024
            buffer_id = 'buff_20250105_120000_001'
            buffer_start_time = 1234567890.0
            
            result = await pipeline.process_partial(
                audio_data=audio_data,
                buffer_id=buffer_id,
                buffer_start_time=buffer_start_time
            )
            
            # Validate JSON structure
            assert result['type'] == 'partial'
            assert result['buffer_id'] == buffer_id
            assert 'timestamp_range' in result
            assert 'start' in result['timestamp_range']
            assert 'end' in result['timestamp_range']
            assert isinstance(result['segments'], list)

    @pytest.mark.asyncio
    async def test_partial_result_timestamp_range(self, mock_whisper_result):
        """
        Test: Timestamp range calculation for partial results
        Given: Whisper returns segments with timestamps
        When: process_partial() formats result
        Then: timestamp_range contains min start and max end from all segments
        """
        from services.gpu_pipeline import GPUPipeline

        mock_result = {
            'text': 'テスト',
            'segments': [
                {'start': 0.0, 'end': 1.5, 'text': 'これは'},
                {'start': 1.5, 'end': 3.0, 'text': 'テストです'}
            ]
        }

        with patch('torch.cuda.is_available', return_value=True):
            with patch('torch.cuda.get_device_name', return_value='NVIDIA RTX 3090'):
                with patch.object(GPUPipeline, '_load_models'):
                    pipeline = GPUPipeline()
                    pipeline.whisper_model = MagicMock()
                    pipeline.whisper_processor = MagicMock()
                    pipeline.whisper_processor.return_value = MagicMock(input_features=MagicMock(to=MagicMock(return_value=MagicMock())))
                    pipeline.whisper_model.generate = MagicMock(return_value=[[1, 2, 3]])
                    pipeline.whisper_processor.batch_decode = MagicMock(return_value=['これはテストです'])
                    pipeline.device = 'cuda'
            
            audio_data = b'\x00' * 1024
            buffer_id = 'buff_20250105_120000_001'
            buffer_start_time = 1234567890.0
            
            result = await pipeline.process_partial(
                audio_data=audio_data,
                buffer_id=buffer_id,
                buffer_start_time=buffer_start_time
            )
            
            # Timestamp range should be min start (0.0) to max end (3.0)
            assert result['timestamp_range']['start'] == 0.0
            assert result['timestamp_range']['end'] == 3.0

    @pytest.mark.asyncio
    async def test_partial_result_latency_measurement(self, mock_whisper_result):
        """
        Test: Latency measurement for partial results
        Given: Partial processing is executed
        When: process_partial() completes
        Then: Latency is measured and logged (target: 2-3 seconds)
        """
        from services.gpu_pipeline import GPUPipeline

        with patch('torch.cuda.is_available', return_value=True):
            with patch('torch.cuda.get_device_name', return_value='NVIDIA RTX 3090'):
                with patch.object(GPUPipeline, '_load_models'):
                    pipeline = GPUPipeline()
                    pipeline.whisper_model = MagicMock()
                    pipeline.whisper_processor = MagicMock()
                    pipeline.whisper_processor.return_value = MagicMock(input_features=MagicMock(to=MagicMock(return_value=MagicMock())))
                    pipeline.whisper_model.generate = MagicMock(return_value=[[1, 2, 3]])
                    pipeline.whisper_processor.batch_decode = MagicMock(return_value=['これはテスト音声です。'])
                    pipeline.device = 'cuda'
            
            audio_data = b'\x00' * 1024
            buffer_id = 'buff_20250105_120000_001'
            buffer_start_time = 1234567890.0
            
            start_time = time.time()
            result = await pipeline.process_partial(
                audio_data=audio_data,
                buffer_id=buffer_id,
                buffer_start_time=buffer_start_time
            )
            latency = time.time() - start_time
            
            # Latency should be measured
            assert 'latency_ms' in result
            assert result['latency_ms'] > 0

    @pytest.mark.asyncio
    async def test_partial_result_segments_structure(self, mock_whisper_result):
        """
        Test: Segments structure in partial results
        Given: Whisper returns segments
        When: process_partial() formats segments
        Then: Each segment contains start, end, text
        """
        from services.gpu_pipeline import GPUPipeline

        with patch('torch.cuda.is_available', return_value=True):
            with patch('torch.cuda.get_device_name', return_value='NVIDIA RTX 3090'):
                with patch.object(GPUPipeline, '_load_models'):
                    pipeline = GPUPipeline()
                    pipeline.whisper_model = MagicMock()
                    pipeline.whisper_processor = MagicMock()
                    pipeline.whisper_processor.return_value = MagicMock(input_features=MagicMock(to=MagicMock(return_value=MagicMock())))
                    pipeline.whisper_model.generate = MagicMock(return_value=[[1, 2, 3]])
                    pipeline.whisper_processor.batch_decode = MagicMock(return_value=['これはテスト音声です。'])
                    pipeline.device = 'cuda'
            
            audio_data = b'\x00' * 1024
            buffer_id = 'buff_20250105_120000_001'
            buffer_start_time = 1234567890.0
            
            result = await pipeline.process_partial(
                audio_data=audio_data,
                buffer_id=buffer_id,
                buffer_start_time=buffer_start_time
            )
            
            # Validate segment structure
            for segment in result['segments']:
                assert 'start' in segment
                assert 'end' in segment
                assert 'text' in segment

    @pytest.mark.asyncio
    async def test_partial_result_empty_transcription(self):
        """
        Test: Handle empty transcription (silence)
        Given: Audio buffer contains only silence
        When: Whisper returns empty result
        Then: Partial result with empty segments is returned
        """
        from services.gpu_pipeline import GPUPipeline

        mock_empty_result = {
            'text': '',
            'segments': []
        }

        with patch('torch.cuda.is_available', return_value=True):
            with patch('torch.cuda.get_device_name', return_value='NVIDIA RTX 3090'):
                with patch.object(GPUPipeline, '_load_models'):
                    pipeline = GPUPipeline()
                    pipeline.whisper_model = MagicMock()
                    pipeline.whisper_processor = MagicMock()
                    pipeline.whisper_processor.return_value = MagicMock(input_features=MagicMock(to=MagicMock(return_value=MagicMock())))
                    pipeline.whisper_model.generate = MagicMock(return_value=[[1, 2, 3]])
                    pipeline.whisper_processor.batch_decode = MagicMock(return_value=[''])
                    pipeline.device = 'cuda'
            
            audio_data = b'\x00' * 1024
            buffer_id = 'buff_20250105_120000_001'
            buffer_start_time = 1234567890.0
            
            result = await pipeline.process_partial(
                audio_data=audio_data,
                buffer_id=buffer_id,
                buffer_start_time=buffer_start_time
            )
            
            assert result['type'] == 'partial'
            assert result['text'] == ''
            assert result['segments'] == []

    @pytest.mark.asyncio
    async def test_partial_result_error_handling(self):
        """
        Test: Error handling during partial processing
        Given: Whisper transcription fails
        When: Exception occurs during process_partial()
        Then: Error result is returned with type="error"
        """
        from services.gpu_pipeline import GPUPipeline

        with patch('torch.cuda.is_available', return_value=True):
            with patch('torch.cuda.get_device_name', return_value='NVIDIA RTX 3090'):
                with patch.object(GPUPipeline, '_load_models'):
                    pipeline = GPUPipeline()
                    pipeline.whisper_model = MagicMock()
                    pipeline.whisper_processor = MagicMock()
                    pipeline.whisper_processor.side_effect = Exception("Transcription failed")
                    pipeline.device = 'cuda'
            
            audio_data = b'\x00' * 1024
            buffer_id = 'buff_20250105_120000_001'
            buffer_start_time = 1234567890.0
            
            result = await pipeline.process_partial(
                audio_data=audio_data,
                buffer_id=buffer_id,
                buffer_start_time=buffer_start_time
            )
            
            assert 'error' in result
            assert result['error'] == True
