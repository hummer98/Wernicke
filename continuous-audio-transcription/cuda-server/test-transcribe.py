# -*- coding: utf-8 -*-
import sys
import io
import requests
import json

# Set UTF-8 encoding for Windows console
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

def test_transcribe(audio_file_path, language="ja"):
    """
    Test transcription with an audio file

    Args:
        audio_file_path: Path to audio file (WAV, MP3, etc.)
        language: Language code (ja, en, etc.)
    """
    url = "http://localhost:8000/transcribe"

    print(f"=== Transcription Test ===")
    print(f"File: {audio_file_path}")
    print(f"Language: {language}")
    print(f"Sending request to {url}...\n")

    try:
        with open(audio_file_path, 'rb') as audio_file:
            files = {'audio': audio_file}
            data = {'language': language}

            response = requests.post(url, files=files, data=data)

            if response.status_code == 200:
                result = response.json()
                print("[OK] Transcription successful!\n")
                print(f"Full text:\n{result['text']}\n")

                if 'segments' in result:
                    print(f"\nSegments ({len(result['segments'])} total):")
                    for i, seg in enumerate(result['segments'][:5]):  # Show first 5 segments
                        print(f"  [{seg['start']:.2f}s - {seg['end']:.2f}s]: {seg['text']}")
                    if len(result['segments']) > 5:
                        print(f"  ... and {len(result['segments']) - 5} more segments")

                return result
            else:
                print(f"[ERROR] Server returned status {response.status_code}")
                print(f"Response: {response.text}")
                return None

    except FileNotFoundError:
        print(f"[ERROR] Audio file not found: {audio_file_path}")
        return None
    except requests.exceptions.ConnectionError:
        print(f"[ERROR] Could not connect to server at {url}")
        print("Make sure the server is running!")
        return None
    except Exception as e:
        print(f"[ERROR] {e}")
        return None

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python test-transcribe.py <audio_file_path> [language]")
        print("\nExample:")
        print("  python test-transcribe.py sample.wav ja")
        print("  python test-transcribe.py audio.mp3 en")
        sys.exit(1)

    audio_path = sys.argv[1]
    language = sys.argv[2] if len(sys.argv) > 2 else "ja"

    test_transcribe(audio_path, language)
