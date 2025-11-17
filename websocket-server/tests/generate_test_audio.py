"""
Generate test audio files for hallucination prevention testing

Requirements:
- numpy

Usage:
    python tests/generate_test_audio.py
"""

import numpy as np
from pathlib import Path

# Audio configuration (matches server requirements)
SAMPLE_RATE = 16000  # 16kHz
DTYPE = np.float32


def generate_silence(duration_sec):
    """Generate silent audio"""
    num_samples = int(SAMPLE_RATE * duration_sec)
    return np.zeros(num_samples, dtype=DTYPE)


def generate_white_noise(duration_sec, amplitude=0.05):
    """Generate white noise"""
    num_samples = int(SAMPLE_RATE * duration_sec)
    return np.random.normal(0, amplitude, num_samples).astype(DTYPE)


def generate_pink_noise(duration_sec, amplitude=0.05):
    """Generate pink noise (1/f noise) - more natural sounding"""
    num_samples = int(SAMPLE_RATE * duration_sec)
    # Generate white noise
    white = np.random.randn(num_samples)

    # Apply pink noise filter (simple approximation)
    # Use FFT to shape the spectrum
    fft = np.fft.rfft(white)
    freqs = np.fft.rfftfreq(num_samples, 1/SAMPLE_RATE)
    # Avoid division by zero
    freqs[0] = 1
    # Apply 1/f filter
    fft = fft / np.sqrt(freqs)
    pink = np.fft.irfft(fft, n=num_samples)

    # Normalize and scale
    pink = pink / np.max(np.abs(pink)) * amplitude
    return pink.astype(DTYPE)


def generate_keyboard_typing(duration_sec, num_keystrokes=10):
    """Simulate keyboard typing sounds"""
    num_samples = int(SAMPLE_RATE * duration_sec)
    audio = np.zeros(num_samples, dtype=DTYPE)

    # Random keystroke timings
    keystroke_times = np.random.uniform(0, duration_sec, num_keystrokes)

    for t in keystroke_times:
        start_idx = int(t * SAMPLE_RATE)
        # Short click sound (50ms)
        click_duration = int(0.05 * SAMPLE_RATE)
        if start_idx + click_duration < num_samples:
            # Sharp transient followed by decay
            click = np.random.normal(0, 0.3, click_duration).astype(DTYPE)
            # Apply exponential decay
            decay = np.exp(-np.linspace(0, 5, click_duration))
            click = click * decay
            audio[start_idx:start_idx + click_duration] += click

    return audio


def generate_sine_tone(frequency, duration_sec, amplitude=0.1):
    """Generate sine wave tone"""
    num_samples = int(SAMPLE_RATE * duration_sec)
    t = np.linspace(0, duration_sec, num_samples, dtype=DTYPE)
    return (amplitude * np.sin(2 * np.pi * frequency * t)).astype(DTYPE)


def generate_speech_like_noise(duration_sec):
    """Generate noise in speech frequency range (300-3400 Hz)"""
    num_samples = int(SAMPLE_RATE * duration_sec)
    # Generate white noise
    noise = np.random.randn(num_samples)

    # Apply bandpass filter (simple approximation using FFT)
    fft = np.fft.rfft(noise)
    freqs = np.fft.rfftfreq(num_samples, 1/SAMPLE_RATE)

    # Bandpass: keep only 300-3400 Hz
    mask = (freqs >= 300) & (freqs <= 3400)
    fft[~mask] = 0

    filtered = np.fft.irfft(fft, n=num_samples)
    # Normalize
    filtered = filtered / np.max(np.abs(filtered)) * 0.1
    return filtered.astype(DTYPE)


def save_audio(filename, audio_data):
    """Save audio as 16kHz mono float32 RAW file"""
    output_path = Path(__file__).parent / 'test_audio' / filename
    output_path.parent.mkdir(parents=True, exist_ok=True)

    # Save as raw float32
    audio_data.tofile(str(output_path))
    print(f"[OK] Created: {output_path} ({len(audio_data)/SAMPLE_RATE:.1f}s, {len(audio_data)*4} bytes)")


