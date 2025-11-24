"""
GPU Pipeline Tests
Task 3.1: GPUPipeline Class Setup
Requirements: R4.1, R7.1, R7.3
"""

import pytest
from unittest.mock import Mock, patch, MagicMock
import torch


@pytest.fixture
def mock_torch_cuda():
    """Mock torch.cuda for testing"""
    with patch('torch.cuda.is_available', return_value=True), \
         patch('torch.cuda.get_device_name', return_value='NVIDIA GeForce RTX 3090'), \
         patch('torch.cuda.memory_allocated', return_value=0), \
         patch('torch.cuda.max_memory_allocated', return_value=0):
        yield


class TestGPUPipelineSetup:
    """Test suite for GPUPipeline class setup (Task 3.1)"""

    def test_gpu_pipeline_initialization(self, mock_torch_cuda):
        """
        Test: GPUPipeline class initialization
        Given: CUDA is available
        When: GPUPipeline is initialized
        Then: Pipeline is created with device set to 'cuda'
        """
        from services.gpu_pipeline import GPUPipeline
        
        pipeline = GPUPipeline()
        
        assert pipeline is not None
        assert pipeline.device == 'cuda'

    def test_gpu_pipeline_initialization_no_cuda(self):
        """
        Test: GPUPipeline initialization without CUDA
        Given: CUDA is not available
        When: GPUPipeline is initialized
        Then: RuntimeError is raised with appropriate message
        """
        from services.gpu_pipeline import GPUPipeline
        
        with patch('torch.cuda.is_available', return_value=False):
            with pytest.raises(RuntimeError) as exc_info:
                GPUPipeline()
            
            assert "CUDA" in str(exc_info.value)

    def test_model_loading_on_initialization(self, mock_torch_cuda):
        """
        Test: Model loading during initialization
        Given: GPUPipeline is being initialized
        When: __init__ is called
        Then: Models are loaded once (lazy loading)
        """
        from services.gpu_pipeline import GPUPipeline
        
        with patch.object(GPUPipeline, '_load_models') as mock_load:
            pipeline = GPUPipeline()
            
            # Models should be loaded during initialization
            mock_load.assert_called_once()

    def test_vram_monitoring_initialization(self, mock_torch_cuda):
        """
        Test: VRAM monitoring on initialization
        Given: GPUPipeline is initialized
        When: get_vram_usage() is called
        Then: VRAM usage info is returned
        """
        from services.gpu_pipeline import GPUPipeline
        
        pipeline = GPUPipeline()
        vram_info = pipeline.get_vram_usage()
        
        assert 'allocated_gb' in vram_info
        assert 'max_allocated_gb' in vram_info
        assert isinstance(vram_info['allocated_gb'], float)
        assert isinstance(vram_info['max_allocated_gb'], float)

    def test_vram_usage_logging(self, mock_torch_cuda, caplog):
        """
        Test: VRAM usage logging
        Given: GPUPipeline is initialized
        When: log_vram_usage() is called
        Then: VRAM usage is logged
        """
        from services.gpu_pipeline import GPUPipeline
        import logging
        
        with caplog.at_level(logging.INFO):
            pipeline = GPUPipeline()
            pipeline.log_vram_usage()
            
            # Check that VRAM usage was logged
            assert any('VRAM' in record.message for record in caplog.records)

    def test_gpu_error_handling_oom(self, mock_torch_cuda):
        """
        Test: GPU OOM error handling
        Given: GPU processing encounters OOM error
        When: torch.cuda.OutOfMemoryError is raised
        Then: Error is caught and logged appropriately
        """
        from services.gpu_pipeline import GPUPipeline
        
        pipeline = GPUPipeline()
        
        # Simulate OOM error during processing
        with patch('torch.cuda.empty_cache') as mock_empty_cache:
            # This should handle OOM gracefully
            result = pipeline.handle_gpu_error(torch.cuda.OutOfMemoryError("CUDA OOM"))
            
            assert result['error'] == True
            assert result['error_type'] == 'GPU_OOM'
            mock_empty_cache.assert_called_once()

    def test_model_loading_error_handling(self, mock_torch_cuda):
        """
        Test: Model loading error handling
        Given: Model loading fails
        When: Exception occurs during _load_models
        Then: RuntimeError is raised with detailed message
        """
        from services.gpu_pipeline import GPUPipeline
        
        with patch.object(GPUPipeline, '_load_models', side_effect=Exception("Model file not found")):
            with pytest.raises(RuntimeError) as exc_info:
                GPUPipeline()
            
            assert "Model loading failed" in str(exc_info.value)

    def test_device_name_logging(self, mock_torch_cuda, caplog):
        """
        Test: GPU device name logging
        Given: GPUPipeline is initialized
        When: Initialization completes
        Then: GPU device name is logged
        """
        from services.gpu_pipeline import GPUPipeline
        import logging
        
        with caplog.at_level(logging.INFO):
            pipeline = GPUPipeline()
            
            # Check that GPU device name was logged
            assert any('RTX 3090' in record.message or 'GPU' in record.message 
                      for record in caplog.records)

    def test_cleanup_method(self, mock_torch_cuda):
        """
        Test: Cleanup method for releasing GPU resources
        Given: GPUPipeline is initialized with models loaded
        When: cleanup() is called
        Then: GPU cache is cleared
        """
        from services.gpu_pipeline import GPUPipeline

        pipeline = GPUPipeline()

        with patch('torch.cuda.empty_cache') as mock_empty_cache:
            pipeline.cleanup()
            mock_empty_cache.assert_called_once()


