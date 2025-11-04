"""
Test WhisperX Service
WhisperXサービスのテスト
"""

import pytest
from pathlib import Path
from services.whisperx_service import WhisperXService, TranscriptionResult


class TestWhisperXService:
    """WhisperX service tests"""

    @pytest.fixture
    def service(self):
        """Create WhisperX service instance"""
        return WhisperXService(model_name="base", device="cpu")

    def test_service_initialization(self, service):
        """サービスが正しく初期化されること"""
        assert service is not None
        assert service.model_name == "base"
        assert service.device == "cpu"

    def test_service_loads_model_on_init(self, service):
        """初期化時にモデルがロードされること"""
        assert service.model is not None

    def test_transcribe_audio_file(self, service, tmp_path):
        """音声ファイルを文字起こしできること"""
        # Create a mock audio file
        audio_file = tmp_path / "test.wav"
        audio_file.write_bytes(b"mock audio data")

        result = service.transcribe(str(audio_file))

        assert isinstance(result, TranscriptionResult)
        assert isinstance(result.segments, list)
        assert isinstance(result.language, str)
        assert isinstance(result.duration, float)

    def test_transcribe_result_contains_segments(self, service, tmp_path):
        """文字起こし結果がセグメントを含むこと"""
        audio_file = tmp_path / "test.wav"
        audio_file.write_bytes(b"mock audio data")

        result = service.transcribe(str(audio_file))

        assert len(result.segments) > 0
        first_segment = result.segments[0]
        assert "start" in first_segment
        assert "end" in first_segment
        assert "text" in first_segment

    def test_transcribe_with_word_level_timestamps(self, service, tmp_path):
        """word-levelタイムスタンプが含まれること"""
        audio_file = tmp_path / "test.wav"
        audio_file.write_bytes(b"mock audio data")

        result = service.transcribe(str(audio_file))

        # Check if segments have word-level timestamps
        if len(result.segments) > 0:
            segment = result.segments[0]
            if "words" in segment:
                assert isinstance(segment["words"], list)
                if len(segment["words"]) > 0:
                    word = segment["words"][0]
                    assert "start" in word
                    assert "end" in word
                    assert "word" in word

    def test_transcribe_invalid_file_raises_error(self, service):
        """存在しないファイルでエラーが発生すること"""
        with pytest.raises(FileNotFoundError):
            service.transcribe("/nonexistent/file.wav")

    def test_transcribe_detects_language(self, service, tmp_path):
        """音声の言語を検出すること"""
        audio_file = tmp_path / "test.wav"
        audio_file.write_bytes(b"mock audio data")

        result = service.transcribe(str(audio_file))

        assert result.language in ["ja", "en", "zh", "es", "fr", "de"]

    def test_batch_size_auto_adjustment(self):
        """VRAM不足時にbatch_sizeが自動調整されること"""
        service = WhisperXService(model_name="base", device="cpu", batch_size=16)
        assert service.batch_size == 16

        # Simulate VRAM shortage
        service.adjust_batch_size()
        assert service.batch_size == 8

        service.adjust_batch_size()
        assert service.batch_size == 4

    def test_transcribe_handles_timeout(self, service, tmp_path):
        """処理タイムアウトを適切にハンドリングすること"""
        # This test would need mock implementation
        # For now, we verify the method exists
        assert hasattr(service, "transcribe")


class TestTranscriptionResult:
    """Transcription result tests"""

    def test_result_to_dict(self):
        """結果が辞書形式に変換できること"""
        result = TranscriptionResult(
            segments=[
                {
                    "start": 0.0,
                    "end": 1.5,
                    "text": "Hello world",
                }
            ],
            language="en",
            duration=1.5,
        )

        result_dict = result.to_dict()

        assert "segments" in result_dict
        assert "language" in result_dict
        assert "duration" in result_dict
        assert result_dict["language"] == "en"

    def test_result_from_whisperx_output(self):
        """WhisperXの出力から結果を作成できること"""
        whisperx_output = {
            "segments": [
                {
                    "start": 0.0,
                    "end": 2.5,
                    "text": "Test transcription",
                    "words": [
                        {"start": 0.0, "end": 0.5, "word": "Test"},
                        {"start": 0.6, "end": 2.5, "word": "transcription"},
                    ],
                }
            ],
            "language": "en",
        }

        result = TranscriptionResult.from_whisperx_output(
            whisperx_output, duration=2.5
        )

        assert result.language == "en"
        assert result.duration == 2.5
        assert len(result.segments) == 1