def create_test_dataset():
    """Create comprehensive test audio dataset"""
    print("=" * 60)
    print("Generating Hallucination Prevention Test Audio Dataset")
    print("=" * 60)
    print()

    # Test 1: Pure silence (should be skipped by VAD)
    print("Test 1: Pure Silence")
    silence_10s = generate_silence(10.0)
    save_audio("01_silence_10s.raw", silence_10s)
    print()

    # Test 2: White noise (should be rejected by Whisper parameters)
    print("Test 2: White Noise")
    white_noise = generate_white_noise(10.0, amplitude=0.1)
    save_audio("02_white_noise_10s.raw", white_noise)
    print()

    # Test 3: Pink noise (more natural, still non-speech)
    print("Test 3: Pink Noise (Natural Background)")
    pink_noise = generate_pink_noise(10.0, amplitude=0.08)
    save_audio("03_pink_noise_10s.raw", pink_noise)
    print()

    # Test 4: Keyboard typing sounds (short transients)
    print("Test 4: Keyboard Typing (Short Transients)")
    typing = generate_keyboard_typing(10.0, num_keystrokes=15)
    save_audio("04_keyboard_typing_10s.raw", typing)
    print()

    # Test 5: Low frequency hum (air conditioner, fan noise)
    print("Test 5: Low Frequency Hum (60Hz)")
    hum = generate_sine_tone(60, 10.0, amplitude=0.05)
    save_audio("05_low_freq_hum_10s.raw", hum)
    print()

    # Test 6: Speech-like noise (in speech frequency range)
    print("Test 6: Speech-like Noise (300-3400 Hz)")
    speech_noise = generate_speech_like_noise(10.0)
    save_audio("06_speech_like_noise_10s.raw", speech_noise)
    print()

    # Test 7: Silence with occasional noise bursts
    print("Test 7: Silence with Noise Bursts")
    silence_noise = generate_silence(10.0)
    # Add 3 noise bursts
    for t in [2.0, 5.0, 8.0]:
        start_idx = int(t * SAMPLE_RATE)
        burst_duration = int(0.5 * SAMPLE_RATE)  # 500ms bursts
        noise_burst = generate_white_noise(0.5, amplitude=0.15)
        silence_noise[start_idx:start_idx + burst_duration] = noise_burst
    save_audio("07_silence_with_bursts_10s.raw", silence_noise)
    print()

    # Test 8: Long silence (3 seconds) + short noise (should be ignored by MIN_BUFFER check)
    print("Test 8: 3s Silence + 1s Noise (Below Min Buffer)")
    short_test = np.concatenate([
        generate_silence(3.0),
        generate_white_noise(1.0, amplitude=0.1)
    ])
    save_audio("08_3s_silence_1s_noise.raw", short_test)
    print()

    # Test 9: Multiple short silences with noise (simulating pauses)
    print("Test 9: Multiple Short Pauses with Noise")
    multi_pause = np.concatenate([
        generate_white_noise(2.0, amplitude=0.08),  # noise
        generate_silence(0.5),                       # short pause
        generate_white_noise(2.0, amplitude=0.08),  # noise
        generate_silence(0.5),                       # short pause
        generate_white_noise(2.0, amplitude=0.08),  # noise
    ])
    save_audio("09_multiple_pauses_with_noise.raw", multi_pause)
    print()

    # Test 10: Very long silence (should trigger MAX_BUFFER_SIZE eventually)
    print("Test 10: Very Long Silence (35 seconds)")
    long_silence = generate_silence(35.0)
    save_audio("10_long_silence_35s.raw", long_silence)
    print()

    # Test 11: Combination - realistic scenario with keyboard sounds
    print("Test 11: Realistic Office Scenario")
    office_noise = np.concatenate([
        generate_silence(2.0),                       # initial silence
        generate_keyboard_typing(3.0, num_keystrokes=8),  # typing
        generate_silence(2.0),                       # pause
        generate_pink_noise(3.0, amplitude=0.05),    # ambient noise
        generate_silence(3.0),                       # pause
        generate_keyboard_typing(2.0, num_keystrokes=5),  # more typing
        generate_silence(2.0),                       # final pause
    ])
    save_audio("11_office_scenario_17s.raw", office_noise)
    print()

    # Test 12: Edge case - exactly 5 seconds (minimum buffer size)
    print("Test 12: Exactly 5 Seconds of Noise (Min Buffer Boundary)")
    exactly_5s = generate_pink_noise(5.0, amplitude=0.1)
    save_audio("12_exactly_5s_noise.raw", exactly_5s)
    print()

    # Test 13: Repetitive pattern (should trigger compression_ratio_threshold)
    print("Test 13: Repetitive Pattern (Compression Test)")
    # Create repeating 440Hz tone bursts
    pattern = generate_sine_tone(440, 0.5, amplitude=0.1)
    repetitive = np.tile(pattern, 20)  # 10 seconds of repetition
    save_audio("13_repetitive_pattern_10s.raw", repetitive)
    print()

    print("=" * 60)
    print("[SUCCESS] Test audio dataset generation complete!")
    print("=" * 60)
    print()
    print("Test Files Created:")
    print("-" * 60)
    print("01: Pure silence (10s) - VAD should skip")
    print("02: White noise (10s) - Whisper should reject")
    print("03: Pink noise (10s) - More natural background")
    print("04: Keyboard typing (10s) - Short transients")
    print("05: Low frequency hum (10s) - 60Hz")
    print("06: Speech-like noise (10s) - In speech freq range")
    print("07: Silence with bursts (10s) - Intermittent noise")
    print("08: 3s silence + 1s noise - Below min buffer")
    print("09: Multiple pauses (7s) - Realistic pauses")
    print("10: Very long silence (35s) - Max buffer test")
    print("11: Office scenario (17s) - Realistic combination")
    print("12: Exactly 5s noise - Min buffer boundary")
    print("13: Repetitive pattern (10s) - Compression test")
    print("-" * 60)
    print()
    print("Next Steps:")
    print("1. Run the E2E test client with these files:")
    print("   python tests/test_e2e_websocket_client.py")
    print("2. Check server logs for VAD/Whisper rejection messages")
    print("3. Verify that no hallucinations occur")


if __name__ == "__main__":
    create_test_dataset()