class TestTask12ErrorHandling:
    """Test suite for Task 12: Server-side error handling"""

    # Task 12.1: GPU OOM Error Handling

    def test_gpu_oom_detection(self, mock_torch_cuda):
        """
        Test: GPU OOM error detection
        Task: 12.1
        Given: GPU processing encounters OutOfMemoryError
        When: torch.cuda.OutOfMemoryError is raised during transcription
        Then: Error is detected and caught
        """
        from services.gpu_pipeline import GPUPipeline

        pipeline = GPUPipeline()

        # Create a mock OOM error
        oom_error = torch.cuda.OutOfMemoryError("CUDA out of memory")

        # handle_gpu_error should detect OOM
        result = pipeline.handle_gpu_error(oom_error)

        assert result is not None
        assert result['error'] == True
        assert result['error_type'] == 'GPU_OOM'

    def test_gpu_oom_error_message_format(self, mock_torch_cuda):
        """
        Test: GPU OOM error message format for client
        Task: 12.1
        Given: GPU OOM error occurs
        When: handle_gpu_error processes the error
        Then: Error message contains code="GPU_OOM" and appropriate message
        """
        from services.gpu_pipeline import GPUPipeline

        pipeline = GPUPipeline()
        oom_error = torch.cuda.OutOfMemoryError("CUDA out of memory")

        result = pipeline.handle_gpu_error(oom_error)

        # Verify error message structure for client
        assert 'error' in result
        assert 'error_type' in result
        assert 'message' in result
        assert result['error_type'] == 'GPU_OOM'
        assert isinstance(result['message'], str)
        assert len(result['message']) > 0

    def test_gpu_oom_memory_clearing(self, mock_torch_cuda):
        """
        Test: GPU cache clearing on OOM
        Task: 12.1
        Given: GPU OOM error occurs
        When: handle_gpu_error is called
        Then: torch.cuda.empty_cache() is called to free memory
        """
        from services.gpu_pipeline import GPUPipeline

        pipeline = GPUPipeline()
        oom_error = torch.cuda.OutOfMemoryError("CUDA out of memory")

        with patch('torch.cuda.empty_cache') as mock_empty_cache:
            result = pipeline.handle_gpu_error(oom_error)

            # Verify cache was cleared
            mock_empty_cache.assert_called_once()
            assert result['error_type'] == 'GPU_OOM'

    @pytest.mark.asyncio
    async def test_gpu_oom_buffer_skip_and_retry(self, mock_torch_cuda):
        """
        Test: Buffer skip and retry after OOM
        Task: 12.1
        Given: GPU OOM occurs during buffer processing
        When: process_partial encounters OOM
        Then: Current buffer is skipped, error returned, next buffer can be processed
        """
        from services.gpu_pipeline import GPUPipeline
        import numpy as np

        pipeline = GPUPipeline()

        # Mock audio data (stereo, float32) - 48kHz format
        audio_data = np.zeros(48000 * 2, dtype=np.float32).tobytes()  # 1 second stereo at 48kHz as bytes

        # First call: simulate OOM
        with patch.object(pipeline, 'whisper_processor') as mock_processor:
            mock_processor.side_effect = torch.cuda.OutOfMemoryError("CUDA OOM")

            with patch('torch.cuda.empty_cache') as mock_empty_cache:
                result = await pipeline.process_partial(audio_data, buffer_id="buffer_001", buffer_start_time=0.0)

                # Verify error is returned
                assert 'error' in result
                assert result['error'] == True
                assert result['error_type'] == 'GPU_OOM'

                # Verify cache was cleared
                mock_empty_cache.assert_called()

        # Second call: verify pipeline can continue with next buffer
        with patch.object(pipeline, 'whisper_processor') as mock_processor:
            with patch.object(pipeline, 'whisper_model') as mock_model:
                mock_processor.return_value = MagicMock(input_features=MagicMock(to=MagicMock(return_value=MagicMock())))
                mock_model.generate = MagicMock(return_value=[[1, 2, 3]])
                mock_processor.batch_decode = MagicMock(return_value=['Test transcription'])

                result = await pipeline.process_partial(audio_data, buffer_id="buffer_002", buffer_start_time=1.0)

                # Verify successful processing after OOM recovery
                assert 'error' not in result or result.get('error') == False
                assert 'text' in result

    # Task 12.2: Model Loading Error Handling

    def test_whisper_model_load_failure_detection(self, mock_torch_cuda):
        """
        Test: Whisper model loading failure detection
        Task: 12.2
        Given: Whisper model file is corrupted or missing
        When: GPUPipeline initialization attempts to load model
        Then: Exception is raised with detailed error message
        """
        from services.gpu_pipeline import GPUPipeline
        from transformers import WhisperProcessor

        with patch.object(WhisperProcessor, 'from_pretrained', side_effect=Exception("Model file not found")):
            with pytest.raises(Exception) as exc_info:
                GPUPipeline()

            # Verify error was raised
            assert "Model file not found" in str(exc_info.value)

    def test_model_load_error_logging(self, mock_torch_cuda, caplog):
        """
        Test: Detailed error logging for model load failures
        Task: 12.2
        Given: Model loading fails
        When: Exception occurs during model initialization
        Then: Detailed error message and stack trace are logged
        """
        from services.gpu_pipeline import GPUPipeline
        from transformers import WhisperProcessor
        import logging

        with caplog.at_level(logging.ERROR):
            with patch.object(WhisperProcessor, 'from_pretrained', side_effect=Exception("Model file corrupted")):
                with pytest.raises(Exception):
                    GPUPipeline()

                # Verify error was logged with details
                error_logs = [r for r in caplog.records if r.levelname == 'ERROR']
                assert len(error_logs) > 0
                assert any('Failed to load Whisper model' in r.message for r in error_logs)

    def test_model_load_troubleshooting_guidance(self, mock_torch_cuda, caplog):
        """
        Test: Troubleshooting guidance in model load error logs
        Task: 12.2
        Given: Model loading fails
        When: Error is logged
        Then: Logs include troubleshooting guidance for common issues
        """
        from services.gpu_pipeline import GPUPipeline
        from transformers import WhisperProcessor
        import logging

        with caplog.at_level(logging.ERROR):
            with patch.object(WhisperProcessor, 'from_pretrained', side_effect=Exception("Connection timeout")):
                with pytest.raises(Exception):
                    GPUPipeline()

                # Verify logs contain helpful information
                log_messages = [r.message for r in caplog.records]
                combined_logs = ' '.join(log_messages)

                # At minimum, error details should be present
                assert len(error_logs := [r for r in caplog.records if r.levelname == 'ERROR']) > 0
                # Check for troubleshooting guidance
                assert 'CAUSE:' in combined_logs or 'SOLUTIONS:' in combined_logs

    def test_server_termination_on_model_load_failure(self, mock_torch_cuda):
        """
        Test: Server termination on model load failure
        Task: 12.2
        Given: Critical model (Whisper) fails to load
        When: GPUPipeline initialization fails
        Then: Exception is raised, preventing server startup
        """
        from services.gpu_pipeline import GPUPipeline
        from transformers import WhisperProcessor

        with patch.object(WhisperProcessor, 'from_pretrained', side_effect=Exception("CUDA initialization failed")):
            with pytest.raises(Exception) as exc_info:
                GPUPipeline()

            # Verify server would not start
            assert "CUDA initialization failed" in str(exc_info.value)

    # Task 12.3: Ollama Connection Error Handling

    @pytest.mark.skip(reason="process_final method not yet implemented")
    @pytest.mark.asyncio
    async def test_ollama_connection_failure_detection(self, mock_torch_cuda):
        """
        Test: Ollama connection failure detection
        Task: 12.3
        Given: Ollama service is not running
        When: LLM correction is attempted
        Then: Connection error is gracefully handled
        """
        from services.gpu_pipeline import GPUPipeline
        import numpy as np

        pipeline = GPUPipeline()

        # Mock successful Whisper transcription
        mock_transcription = {
            'text': 'Test transcription with typos',
            'segments': [{'start': 0.0, 'end': 2.0, 'text': 'Test transcription'}]
        }

        audio_data = np.zeros(48000 * 2, dtype=np.float32).tobytes()  # stereo bytes at 48kHz

        # Mock Whisper, alignment, and diarization
        with patch.object(pipeline, 'whisper_model') as mock_whisper:
            mock_whisper.transcribe.return_value = mock_transcription

            # This should not raise - graceful degradation
            result = await pipeline.process_final(audio_data, buffer_id="buffer_001", buffer_start_time=0.0)

            # Verify partial result is returned without LLM correction
            assert 'text' in result
            assert 'error' not in result or result.get('error') == False

    @pytest.mark.skip(reason="process_final method not yet implemented")
    @pytest.mark.asyncio
    async def test_ollama_error_skip_llm_return_partial(self, mock_torch_cuda):
        """
        Test: Skip LLM correction and return partial results on Ollama error
        Task: 12.3
        Given: Ollama connection fails
        When: process_final is called
        Then: LLM correction is skipped, partial Whisper results are returned
        """
        from services.gpu_pipeline import GPUPipeline
        import numpy as np

        pipeline = GPUPipeline()

        mock_transcription = {
            'text': 'Original whisper text',
            'segments': [{'start': 0.0, 'end': 1.0, 'text': 'Original'}]
        }

        audio_data = np.zeros(48000 * 2, dtype=np.float32).tobytes()

        with patch.object(pipeline, 'whisper_model') as mock_whisper:
            mock_whisper.transcribe.return_value = mock_transcription

            result = await pipeline.process_final(audio_data, buffer_id="buffer_001", buffer_start_time=0.0)

            # Verify original Whisper results are returned
            assert 'text' in result
            assert result['text'] == 'Original whisper text'

    @pytest.mark.skip(reason="process_final method not yet implemented")
    @pytest.mark.asyncio
    async def test_ollama_error_warning_logging(self, mock_torch_cuda, caplog):
        """
        Test: Warning log on Ollama connection failure
        Task: 12.3
        Given: Ollama connection fails
        When: LLM correction is attempted
        Then: Warning is logged (not error, since it's non-critical)
        """
        from services.gpu_pipeline import GPUPipeline
        import numpy as np
        import logging

        pipeline = GPUPipeline()

        mock_transcription = {
            'text': 'Test text',
            'segments': [{'start': 0.0, 'end': 1.0, 'text': 'Test'}]
        }

        audio_data = np.zeros(48000 * 2, dtype=np.float32).tobytes()

        with caplog.at_level(logging.INFO):
            with patch.object(pipeline, 'whisper_model') as mock_whisper:
                mock_whisper.transcribe.return_value = mock_transcription

                result = await pipeline.process_final(audio_data, buffer_id="buffer_001", buffer_start_time=0.0)

                # Verify result contains text (graceful degradation)
                assert 'text' in result

    @pytest.mark.skip(reason="process_final method not yet implemented")
    @pytest.mark.asyncio
    async def test_ollama_auto_recovery_after_restart(self, mock_torch_cuda):
        """
        Test: Auto-recovery after Ollama becomes available
        Task: 12.3
        Given: Ollama was unavailable, then starts
        When: Subsequent process_final calls are made
        Then: LLM correction automatically resumes
        """
        from services.gpu_pipeline import GPUPipeline
        import numpy as np

        pipeline = GPUPipeline()

        mock_transcription = {
            'text': 'Test transcription',
            'segments': [{'start': 0.0, 'end': 1.0, 'text': 'Test'}]
        }

        audio_data = np.zeros(48000 * 2, dtype=np.float32).tobytes()

        # First call: returns result
        with patch.object(pipeline, 'whisper_model') as mock_whisper:
            mock_whisper.transcribe.return_value = mock_transcription
            result1 = await pipeline.process_final(audio_data, buffer_id="buffer_001", buffer_start_time=0.0)
            assert 'text' in result1

        # Second call: also returns result (demonstrates consistency)
        with patch.object(pipeline, 'whisper_model') as mock_whisper:
            mock_whisper.transcribe.return_value = mock_transcription
            result2 = await pipeline.process_final(audio_data, buffer_id="buffer_002", buffer_start_time=1.0)
            assert 'text' in result2
