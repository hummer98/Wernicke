"""
GPU Processing Pipeline
Task 3.1: GPUPipeline Class Setup
Task 3.2: Whisper Audio Recognition Integration
Task 4.1: Partial Results Processing Pipeline
Requirements: R4.1, R7.1, R7.3, R3.3, R3.1, R5.1, R8.1
更新: transformersライブラリ使用 (Python 3.14互換)
"""

import torch
from transformers import WhisperProcessor, WhisperForConditionalGeneration
import numpy as np
import logging
import time
from typing import Dict, Any, Optional, List
from silero_vad import load_silero_vad, get_speech_timestamps

# Logging configuration
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


class GPUPipeline:
    """
    GPU Processing Pipeline for audio transcription
    
    Manages:
    - GPU device initialization
    - Model loading (Whisper, Wav2Vec2, pyannote)
    - VRAM monitoring
    - Error handling for GPU operations
    """
    
    def __init__(self):
        """
        Initialize GPU Pipeline
        
        Raises:
            RuntimeError: If CUDA is not available or model loading fails
        """
        # Check CUDA availability
        if not torch.cuda.is_available():
            raise RuntimeError(
                "CUDA is not available. This system requires a CUDA-capable GPU. "
                "Please ensure CUDA is installed and a compatible GPU is present."
            )
        
        self.device = 'cuda'
        
        # Log GPU device information
        gpu_name = torch.cuda.get_device_name(0)
        logger.info(f"GPU Pipeline initialized: {gpu_name}")
        
        # Load models
        try:
            self._load_models()
            logger.info("All models loaded successfully")
        except Exception as e:
            logger.error(f"Model loading failed: {str(e)}", exc_info=True)
            raise RuntimeError(f"Model loading failed: {str(e)}") from e
        
        # Log initial VRAM usage
        self.log_vram_usage()
    
    def _load_models(self):
        """
        Load AI models (Whisper, Silero-VAD, Wav2Vec2, pyannote)

        This is called once during initialization.
        Models are loaded lazily to avoid unnecessary memory usage.
        """
        logger.info("Loading models...")

        # Load Whisper model
        self._load_whisper_model()

        # Load Silero-VAD model for hallucination prevention
        self._load_vad_model()

        # Future: Load Wav2Vec2, pyannote

        torch.cuda.empty_cache()
        logger.info("Model loading complete")

    def _load_whisper_model(self):
        """
        Load Whisper large-v3 model using transformers

        Task 3.2: Whisper Audio Recognition Integration
        Task 12.2: Enhanced model loading error handling with troubleshooting guidance
        更新: transformersライブラリ使用 (Python 3.14互換)
        """
        logger.info("Loading Whisper large-v3 model using transformers...")

        try:
            model_name = "openai/whisper-large-v3"
            
            # Load processor and model
            self.whisper_processor = WhisperProcessor.from_pretrained(model_name)
            self.whisper_model = WhisperForConditionalGeneration.from_pretrained(
                model_name,
                torch_dtype=torch.float16 if self.device == "cuda" else torch.float32,
                device_map=self.device
            )
            
            # Set language and task tokens
            self.whisper_processor.tokenizer.set_prefix_tokens(language="ja", task="transcribe")
            
            logger.info("Whisper large-v3 model loaded successfully using transformers")
        except Exception as e:
            # Task 12.2: Detailed error logging with troubleshooting guidance
            logger.error(f"Failed to load Whisper model: {str(e)}", exc_info=True)
            logger.error("=" * 60)
            logger.error("MODEL LOADING ERROR - Troubleshooting Guide:")
            logger.error("=" * 60)

            error_msg = str(e).lower()

            # Provide context-specific guidance
            if "out of memory" in error_msg or "oom" in error_msg:
                logger.error("CAUSE: Insufficient GPU memory (VRAM)")
                logger.error("SOLUTIONS:")
                logger.error("  1. Close other GPU-intensive applications")
                logger.error("  2. Reduce model size (use 'base' or 'medium' instead of 'large-v3')")
                logger.error("  3. Upgrade to GPU with more VRAM (current model needs ~3GB)")
            elif "cuda" in error_msg:
                logger.error("CAUSE: CUDA initialization or compatibility issue")
                logger.error("SOLUTIONS:")
                logger.error("  1. Verify CUDA toolkit is installed (nvidia-smi)")
                logger.error("  2. Check PyTorch CUDA compatibility: torch.cuda.is_available()")
                logger.error("  3. Reinstall PyTorch with matching CUDA version")
                logger.error("  4. Update NVIDIA drivers to latest version")
            elif "connection" in error_msg or "network" in error_msg or "timeout" in error_msg:
                logger.error("CAUSE: Network connection issue downloading model")
                logger.error("SOLUTIONS:")
                logger.error("  1. Check internet connection")
                logger.error("  2. Retry after a few minutes")
                logger.error("  3. Download model manually from Hugging Face")
                logger.error("  4. Check firewall/proxy settings")
            elif "permission" in error_msg or "access" in error_msg:
                logger.error("CAUSE: File system permission issue")
                logger.error("SOLUTIONS:")
                logger.error("  1. Check write permissions in ~/.cache/huggingface/")
                logger.error("  2. Run with appropriate user permissions")
                logger.error("  3. Verify disk space availability")
            else:
                logger.error("CAUSE: Unknown error")
                logger.error("SOLUTIONS:")
                logger.error("  1. Check error message above for details")
                logger.error("  2. Verify transformers package installation: pip list | grep transformers")
                logger.error("  3. Try reinstalling: pip install --upgrade --force-reinstall transformers")
                logger.error("  4. Check Python version compatibility (Python 3.8-3.14 supported)")

            logger.error("=" * 60)
            logger.error("Server startup aborted due to critical model loading failure")
            logger.error("=" * 60)
            raise

    def _load_vad_model(self):
        """
        Load Silero-VAD model for voice activity detection

        Purpose: Detect speech segments to prevent hallucinations on silence/noise
        """
        logger.info("Loading Silero-VAD model...")

        try:
            # Load Silero-VAD model (supports 8kHz and 16kHz)
            self.vad_model = load_silero_vad()
            logger.info("Silero-VAD model loaded successfully")
        except Exception as e:
            logger.error(f"Failed to load Silero-VAD model: {str(e)}", exc_info=True)
            logger.warning("VAD will be disabled, hallucinations may occur on silence/noise")
            self.vad_model = None

    def get_vram_usage(self) -> Dict[str, float]:
        """
        Get current VRAM usage
        
        Returns:
            Dict with 'allocated_gb' and 'max_allocated_gb' keys
        """
        allocated = torch.cuda.memory_allocated(0) / (1024 ** 3)  # Convert to GB
        max_allocated = torch.cuda.max_memory_allocated(0) / (1024 ** 3)
        
        return {
            'allocated_gb': allocated,
            'max_allocated_gb': max_allocated
        }
    
    def log_vram_usage(self):
        """Log current VRAM usage"""
        vram_info = self.get_vram_usage()
        logger.info(
            f"VRAM Usage: {vram_info['allocated_gb']:.2f} GB allocated, "
            f"{vram_info['max_allocated_gb']:.2f} GB max allocated"
        )
    
    def handle_gpu_error(self, error: Exception) -> Dict[str, Any]:
        """
        Handle GPU errors (especially OOM)
        
        Args:
            error: The exception that occurred
            
        Returns:
            Dict with error information
        """
        if isinstance(error, torch.cuda.OutOfMemoryError):
            logger.error("GPU Out of Memory error occurred", exc_info=True)
            
            # Clear GPU cache
            torch.cuda.empty_cache()
            logger.info("GPU cache cleared")
            
            return {
                'error': True,
                'error_type': 'GPU_OOM',
                'message': 'GPU Out of Memory. Buffer will be skipped.'
            }
        else:
            logger.error(f"GPU error: {str(error)}", exc_info=True)
            return {
                'error': True,
                'error_type': 'GPU_ERROR',
                'message': str(error)
            }
    
    def _detect_speech_segments(self, audio_np: np.ndarray) -> bool:
        """
        Detect if audio contains speech using Silero-VAD

        Args:
            audio_np: Audio numpy array (16kHz mono float32)

        Returns:
            True if speech detected, False otherwise
        """
        if self.vad_model is None:
            # VAD disabled, assume speech present
            return True

        try:
            # Convert numpy to torch tensor for VAD
            audio_tensor = torch.from_numpy(audio_np)

            # Get speech timestamps (returns list of {'start': int, 'end': int})
            speech_timestamps = get_speech_timestamps(
                audio_tensor,
                self.vad_model,
                threshold=0.5,  # Confidence threshold (0.0-1.0)
                sampling_rate=16000,
                min_speech_duration_ms=250,  # Minimum speech segment
                min_silence_duration_ms=100,  # Minimum silence between segments
                return_seconds=False
            )

            has_speech = len(speech_timestamps) > 0

            if has_speech:
                total_speech_duration = sum(
                    (seg['end'] - seg['start']) / 16000.0
                    for seg in speech_timestamps
                )
                logger.info(f"VAD: Speech detected ({len(speech_timestamps)} segments, {total_speech_duration:.2f}s total)")
            else:
                logger.info("VAD: No speech detected (silence/noise only)")

            return has_speech

        except Exception as e:
            logger.error(f"VAD error: {str(e)}", exc_info=True)
            # On error, assume speech present to avoid skipping valid audio
            return True

    async def transcribe_audio(
        self,
        audio_data: bytes,
        buffer_start_time: float
    ) -> Dict[str, Any]:
        """
        Transcribe audio buffer using transformers Whisper

        Task 3.2: Whisper Audio Recognition Integration
        更新: transformersライブラリ使用 + Silero-VAD前処理

        Args:
            audio_data: Raw audio bytes (16kHz, mono, float32)
            buffer_start_time: Buffer start timestamp (for relative timestamps)

        Returns:
            Dict with 'text', 'segments' (with relative timestamps), or 'error'
        """
        try:
            # Convert bytes to numpy array
            # Format: 16kHz, 1 channel (mono), float32 (4 bytes per sample)
            audio_np = np.frombuffer(audio_data, dtype=np.float32)

            logger.info(f"Transcribing audio: {len(audio_np)} samples at 16kHz")

            # Silero-VAD: Check if audio contains speech
            has_speech = self._detect_speech_segments(audio_np)

            if not has_speech:
                # No speech detected - return empty result (prevent hallucinations)
                logger.info("Skipping transcription: No speech detected by VAD")
                return {
                    'text': '',
                    'segments': [],
                    'vad_skipped': True
                }

            # Prepare input for Whisper (already in correct format: 16kHz mono)
            input_features = self.whisper_processor(
                audio_np.astype(np.float32),
                sampling_rate=16000,  # Whisper's expected sample rate
                return_tensors="pt"
            ).input_features

            # Convert to appropriate dtype and move to device
            if self.device == "cuda":
                input_features = input_features.to(self.device, dtype=torch.float16)
            else:
                input_features = input_features.to(self.device)

            # Generate transcription
            predicted_ids = self.whisper_model.generate(
                input_features,
                language="ja",
                task="transcribe",
                return_timestamps=True
            )

            # Decode transcription
            transcription_list = self.whisper_processor.batch_decode(
                predicted_ids,
                skip_special_tokens=True
            )

            # Extract text (batch_decode returns a list of strings)
            text = transcription_list[0] if transcription_list else ""
            segments = []

            # Convert timestamp tokens to segments
            # Note: transformers Whisper doesn't provide detailed timestamps by default
            # For now, we'll create a single segment with the full text
            # Future: Implement proper timestamp extraction
            if text.strip():
                segments = [{
                    'start': 0.0,
                    'end': len(audio_np) / 16000.0,  # Approximate duration at 16kHz
                    'text': text
                }]

            logger.info(f"Transcription complete: {len(segments)} segments, text_length={len(text)}")

            return {
                'text': text,
                'segments': segments
            }

        except torch.cuda.OutOfMemoryError as e:
            # Task 12.1: GPU OOM error handling
            logger.error("GPU Out of Memory during transcription", exc_info=True)
            error_info = self.handle_gpu_error(e)
            return error_info
        except Exception as e:
            logger.error(f"Transcription error: {str(e)}", exc_info=True)
            return {
                'error': True,
                'message': str(e)
            }

    async def process_partial_and_get_whisper_result(
        self,
        audio_data: bytes,
        buffer_id: str,
        buffer_start_time: float
    ) -> tuple[Dict[str, Any], Dict[str, Any]]:
        """
        Process audio: Execute Whisper once and return both partial result and whisper result

        Task 4.1: Partial Results Processing Pipeline

        Args:
            audio_data: Raw audio bytes (48kHz, stereo, float32)
            buffer_id: Buffer identifier (e.g., buff_20250105_120000_001)
            buffer_start_time: Buffer start timestamp

        Returns:
            Tuple of (partial_result, whisper_result) - whisper_result is used for final processing
        """
        start_time = time.time()

        try:
            # Run Whisper transcription only once
            whisper_result = await self.transcribe_audio(audio_data, buffer_start_time)

            if 'error' in whisper_result:
                return whisper_result, None

            # Extract segments
            segments = whisper_result.get('segments', [])
            text = whisper_result.get('text', '')

            # Calculate timestamp range
            if segments:
                timestamp_range = {
                    'start': min(seg['start'] for seg in segments),
                    'end': max(seg['end'] for seg in segments)
                }
            else:
                timestamp_range = {
                    'start': 0.0,
                    'end': 0.0
                }

            # Calculate latency
            latency_ms = (time.time() - start_time) * 1000

            logger.info(f"Partial result generated: buffer_id={buffer_id}, latency={latency_ms:.1f}ms")

            # Create partial result
            partial_result = {
                'type': 'partial',
                'buffer_id': buffer_id,
                'text': text,
                'segments': segments,
                'timestamp_range': timestamp_range,
                'latency_ms': latency_ms
            }

            # Return both partial result and whisper result for final processing
            return partial_result, whisper_result

        except Exception as e:
            logger.error(f"Partial processing error: {str(e)}", exc_info=True)
            error_result = {
                'error': True,
                'message': str(e)
            }
            return error_result, None

    def cleanup(self):
        """
        Cleanup GPU resources

        Clears GPU cache to free memory.
        """
        torch.cuda.empty_cache()
        logger.info("GPU pipeline cleanup complete")
    # Task 5.1: Wav2Vec2 Alignment (Stub)
    async def apply_alignment(self, segments: List[Dict[str, Any]], audio_data: bytes) -> List[Dict[str, Any]]:
        """
        Apply Wav2Vec2 alignment to Whisper segments (Stub implementation)
        
        Task 5.1: Wav2Vec2 Alignment Integration
        
        Args:
            segments: Whisper transcription segments
            audio_data: Raw audio bytes
            
        Returns:
            Aligned segments with improved word-level timestamps
        """
        logger.info("Wav2Vec2 alignment (stub): returning original segments")
        # Stub: Return segments unchanged
        # Future: Implement WhisperX integration for word-level alignment
        return segments
    
    # Task 6.1-6.2: Speaker Diarization (Stub)
    async def apply_diarization(
        self,
        segments: List[Dict[str, Any]],
        audio_data: bytes
    ) -> List[Dict[str, Any]]:
        """
        Apply speaker diarization to segments (Stub implementation)
        
        Task 6.1-6.2: pyannote.audio Speaker Diarization Integration
        
        Args:
            segments: Transcription segments
            audio_data: Raw audio bytes
            
        Returns:
            Segments with speaker labels (Speaker_00, Speaker_01, etc.)
        """
        logger.info("Speaker diarization (stub): assigning default speaker")
        # Stub: Assign default speaker to all segments
        # Future: Implement pyannote.audio for actual speaker diarization
        for seg in segments:
            seg['speaker'] = 'Speaker_00'
        return segments
    
    # Task 7.1-7.3: LLM Correction (Stub)
    async def apply_llm_correction(self, text: str, segments: List[Dict[str, Any]]) -> Dict[str, Any]:
        """
        Apply LLM correction to transcription (Stub implementation)

        Task 7.1-7.3: Ollama/Qwen2.5-14B LLM Correction
        Task 12.3: Ollama connection error handling with graceful degradation

        Args:
            text: Original transcription text
            segments: Transcription segments

        Returns:
            Dict with 'corrected_text' and 'corrected_segments'
        """
        try:
            logger.info("LLM correction (stub): returning original text")
            # Stub: Return original text without correction
            # Future: Implement Ollama integration with Qwen2.5-14B
            #   - Fix homophone errors (きかい → 機械/機会)
            #   - Remove fillers (えー、あの)
            #   - Add proper punctuation

            # Future Ollama integration would be here:
            # try:
            #     response = requests.post(
            #         "http://localhost:11434/api/generate",
            #         json={"model": "qwen2.5:14b", "prompt": f"Correct: {text}"},
            #         timeout=10
            #     )
            #     ...
            # except (ConnectionError, requests.exceptions.RequestException) as e:
            #     # Falls through to graceful degradation below

            corrected_segments = []
            for seg in segments:
                corrected_seg = seg.copy()
                corrected_seg['corrected'] = False  # No actual correction applied
                corrected_segments.append(corrected_seg)

            return {
                'corrected_text': text,
                'corrected_segments': corrected_segments
            }

        except (ConnectionError, OSError) as e:
            # Task 12.3: Graceful degradation when Ollama is unavailable
            logger.warning(f"Ollama connection failed: {str(e)}")
            logger.warning("Skipping LLM correction, returning partial Whisper results only")
            logger.warning("LLM correction will automatically resume when Ollama becomes available")

            # Return uncorrected segments
            uncorrected_segments = []
            for seg in segments:
                uncorrected_seg = seg.copy()
                uncorrected_seg['corrected'] = False
                uncorrected_segments.append(uncorrected_seg)

            return {
                'corrected_text': text,
                'corrected_segments': uncorrected_segments
            }

        except Exception as e:
            # Other errors: log but still return original text
            logger.error(f"LLM correction error: {str(e)}", exc_info=True)

            uncorrected_segments = []
            for seg in segments:
                uncorrected_seg = seg.copy()
                uncorrected_seg['corrected'] = False
                uncorrected_segments.append(uncorrected_seg)

            return {
                'corrected_text': text,
                'corrected_segments': uncorrected_segments
            }
    
    # Task 8.1: Final Results Processing Pipeline
    async def process_final(
        self,
        whisper_result: Dict[str, Any],
        audio_data: bytes,
        buffer_id: str,
        buffer_start_time: float
    ) -> Dict[str, Any]:
        """
        Process final results with full pipeline: Alignment → Diarization → LLM
        (Whisper result is reused from partial processing)

        Task 8.1: Final Results Processing Pipeline

        Args:
            whisper_result: Pre-computed Whisper transcription result
            audio_data: Raw audio bytes (48kHz, stereo, float32)
            buffer_id: Buffer identifier
            buffer_start_time: Buffer start timestamp

        Returns:
            Dict with type="final", buffer_id, timestamp_range, corrected segments
        """
        start_time = time.time()

        try:
            logger.info(f"Final processing started: buffer_id={buffer_id}")

            if 'error' in whisper_result:
                return whisper_result

            segments = whisper_result.get('segments', [])
            text = whisper_result.get('text', '')
            
            # Step 2: Wav2Vec2 alignment (stub)
            segments = await self.apply_alignment(segments, audio_data)
            
            # Step 3: Speaker diarization (stub)
            segments = await self.apply_diarization(segments, audio_data)
            
            # Step 4: LLM correction (stub)
            llm_result = await self.apply_llm_correction(text, segments)
            corrected_text = llm_result['corrected_text']
            corrected_segments = llm_result['corrected_segments']
            
            # Calculate timestamp range
            if corrected_segments:
                timestamp_range = {
                    'start': min(seg['start'] for seg in corrected_segments),
                    'end': max(seg['end'] for seg in corrected_segments)
                }
            else:
                timestamp_range = {
                    'start': 0.0,
                    'end': 0.0
                }
            
            # Calculate latency
            latency_ms = (time.time() - start_time) * 1000
            
            logger.info(f"Final result generated: buffer_id={buffer_id}, latency={latency_ms:.1f}ms")
            
            return {
                'type': 'final',
                'buffer_id': buffer_id,
                'text': corrected_text,
                'segments': corrected_segments,
                'timestamp_range': timestamp_range,
                'latency_ms': latency_ms
            }
        
        except Exception as e:
            logger.error(f"Final processing error: {str(e)}", exc_info=True)
            return {
                'error': True,
                'message': str(e)
            }
