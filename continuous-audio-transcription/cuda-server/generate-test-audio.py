# -*- coding: utf-8 -*-
"""
Generate a simple test audio file for transcription testing
Requires: pip install numpy scipy
"""
import sys
import io
import numpy as np
from scipy.io import wavfile

# Set UTF-8 encoding for Windows console
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

def generate_test_audio(output_path="test-audio.wav", duration=3, sample_rate=16000):
    """
    Generate a simple test audio file with a tone

    Args:
        output_path: Output WAV file path
        duration: Duration in seconds
        sample_rate: Sample rate in Hz
    """
    print(f"Generating test audio file...")
    print(f"  Duration: {duration}s")
    print(f"  Sample rate: {sample_rate}Hz")
    print(f"  Output: {output_path}")

    # Generate a simple 440Hz tone (A note)
    t = np.linspace(0, duration, int(sample_rate * duration))
    frequency = 440  # Hz
    audio = np.sin(2 * np.pi * frequency * t)

    # Add some amplitude variation
    envelope = np.linspace(0.5, 1.0, len(audio))
    audio = audio * envelope

    # Convert to 16-bit PCM
    audio = (audio * 32767).astype(np.int16)

    # Save as WAV file
    wavfile.write(output_path, sample_rate, audio)

    print(f"\n[OK] Test audio file created: {output_path}")
    print(f"Note: This is a simple tone. For real transcription testing,")
    print(f"      use an actual voice recording.")

if __name__ == "__main__":
    output = sys.argv[1] if len(sys.argv) > 1 else "test-audio.wav"
    duration = int(sys.argv[2]) if len(sys.argv) > 2 else 3

    generate_test_audio(output, duration)
