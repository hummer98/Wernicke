"""
E2E WebSocket Integration Test
Windows環境でサーバーとWebSocket通信をテストするクライアント

使用方法:
1. サーバーを起動: python main.py
2. このスクリプトを実行: python tests/test_e2e_websocket_client.py
"""

import asyncio
import websockets
import json
import logging
from pathlib import Path
import sys
import time

# Setup logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


class WebSocketTestClient:
    """WebSocketテストクライアント"""

    def __init__(self, server_url: str = "ws://localhost:8000/transcribe"):
        self.server_url = server_url
        self.websocket = None
        self.responses = []

    async def connect(self):
        """サーバーに接続"""
        logger.info(f"Connecting to {self.server_url}...")
        self.websocket = await websockets.connect(self.server_url)
        logger.info("✅ Connected to server")

    async def disconnect(self):
        """サーバーから切断"""
        if self.websocket:
            await self.websocket.close()
            logger.info("Disconnected from server")

    async def send_audio_file(self, audio_path: Path, chunk_size: int = 64000):
        """
        音声ファイルをWebSocket経由で送信

        Args:
            audio_path: 音声ファイルパス (16kHz mono float32 .raw)
            chunk_size: チャンクサイズ (bytes) デフォルト: 64KB = 1秒分
        """
        if not audio_path.exists():
            logger.error(f"❌ Audio file not found: {audio_path}")
            return

        audio_data = audio_path.read_bytes()
        num_samples = len(audio_data) // 4  # float32 = 4 bytes
        duration = num_samples / 16000  # 16kHz

        logger.info(f"📤 Sending audio file: {audio_path.name}")
        logger.info(f"   Size: {len(audio_data)} bytes ({num_samples} samples)")
        logger.info(f"   Duration: {duration:.2f}s")
        logger.info(f"   Chunk size: {chunk_size} bytes")

        # Send audio in chunks
        chunks_sent = 0
        for i in range(0, len(audio_data), chunk_size):
            chunk = audio_data[i:i + chunk_size]
            await self.websocket.send(chunk)
            chunks_sent += 1

            # Log progress every 5 chunks
            if chunks_sent % 5 == 0:
                progress = (i + len(chunk)) / len(audio_data) * 100
                logger.info(f"   Progress: {progress:.1f}% ({chunks_sent} chunks)")

            # Small delay between chunks (simulate real-time streaming)
            await asyncio.sleep(0.05)

        logger.info(f"✅ Sent {chunks_sent} chunks")

    async def receive_responses(self, timeout: float = 5.0):
        """
        サーバーからの応答を受信

        Args:
            timeout: タイムアウト時間（秒）
        """
        logger.info(f"📥 Waiting for server responses (timeout: {timeout}s)...")

        try:
            while True:
                try:
                    response = await asyncio.wait_for(
                        self.websocket.recv(),
                        timeout=timeout
                    )

                    # Parse JSON response
                    data = json.loads(response)
                    self.responses.append(data)

                    # Log response
                    msg_type = data.get('type', 'unknown')
                    if msg_type == 'partial':
                        text = data.get('text', '')
                        logger.info(f"📝 [Partial] {text[:80]}...")
                    elif msg_type == 'final':
                        text = data.get('text', '')
                        buffer_id = data.get('buffer_id', 'N/A')
                        logger.info(f"✅ [Final] buffer_id={buffer_id}")
                        logger.info(f"   Text: {text}")
                    elif msg_type == 'error':
                        code = data.get('code', 'UNKNOWN')
                        message = data.get('message', 'No message')
                        logger.error(f"❌ [Error] {code}: {message}")
                    else:
                        logger.info(f"📨 [Unknown type] {data}")

                except asyncio.TimeoutError:
                    logger.info("⏱️ No more responses (timeout)")
                    break

        except Exception as e:
            logger.error(f"❌ Error receiving responses: {str(e)}", exc_info=True)

    def print_summary(self):
        """テスト結果のサマリーを表示"""
        logger.info("=" * 60)
        logger.info("TEST SUMMARY")
        logger.info("=" * 60)

        total = len(self.responses)
        partials = sum(1 for r in self.responses if r.get('type') == 'partial')
        finals = sum(1 for r in self.responses if r.get('type') == 'final')
        errors = sum(1 for r in self.responses if r.get('type') == 'error')

        logger.info(f"Total responses: {total}")
        logger.info(f"  - Partial results: {partials}")
        logger.info(f"  - Final results: {finals}")
        logger.info(f"  - Errors: {errors}")

        if finals > 0:
            logger.info("\nFinal transcriptions:")
            for i, resp in enumerate([r for r in self.responses if r.get('type') == 'final'], 1):
                buffer_id = resp.get('buffer_id', 'N/A')
                text = resp.get('text', '')
                logger.info(f"  {i}. [{buffer_id}] {text}")

        logger.info("=" * 60)


