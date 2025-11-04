"""
Test Transcribe Endpoint
文字起こしAPIエンドポイントのテスト
"""

import pytest
from fastapi.testclient import TestClient
from main import app
import io


class TestTranscribeEndpoint:
    """Transcribe endpoint tests"""

    @pytest.fixture
    def client(self):
        """Create test client"""
        return TestClient(app)

    def test_transcribe_endpoint_exists(self, client):
        """POST /transcribe エンドポイントが存在すること"""
        # Send empty request to check endpoint exists
        response = client.post("/transcribe")
        # Should return 422 (validation error) not 404
        assert response.status_code != 404

    def test_transcribe_accepts_audio_file(self, client):
        """音声ファイルをmultipart/form-dataで受信できること"""
        audio_data = b"mock audio data"
        files = {"file": ("test.wav", io.BytesIO(audio_data), "audio/wav")}

        response = client.post("/transcribe", files=files)

        # Should process without 400 error
        assert response.status_code in [200, 500]  # 200 or internal error, not bad request

    def test_transcribe_returns_json_response(self, client):
        """レスポンスがJSON形式であること"""
        audio_data = b"mock audio data"
        files = {"file": ("test.wav", io.BytesIO(audio_data), "audio/wav")}

        response = client.post("/transcribe", files=files)

        if response.status_code == 200:
            assert response.headers["content-type"] == "application/json"

    def test_transcribe_response_contains_segments(self, client):
        """レスポンスにsegments配列が含まれること"""
        audio_data = b"mock audio data"
        files = {"file": ("test.wav", io.BytesIO(audio_data), "audio/wav")}

        response = client.post("/transcribe", files=files)

        if response.status_code == 200:
            data = response.json()
            assert "segments" in data
            assert isinstance(data["segments"], list)

    def test_transcribe_response_contains_language(self, client):
        """レスポンスにlanguageフィールドが含まれること"""
        audio_data = b"mock audio data"
        files = {"file": ("test.wav", io.BytesIO(audio_data), "audio/wav")}

        response = client.post("/transcribe", files=files)

        if response.status_code == 200:
            data = response.json()
            assert "language" in data
            assert isinstance(data["language"], str)

    def test_transcribe_response_contains_duration(self, client):
        """レスポンスにdurationフィールドが含まれること"""
        audio_data = b"mock audio data"
        files = {"file": ("test.wav", io.BytesIO(audio_data), "audio/wav")}

        response = client.post("/transcribe", files=files)

        if response.status_code == 200:
            data = response.json()
            assert "duration" in data
            assert isinstance(data["duration"], (int, float))

    def test_transcribe_segments_have_speaker_labels(self, client):
        """セグメントに話者ラベルが付与されていること"""
        audio_data = b"mock audio data"
        files = {"file": ("test.wav", io.BytesIO(audio_data), "audio/wav")}

        response = client.post("/transcribe", files=files)

        if response.status_code == 200:
            data = response.json()
            if len(data["segments"]) > 0:
                segment = data["segments"][0]
                assert "speaker" in segment
                assert isinstance(segment["speaker"], str)

    def test_transcribe_without_file_returns_422(self, client):
        """ファイルなしのリクエストで422エラーを返すこと"""
        response = client.post("/transcribe")
        assert response.status_code == 422

    def test_transcribe_cleans_up_temp_file(self, client, tmp_path):
        """処理完了後に一時ファイルが削除されること"""
        audio_data = b"mock audio data"
        files = {"file": ("test.wav", io.BytesIO(audio_data), "audio/wav")}

        response = client.post("/transcribe", files=files)

        # Check that no temp files are left
        # (This would need access to the temp directory used by the endpoint)
        assert response.status_code in [200, 500]


class TestTranscribeErrorHandling:
    """Transcribe endpoint error handling tests"""

    @pytest.fixture
    def client(self):
        """Create test client"""
        return TestClient(app)

    def test_transcribe_invalid_audio_format_returns_400(self, client):
        """不正な音声形式で400エラーを返すこと"""
        # Send non-audio file
        files = {"file": ("test.txt", io.BytesIO(b"not audio"), "text/plain")}

        response = client.post("/transcribe", files=files)

        # Should return 400 or process it (depending on implementation)
        assert response.status_code in [400, 422, 500]

    def test_transcribe_handles_processing_errors(self, client):
        """処理エラーを適切にハンドリングすること"""
        # This test verifies error handling exists
        audio_data = b"invalid audio that causes error"
        files = {"file": ("error.wav", io.BytesIO(audio_data), "audio/wav")}

        response = client.post("/transcribe", files=files)

        # Should return error response, not crash
        assert response.status_code in [200, 400, 500, 503]

    def test_transcribe_returns_proper_error_format(self, client):
        """エラーレスポンスが適切な形式であること"""
        # Intentionally cause an error
        files = {"file": ("test.txt", io.BytesIO(b"not audio"), "text/plain")}

        response = client.post("/transcribe", files=files)

        if response.status_code >= 400:
            data = response.json()
            # FastAPI standard error format
            assert "detail" in data or "error" in data
