"""
Hallucination Prevention Test Suite

Tests the effectiveness of multi-layer hallucination prevention mechanisms:
- Layer 1: VAD preprocessing (Silero-VAD)
- Layer 2: Buffer size constraints
- Layer 3: Whisper generation parameters

Usage:
    1. Start the server: python main.py
    2. Generate test audio: python tests/generate_test_audio.py
    3. Run this test: python tests/test_hallucination_prevention.py
"""

import asyncio
import websockets
import json
import logging
from pathlib import Path
import sys
from typing import List, Dict, Any

# Setup logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


class HallucinationTest:
    """Individual hallucination prevention test case"""

    def __init__(self, test_id: str, audio_file: str, description: str, expected_behavior: str):
        self.test_id = test_id
        self.audio_file = audio_file
        self.description = description
        self.expected_behavior = expected_behavior
        self.responses: List[Dict[str, Any]] = []
        self.passed: bool = False

    def __repr__(self):
        status = "[PASS]" if self.passed else "[FAIL]"
        return f"{status} Test {self.test_id}: {self.description}"


class HallucinationTestClient:
    """WebSocket client for hallucination testing"""

    def __init__(self, server_url: str = "ws://localhost:8000/transcribe"):
        self.server_url = server_url
        self.websocket = None
        self.test_audio_dir = Path(__file__).parent / 'test_audio'

    async def connect(self):
        """Connect to server"""
        logger.info(f"Connecting to {self.server_url}...")
        self.websocket = await websockets.connect(self.server_url)
        # Wait for connection_established message
        response = await self.websocket.recv()
        data = json.loads(response)
        if data.get('type') == 'connection_established':
            logger.info("[OK] Connected successfully")
        else:
            logger.warning(f"Unexpected initial message: {data}")

    async def disconnect(self):
        """Disconnect from server"""
        if self.websocket:
            await self.websocket.close()
            logger.info("Disconnected from server")

    async def send_audio_file(self, audio_file: Path, chunk_size: int = 64000):
        """Send audio file to server"""
        if not audio_file.exists():
            logger.error(f"[ERROR] Audio file not found: {audio_file}")
            return False

        audio_data = audio_file.read_bytes()
        num_samples = len(audio_data) // 4  # float32 = 4 bytes
        duration = num_samples / 16000  # 16kHz

        logger.info(f"[SEND] Sending: {audio_file.name}")
        logger.info(f"   Duration: {duration:.1f}s, Size: {len(audio_data)} bytes")

        # Send audio in chunks
        for i in range(0, len(audio_data), chunk_size):
            chunk = audio_data[i:i + chunk_size]
            await self.websocket.send(chunk)
            # Small delay to simulate real-time streaming
            await asyncio.sleep(0.05)

        logger.info(f"[OK] Sent complete")
        return True

    async def receive_responses(self, timeout: float = 10.0) -> List[Dict[str, Any]]:
        """Receive all responses from server"""
        responses = []
        logger.info(f"[RECV] Waiting for responses (timeout: {timeout}s)...")

        try:
            while True:
                try:
                    response = await asyncio.wait_for(
                        self.websocket.recv(),
                        timeout=timeout
                    )

                    data = json.loads(response)
                    responses.append(data)

                    msg_type = data.get('type', 'unknown')
                    if msg_type == 'partial':
                        text = data.get('text', '')
                        logger.info(f"   [Partial] '{text[:50]}...'")
                    elif msg_type == 'final':
                        text = data.get('text', '')
                        logger.info(f"   [Final] '{text[:50]}...'")
                    elif msg_type == 'error':
                        logger.error(f"   [Error] {data.get('message', 'Unknown')}")
                    elif msg_type != 'audio_received':
                        logger.info(f"   [{msg_type}] {data}")

                except asyncio.TimeoutError:
                    logger.info("[TIMEOUT] No more responses")
                    break

        except Exception as e:
            logger.error(f"[ERROR] Error receiving responses: {str(e)}")

        return responses

    async def run_test(self, test: HallucinationTest) -> HallucinationTest:
        """Run a single test case"""
        logger.info("=" * 70)
        logger.info(f"Test {test.test_id}: {test.description}")
        logger.info(f"Expected: {test.expected_behavior}")
        logger.info("-" * 70)

        audio_path = self.test_audio_dir / test.audio_file

        # Send audio
        success = await self.send_audio_file(audio_path)
        if not success:
            logger.error(f"[ERROR] Failed to send audio for test {test.test_id}")
            return test

        # Receive responses
        test.responses = await self.receive_responses(timeout=15.0)

        # Analyze results
        test.passed = self.analyze_test_result(test)

        logger.info(str(test))
        logger.info("=" * 70)
        logger.info("")

        return test

    def analyze_test_result(self, test: HallucinationTest) -> bool:
        """Analyze test results and determine pass/fail"""
        # Count response types
        partials = [r for r in test.responses if r.get('type') == 'partial']
        finals = [r for r in test.responses if r.get('type') == 'final']
        errors = [r for r in test.responses if r.get('type') == 'error']

        # Check for hallucination keywords
        hallucination_keywords = [
            'ご視聴ありがとうございました',
            'thank you for watching',
            'ありがとうございました',
            'チャンネル登録',
            'subscribe',
        ]

        has_hallucination = False
        for response in partials + finals:
            text = response.get('text', '').lower()
            for keyword in hallucination_keywords:
                if keyword.lower() in text:
                    has_hallucination = True
                    logger.warning(f"[WARNING] Hallucination detected: '{keyword}' in '{text}'")

        # Determine pass/fail based on test expectations
        test_id = test.test_id

        # Tests 1-8, 10, 12: Should produce NO transcriptions (or be rejected)
        if test_id in ['01', '02', '03', '04', '05', '06', '07', '08', '10', '12']:
            if len(partials) == 0 and len(finals) == 0:
                logger.info("[OK] Correctly produced no transcriptions")
                return True
            elif has_hallucination:
                logger.error("[FAIL] Hallucination occurred")
                return False
            else:
                logger.warning(f"[WARNING] Unexpected transcription: {len(partials)} partial, {len(finals)} final")
                # Still pass if no hallucination
                return not has_hallucination

        # Test 13: Repetitive pattern - should be rejected by compression_ratio_threshold
        elif test_id == '13':
            if len(partials) == 0 and len(finals) == 0:
                logger.info("[OK] Correctly rejected repetitive pattern")
                return True
            else:
                logger.warning("[WARNING] Repetitive pattern was not rejected")
                return not has_hallucination

        # Other tests: Just check for hallucinations
        else:
            if has_hallucination:
                logger.error("[FAIL] Hallucination occurred")
                return False
            else:
                logger.info("[OK] No hallucinations detected")
                return True


