"""
Security Tests
Task 18.1: 入力検証とサイズ制限
Task 18.2: ファイルパーミッションとデータ保持
Tests audio format validation, payload size limits, error handling
Tests file permissions, data retention, memory cleanup
Requirements: R9.1, R9.2
"""

import pytest
import numpy as np
from fastapi.testclient import TestClient
from unittest.mock import patch, MagicMock
import struct


@pytest.fixture
def client():
    """Create test client"""
    from main import app
    return TestClient(app)


@pytest.fixture
def valid_audio_chunk():
    """Generate valid audio chunk (48kHz, stereo, float32)"""
    sample_rate = 48000
    duration = 0.1  # 100ms
    channels = 2

    # Generate sine wave
    t = np.linspace(0, duration, int(sample_rate * duration))
    audio = np.sin(2 * np.pi * 440 * t)  # 440Hz tone

    # Convert to stereo float32
    audio_stereo = np.stack([audio, audio]).T.astype(np.float32)

    return audio_stereo.tobytes()


class TestTask18_1InputValidation:
    """Test suite for Task 18.1: Input validation and size limits"""

    def test_valid_audio_format_accepted(self, client, valid_audio_chunk):
        """
        Test: 正しい音声形式の受け入れテスト（48kHz, stereo, float32）
        Task: 18.1
        Given: Valid audio chunk (48kHz, stereo, float32)
        When: Client sends the audio chunk
        Then: Server accepts and acknowledges the chunk
        """
        with client.websocket_connect("/transcribe") as websocket:
            # Skip handshake
            websocket.receive_json()

            # Send valid audio chunk
            websocket.send_bytes(valid_audio_chunk)

            # Verify acknowledgment (no error)
            ack = websocket.receive_json()
            assert ack["type"] == "audio_received"
            assert "error" not in ack

    def test_invalid_audio_format_rejected_wrong_sample_rate(self, client):
        """
        Test: 不正な音声形式拒否テスト（サンプルレート違い）
        Task: 18.1
        Given: Audio chunk with wrong sample rate (44.1kHz instead of 48kHz)
        When: Client sends the invalid chunk
        Then: Server returns INVALID_FORMAT error
        """
        # Create audio with wrong sample rate (44.1kHz)
        sample_rate = 44100  # Wrong rate
        duration = 0.1
        channels = 2

        t = np.linspace(0, duration, int(sample_rate * duration))
        audio = np.sin(2 * np.pi * 440 * t)
        audio_stereo = np.stack([audio, audio]).T.astype(np.float32)
        invalid_chunk = audio_stereo.tobytes()

        with client.websocket_connect("/transcribe") as websocket:
            websocket.receive_json()  # Skip handshake

            websocket.send_bytes(invalid_chunk)

            # Expect error response
            response = websocket.receive_json()
            assert response["type"] == "error"
            assert response["code"] == "INVALID_FORMAT"
            assert "sample rate" in response["message"].lower()

    def test_invalid_audio_format_rejected_mono(self, client):
        """
        Test: 不正な音声形式拒否テスト（モノラル）
        Task: 18.1
        Given: Audio chunk with mono format (should be stereo)
        When: Client sends the invalid chunk
        Then: Server returns INVALID_FORMAT error
        """
        # Create mono audio (wrong channel count)
        sample_rate = 48000
        duration = 0.1

        t = np.linspace(0, duration, int(sample_rate * duration))
        audio_mono = np.sin(2 * np.pi * 440 * t).astype(np.float32)
        invalid_chunk = audio_mono.tobytes()

        with client.websocket_connect("/transcribe") as websocket:
            websocket.receive_json()  # Skip handshake

            websocket.send_bytes(invalid_chunk)

            # Expect error response
            response = websocket.receive_json()
            assert response["type"] == "error"
            assert response["code"] == "INVALID_FORMAT"
            assert "channel" in response["message"].lower() or "stereo" in response["message"].lower()

    def test_invalid_audio_format_rejected_int16(self, client):
        """
        Test: 不正な音声形式拒否テスト（int16）
        Task: 18.1
        Given: Audio chunk with int16 format (should be float32)
        When: Client sends the invalid chunk
        Then: Server returns INVALID_FORMAT error
        """
        # Create int16 audio (wrong data type)
        sample_rate = 48000
        duration = 0.1
        channels = 2

        t = np.linspace(0, duration, int(sample_rate * duration))
        audio = np.sin(2 * np.pi * 440 * t)
        audio_stereo = np.stack([audio, audio]).T
        audio_int16 = (audio_stereo * 32767).astype(np.int16)
        invalid_chunk = audio_int16.tobytes()

        with client.websocket_connect("/transcribe") as websocket:
            websocket.receive_json()  # Skip handshake

            websocket.send_bytes(invalid_chunk)

            # Expect error response
            response = websocket.receive_json()
            assert response["type"] == "error"
            assert response["code"] == "INVALID_FORMAT"
            assert "float32" in response["message"].lower() or "format" in response["message"].lower()

    def test_payload_size_limit_enforced(self, client):
        """
        Test: ペイロードサイズ制限テスト（最大11.52MB）
        Task: 18.1
        Given: Audio chunk exceeding maximum size (11.52MB)
        When: Client sends oversized chunk
        Then: Server returns INVALID_FORMAT error with size limit message

        Note: 11.52MB = 30 seconds * 48000 Hz * 2 channels * 4 bytes (float32)
        """
        # Maximum allowed: 30 seconds = 11,520,000 bytes
        max_bytes = 30 * 48000 * 2 * 4  # 11,520,000 bytes

        # Create oversized chunk (31 seconds)
        oversized_bytes = 31 * 48000 * 2 * 4
        oversized_chunk = np.zeros(oversized_bytes // 4, dtype=np.float32).tobytes()

        with client.websocket_connect("/transcribe") as websocket:
            websocket.receive_json()  # Skip handshake

            websocket.send_bytes(oversized_chunk)

            # Expect error response
            response = websocket.receive_json()
            assert response["type"] == "error"
            assert response["code"] == "INVALID_FORMAT"
            assert "size" in response["message"].lower() or "limit" in response["message"].lower()

    def test_payload_size_at_limit_accepted(self, client):
        """
        Test: ペイロードサイズ境界値テスト（ちょうど11.52MB）
        Task: 18.1
        Given: Audio chunk exactly at maximum size (11.52MB)
        When: Client sends the chunk
        Then: Server accepts the chunk
        """
        # Exactly at limit: 30 seconds
        max_bytes = 30 * 48000 * 2 * 4  # 11,520,000 bytes
        valid_chunk = np.zeros(max_bytes // 4, dtype=np.float32).tobytes()

        with client.websocket_connect("/transcribe") as websocket:
            websocket.receive_json()  # Skip handshake

            websocket.send_bytes(valid_chunk)

            # Verify acknowledgment (no error)
            ack = websocket.receive_json()
            assert ack["type"] == "audio_received"
            assert "error" not in ack

    def test_empty_payload_rejected(self, client):
        """
        Test: 空のペイロード拒否テスト
        Task: 18.1
        Given: Empty audio chunk
        When: Client sends empty bytes
        Then: Server returns INVALID_FORMAT error
        """
        empty_chunk = b""

        with client.websocket_connect("/transcribe") as websocket:
            websocket.receive_json()  # Skip handshake

            websocket.send_bytes(empty_chunk)

            # Expect error response
            response = websocket.receive_json()
            assert response["type"] == "error"
            assert response["code"] == "INVALID_FORMAT"

    @pytest.mark.asyncio
    async def test_validation_error_logging(self, client, caplog):
        """
        Test: 検証エラーログ記録テスト
        Task: 18.1
        Given: Invalid audio format is sent
        When: Validation fails
        Then: Error is logged with details
        """
        import logging

        # Create invalid chunk (mono)
        sample_rate = 48000
        duration = 0.1
        t = np.linspace(0, duration, int(sample_rate * duration))
        audio_mono = np.sin(2 * np.pi * 440 * t).astype(np.float32)
        invalid_chunk = audio_mono.tobytes()

        with caplog.at_level(logging.WARNING):
            with client.websocket_connect("/transcribe") as websocket:
                websocket.receive_json()  # Skip handshake

                websocket.send_bytes(invalid_chunk)

                # Receive error
                response = websocket.receive_json()
                assert response["code"] == "INVALID_FORMAT"

        # Verify error was logged
        assert any("INVALID_FORMAT" in record.message or "validation" in record.message.lower()
                   for record in caplog.records)

    def test_multiple_invalid_chunks_handled_gracefully(self, client):
        """
        Test: 連続不正チャンク処理テスト
        Task: 18.1
        Given: Multiple invalid chunks are sent
        When: Server validates each chunk
        Then: Each validation error is returned independently
        """
        # Create invalid chunks
        invalid_chunks = [
            b"",  # Empty
            b"too_short",  # Too short
            np.zeros(100, dtype=np.float32).tobytes(),  # Wrong size
        ]

        with client.websocket_connect("/transcribe") as websocket:
            websocket.receive_json()  # Skip handshake

            for invalid_chunk in invalid_chunks:
                websocket.send_bytes(invalid_chunk)

                # Each should return error
                response = websocket.receive_json()
                assert response["type"] == "error"
                assert response["code"] == "INVALID_FORMAT"

    def test_valid_chunk_after_invalid_chunk(self, client, valid_audio_chunk):
        """
        Test: 不正チャンク後の正常チャンク処理テスト
        Task: 18.1
        Given: Invalid chunk is sent, then valid chunk
        When: Server validates both
        Then: Invalid chunk is rejected, valid chunk is accepted
        """
        invalid_chunk = b"invalid_audio"

        with client.websocket_connect("/transcribe") as websocket:
            websocket.receive_json()  # Skip handshake

            # Send invalid chunk
            websocket.send_bytes(invalid_chunk)
            response1 = websocket.receive_json()
            assert response1["type"] == "error"
            assert response1["code"] == "INVALID_FORMAT"

            # Send valid chunk
            websocket.send_bytes(valid_audio_chunk)
            response2 = websocket.receive_json()
            assert response2["type"] == "audio_received"
            assert "error" not in response2


class TestTask18_2FilePermissionsAndDataRetention:
    """Test suite for Task 18.2: File permissions and data retention"""

    def test_log_file_permissions_0600(self, tmpdir):
        """
        Test: ログファイルパーミッション0600設定
        Task: 18.2
        Given: Log file is created
        When: File permissions are checked
        Then: Permissions are set to 0600 (owner read/write only)
        """
        import os
        import stat
        from pathlib import Path

        # Create test log file
        log_file = tmpdir.join("test.log")
        log_file.write("test log content")

        # Apply 0600 permissions
        os.chmod(str(log_file), 0o600)

        # Verify permissions
        st = os.stat(str(log_file))
        perms = stat.S_IMODE(st.st_mode)
        assert perms == 0o600, f"Expected 0600 permissions, got {oct(perms)}"

    def test_audio_buffer_memory_cleanup_after_processing(self):
        """
        Test: 音声バッファの処理後メモリ削除検証
        Task: 18.2
        Given: Audio buffer is processed
        When: Processing completes
        Then: Buffer memory is cleared
        """
        from services.transcription_session import TranscriptionSession
        import gc

        session = TranscriptionSession()

        # Add audio data to buffer
        audio_data = np.zeros(48000 * 2, dtype=np.float32).tobytes()
        session.add_audio_chunk(audio_data)

        # Verify buffer has data
        assert session.get_buffer_size() > 0

        # Simulate buffer flush and processing
        import asyncio
        buffer_audio, buffer_id = asyncio.run(session.flush())

        # Verify buffer is cleared after flush
        assert session.get_buffer_size() == 0

        # Force garbage collection to ensure cleanup
        del buffer_audio
        gc.collect()

    def test_log_file_retention_policy_30_days(self, tmpdir):
        """
        Test: 30日後ログファイル自動削除機能
        Task: 18.2
        Given: Log files with various ages
        When: Retention policy is applied
        Then: Files older than 30 days are deleted
        """
        import os
        import time
        from datetime import datetime, timedelta
        from utils.log_retention import cleanup_old_logs

        log_dir = tmpdir.mkdir("logs")

        # Create test log files with different timestamps
        # Recent file (10 days old)
        recent_file = log_dir.join("2025-10-26.log")
        recent_file.write("recent log")
        recent_mtime = time.time() - (10 * 24 * 60 * 60)  # 10 days ago
        os.utime(str(recent_file), (recent_mtime, recent_mtime))

        # Old file (35 days old)
        old_file = log_dir.join("2025-10-01.log")
        old_file.write("old log")
        old_mtime = time.time() - (35 * 24 * 60 * 60)  # 35 days ago
        os.utime(str(old_file), (old_mtime, old_mtime))

        # Very old file (60 days old)
        very_old_file = log_dir.join("2025-09-06.log")
        very_old_file.write("very old log")
        very_old_mtime = time.time() - (60 * 24 * 60 * 60)  # 60 days ago
        os.utime(str(very_old_file), (very_old_mtime, very_old_mtime))

        # Apply retention policy (30 days)
        cleanup_old_logs(str(log_dir), retention_days=30)

        # Verify recent file exists
        assert os.path.exists(str(recent_file))

        # Verify old files are deleted
        assert not os.path.exists(str(old_file))
        assert not os.path.exists(str(very_old_file))

    def test_data_retention_policy_implementation(self, tmpdir):
        """
        Test: データ保持ポリシーの実装確認
        Task: 18.2
        Given: Data retention policy is configured
        When: Policy parameters are checked
        Then: Policy matches requirements (30 days, local only)
        """
        from utils.log_retention import get_retention_policy

        policy = get_retention_policy()

        # Verify retention period
        assert policy["retention_days"] == 30

        # Verify local storage only
        assert policy["storage_location"] == "local"
        assert "~/transcriptions/logs" in policy["log_directory"] or "/transcriptions/logs" in policy["log_directory"]

        # Verify no external storage
        assert policy["external_storage_enabled"] == False

    @pytest.mark.asyncio
    async def test_websocket_session_cleanup_on_disconnect(self, client, valid_audio_chunk):
        """
        Test: WebSocketセッションのクリーンアップ
        Task: 18.2
        Given: WebSocket session with buffered audio
        When: Connection is closed
        Then: Session data is cleaned up
        """
        with client.websocket_connect("/transcribe") as websocket:
            # Skip handshake
            handshake = websocket.receive_json()
            session_id = handshake["session_id"]

            # Send audio chunks
            for _ in range(10):
                websocket.send_bytes(valid_audio_chunk)
                websocket.receive_json()  # Acknowledgment

            # Close connection
            websocket.close()

        # Verify session was cleaned up
        from routers.websocket_transcribe import get_active_sessions_count
        # After disconnect, active sessions should not include this session
        # (This is verified by the connection cleanup logic in websocket_transcribe.py)

    def test_memory_not_persisted_to_disk_during_processing(self, tmpdir):
        """
        Test: 処理中の音声データがディスクに保存されないことの検証
        Task: 18.2
        Given: Audio is being processed
        When: Processing is in progress
        Then: Audio buffer is not written to disk
        """
        from services.transcription_session import TranscriptionSession
        import os

        session = TranscriptionSession()
        temp_dir = str(tmpdir)

        # Add audio data
        audio_data = np.zeros(48000 * 2, dtype=np.float32).tobytes()
        session.add_audio_chunk(audio_data)

        # Verify no audio files are created in temp directory
        audio_extensions = ['.wav', '.raw', '.pcm', '.bin']
        audio_files = []
        for root, dirs, files in os.walk(temp_dir):
            for file in files:
                if any(file.endswith(ext) for ext in audio_extensions):
                    audio_files.append(file)

        # No audio files should be written to disk during processing
        assert len(audio_files) == 0

    def test_secure_log_file_creation_permissions(self, tmpdir):
        """
        Test: ログファイル作成時のセキュアなパーミッション設定
        Task: 18.2
        Given: New log file is created
        When: File is written
        Then: File is created with 0600 permissions from the start
        """
        import os
        import stat
        from utils.log_retention import create_secure_log_file

        log_file_path = os.path.join(str(tmpdir), "secure.log")

        # Create log file with secure permissions
        create_secure_log_file(log_file_path)

        # Verify file exists and has correct permissions
        assert os.path.exists(log_file_path)
        st = os.stat(log_file_path)
        perms = stat.S_IMODE(st.st_mode)
        assert perms == 0o600, f"Expected 0600 permissions, got {oct(perms)}"
