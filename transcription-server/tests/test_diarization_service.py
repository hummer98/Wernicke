"""
Test Diarization Service
話者分離サービスのテスト
"""

import pytest
import os
from services.diarization_service import (
    DiarizationService,
    DiarizationResult,
    assign_speakers_to_segments,
)


class TestDiarizationService:
    """Diarization service tests"""

    @pytest.fixture
    def service(self):
        """Create diarization service instance"""
        # Mock HF token for testing
        os.environ["HF_TOKEN"] = "mock_token"
        return DiarizationService(device="cpu")

    def test_service_initialization(self, service):
        """サービスが正しく初期化されること"""
        assert service is not None
        assert service.device == "cpu"

    def test_service_loads_pipeline_on_init(self, service):
        """初期化時にpipelineがロードされること"""
        assert service.pipeline is not None

    def test_diarize_audio_file(self, service, tmp_path):
        """音声ファイルから話者分離ができること"""
        audio_file = tmp_path / "test.wav"
        audio_file.write_bytes(b"mock audio data")

        result = service.diarize(str(audio_file))

        assert isinstance(result, DiarizationResult)
        assert isinstance(result.speakers, list)

    def test_diarization_result_contains_speakers(self, service, tmp_path):
        """話者分離結果が話者情報を含むこと"""
        audio_file = tmp_path / "test.wav"
        audio_file.write_bytes(b"mock audio data")

        result = service.diarize(str(audio_file))

        assert len(result.speakers) > 0
        speaker = result.speakers[0]
        assert "speaker" in speaker
        assert "start" in speaker
        assert "end" in speaker

    def test_diarization_speaker_labels(self, service, tmp_path):
        """話者ラベルがSpeaker_00形式であること"""
        audio_file = tmp_path / "test.wav"
        audio_file.write_bytes(b"mock audio data")

        result = service.diarize(str(audio_file))

        for speaker in result.speakers:
            assert speaker["speaker"].startswith("Speaker_")

    def test_diarize_invalid_file_raises_error(self, service):
        """存在しないファイルでエラーが発生すること"""
        with pytest.raises(FileNotFoundError):
            service.diarize("/nonexistent/file.wav")

    def test_diarize_short_audio_fallback(self, service, tmp_path):
        """短い音声（3秒未満）でフォールバックが動作すること"""
        audio_file = tmp_path / "short.wav"
        audio_file.write_bytes(b"short audio")

        # Should not raise error even for short audio
        result = service.diarize(str(audio_file), min_duration=3.0)

        assert isinstance(result, DiarizationResult)
        # Short audio may have empty speakers or default speaker
        assert isinstance(result.speakers, list)


class TestSpeakerAssignment:
    """Speaker assignment tests"""

    def test_assign_speakers_to_segments(self):
        """セグメントに話者ラベルを付与できること"""
        segments = [
            {"start": 0.0, "end": 2.0, "text": "Hello"},
            {"start": 2.5, "end": 4.5, "text": "World"},
            {"start": 5.0, "end": 7.0, "text": "Test"},
        ]

        diarization = DiarizationResult(
            speakers=[
                {"speaker": "Speaker_00", "start": 0.0, "end": 3.0},
                {"speaker": "Speaker_01", "start": 3.5, "end": 8.0},
            ]
        )

        result = assign_speakers_to_segments(segments, diarization)

        assert len(result) == 3
        assert result[0]["speaker"] == "Speaker_00"
        assert result[1]["speaker"] == "Speaker_00"  # 2.5 is still in Speaker_00
        assert result[2]["speaker"] == "Speaker_01"

    def test_assign_speakers_uses_segment_midpoint(self):
        """セグメント中間時刻で話者を判定すること"""
        segments = [
            {"start": 0.0, "end": 4.0, "text": "Long segment"},
        ]

        diarization = DiarizationResult(
            speakers=[
                {"speaker": "Speaker_00", "start": 0.0, "end": 2.0},
                {"speaker": "Speaker_01", "start": 2.0, "end": 5.0},
            ]
        )

        result = assign_speakers_to_segments(segments, diarization)

        # Midpoint is 2.0, which maps to Speaker_01
        assert result[0]["speaker"] == "Speaker_01"

    def test_assign_speakers_unknown_fallback(self):
        """話者が見つからない場合にUnknownを付与すること"""
        segments = [
            {"start": 10.0, "end": 12.0, "text": "Late segment"},
        ]

        diarization = DiarizationResult(
            speakers=[
                {"speaker": "Speaker_00", "start": 0.0, "end": 5.0},
            ]
        )

        result = assign_speakers_to_segments(segments, diarization)

        assert result[0]["speaker"] == "Unknown"

    def test_assign_speakers_empty_diarization(self):
        """話者分離結果が空の場合にUnknownを付与すること"""
        segments = [
            {"start": 0.0, "end": 2.0, "text": "Test"},
        ]

        diarization = DiarizationResult(speakers=[])

        result = assign_speakers_to_segments(segments, diarization)

        assert result[0]["speaker"] == "Unknown"


class TestDiarizationResult:
    """Diarization result tests"""

    def test_result_to_dict(self):
        """結果が辞書形式に変換できること"""
        result = DiarizationResult(
            speakers=[
                {"speaker": "Speaker_00", "start": 0.0, "end": 3.0},
                {"speaker": "Speaker_01", "start": 3.5, "end": 6.0},
            ]
        )

        result_dict = result.to_dict()

        assert "speakers" in result_dict
        assert len(result_dict["speakers"]) == 2

    def test_result_from_pyannote_output(self):
        """pyannote.audioの出力から結果を作成できること"""
        # Mock pyannote Annotation object format
        pyannote_output = [
            {"speaker": "SPEAKER_00", "start": 0.0, "end": 3.0},
            {"speaker": "SPEAKER_01", "start": 3.5, "end": 6.0},
        ]

        result = DiarizationResult.from_pyannote_output(pyannote_output)

        assert len(result.speakers) == 2
        # Speaker labels should be normalized to Speaker_XX format
        assert result.speakers[0]["speaker"] == "Speaker_00"
        assert result.speakers[1]["speaker"] == "Speaker_01"