async def test_silence(client: WebSocketTestClient):
    """Test 1: 無音テスト（幻聴防止確認）"""
    logger.info("\n" + "=" * 60)
    logger.info("TEST 1: Silence (Hallucination Prevention)")
    logger.info("=" * 60)

    # Generate 5 seconds of silence
    import numpy as np
    silence_duration = 5.0
    num_samples = int(16000 * silence_duration)
    silence_audio = np.zeros(num_samples, dtype=np.float32)

    # Save to temp file
    temp_file = Path("tests/temp_silence.raw")
    temp_file.write_bytes(silence_audio.tobytes())

    try:
        await client.send_audio_file(temp_file, chunk_size=64000)
        await client.receive_responses(timeout=10.0)
    finally:
        # Cleanup
        if temp_file.exists():
            temp_file.unlink()

    logger.info("✅ Test 1 completed\n")


async def test_japanese_dialogue(client: WebSocketTestClient):
    """Test 2: 日本語会話テスト"""
    logger.info("\n" + "=" * 60)
    logger.info("TEST 2: Japanese Dialogue")
    logger.info("=" * 60)

    audio_file = Path(__file__).parent.parent.parent / "test_audio" / "test_dialogue_16k_mono.raw"

    if not audio_file.exists():
        logger.warning(f"⚠️ Test audio file not found: {audio_file}")
        logger.warning("   Skipping Test 2")
        return

    await client.send_audio_file(audio_file, chunk_size=64000)
    await client.receive_responses(timeout=15.0)

    logger.info("✅ Test 2 completed\n")


async def test_sine_wave(client: WebSocketTestClient):
    """Test 3: 正弦波テスト（非音声フィルタリング確認）"""
    logger.info("\n" + "=" * 60)
    logger.info("TEST 3: Sine Wave (Non-speech Filtering)")
    logger.info("=" * 60)

    # Generate 3 seconds of 440Hz sine wave
    import numpy as np
    duration = 3.0
    sample_rate = 16000
    frequency = 440.0

    t = np.linspace(0, duration, int(sample_rate * duration), dtype=np.float32)
    sine_audio = np.sin(2 * np.pi * frequency * t).astype(np.float32)

    # Save to temp file
    temp_file = Path("tests/temp_sine.raw")
    temp_file.write_bytes(sine_audio.tobytes())

    try:
        await client.send_audio_file(temp_file, chunk_size=64000)
        await client.receive_responses(timeout=10.0)
    finally:
        # Cleanup
        if temp_file.exists():
            temp_file.unlink()

    logger.info("✅ Test 3 completed\n")


async def main():
    """メイン関数"""
    logger.info("=" * 60)
    logger.info("WebSocket E2E Integration Test")
    logger.info("=" * 60)
    logger.info("")

    # Check if numpy is available
    try:
        import numpy as np
    except ImportError:
        logger.error("❌ NumPy is required for this test")
        logger.error("   Install: pip install numpy")
        sys.exit(1)

    server_url = "ws://localhost:8000/transcribe"
    client = WebSocketTestClient(server_url)

    try:
        # Connect to server
        await client.connect()

        # Run tests
        await test_silence(client)
        client.responses.clear()  # Clear responses between tests

        await test_japanese_dialogue(client)
        client.responses.clear()

        await test_sine_wave(client)

        # Print summary
        client.print_summary()

    except websockets.exceptions.ConnectionRefusedError:
        logger.error(f"❌ Failed to connect to server: {server_url}")
        logger.error("   Make sure the server is running: python main.py")
        sys.exit(1)

    except Exception as e:
        logger.error(f"❌ Test failed: {str(e)}", exc_info=True)
        sys.exit(1)

    finally:
        await client.disconnect()

    logger.info("\n✅ All tests completed successfully!")


if __name__ == "__main__":
    asyncio.run(main())