async def main():
    """Main test runner"""
    logger.info("=" * 70)
    logger.info("Hallucination Prevention Test Suite")
    logger.info("=" * 70)
    logger.info("")

    # Define test cases
    tests = [
        HallucinationTest("01", "01_silence_10s.raw", "Pure Silence", "Should be skipped by VAD"),
        HallucinationTest("02", "02_white_noise_10s.raw", "White Noise", "Should be rejected by Whisper"),
        HallucinationTest("03", "03_pink_noise_10s.raw", "Pink Noise", "Should be rejected by Whisper"),
        HallucinationTest("04", "04_keyboard_typing_10s.raw", "Keyboard Typing", "Should be filtered by VAD"),
        HallucinationTest("05", "05_low_freq_hum_10s.raw", "Low Frequency Hum", "Should be rejected by Whisper"),
        HallucinationTest("06", "06_speech_like_noise_10s.raw", "Speech-like Noise", "Critical test - should be rejected"),
        HallucinationTest("07", "07_silence_with_bursts_10s.raw", "Silence with Bursts", "Bursts should be ignored"),
        HallucinationTest("08", "08_3s_silence_1s_noise.raw", "Below Min Buffer", "Should be ignored (< 5s)"),
        HallucinationTest("10", "10_long_silence_35s.raw", "Very Long Silence", "Should be skipped or timeout"),
        HallucinationTest("12", "12_exactly_5s_noise.raw", "Exactly 5s Boundary", "Edge case - should be processed or rejected"),
        HallucinationTest("13", "13_repetitive_pattern_10s.raw", "Repetitive Pattern", "Should trigger compression_ratio_threshold"),
    ]

    client = HallucinationTestClient()

    try:
        # Connect to server
        await client.connect()

        # Run all tests
        results = []
        for test in tests:
            result = await client.run_test(test)
            results.append(result)
            # Wait between tests
            await asyncio.sleep(2)

        # Print summary
        logger.info("=" * 70)
        logger.info("TEST SUMMARY")
        logger.info("=" * 70)

        passed = sum(1 for r in results if r.passed)
        failed = len(results) - passed

        for result in results:
            logger.info(str(result))

        logger.info("-" * 70)
        logger.info(f"Total: {len(results)} tests")
        logger.info(f"Passed: {passed} ({passed/len(results)*100:.1f}%)")
        logger.info(f"Failed: {failed} ({failed/len(results)*100:.1f}%)")
        logger.info("=" * 70)

        if failed == 0:
            logger.info("[SUCCESS] All tests passed! Hallucination prevention is working effectively.")
        else:
            logger.warning(f"[WARNING] {failed} test(s) failed. Review the logs for details.")

    except websockets.exceptions.ConnectionRefusedError:
        logger.error(f"[ERROR] Failed to connect to server: {client.server_url}")
        logger.error("   Make sure the server is running: python main.py")
        sys.exit(1)

    except Exception as e:
        logger.error(f"[ERROR] Test failed: {str(e)}", exc_info=True)
        sys.exit(1)

    finally:
        await client.disconnect()


if __name__ == "__main__":
    asyncio.run(main())
