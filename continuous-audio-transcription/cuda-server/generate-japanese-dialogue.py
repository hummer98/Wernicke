# -*- coding: utf-8 -*-
"""
Generate Japanese dialogue audio for testing WhisperX transcription
"""
import sys
import io
from gtts import gTTS
from pydub import AudioSegment
import os

# Set UTF-8 encoding for Windows console
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

def generate_dialogue(output_path="test-japanese-dialogue.wav"):
    """
    Generate a dialogue between two people in Japanese
    """
    print("Generating Japanese dialogue audio...")

    # Dialogue script
    dialogue = [
        ("おはようございます。今日の会議は何時からですか？", "person1"),
        ("おはようございます。午後2時からです。", "person2"),
        ("わかりました。資料の準備はできていますか？", "person1"),
        ("はい、すでに準備完了しています。", "person2"),
        ("ありがとうございます。それでは会議室でお待ちしています。", "person1"),
    ]

    # Generate individual audio segments
    segments = []
    temp_files = []

    for i, (text, speaker) in enumerate(dialogue):
        print(f"  Generating: {speaker} - {text}")
        temp_file = f"temp_{i}.mp3"
        temp_files.append(temp_file)

        # Generate speech with gTTS
        tts = gTTS(text=text, lang='ja', slow=False)
        tts.save(temp_file)

        # Load as AudioSegment
        segment = AudioSegment.from_mp3(temp_file)

        # Add pause after each utterance (500ms)
        pause = AudioSegment.silent(duration=500)
        segments.append(segment + pause)

    # Combine all segments
    print("\nCombining audio segments...")
    combined = sum(segments)

    # Export as WAV
    print(f"Exporting to {output_path}...")
    combined.export(output_path, format="wav")

    # Clean up temp files
    print("Cleaning up temporary files...")
    for temp_file in temp_files:
        if os.path.exists(temp_file):
            os.remove(temp_file)

    print(f"\n[OK] Dialogue audio generated: {output_path}")
    print(f"Duration: {len(combined)/1000:.1f} seconds")
    print("\nDialogue content:")
    for text, speaker in dialogue:
        print(f"  {speaker}: {text}")

if __name__ == "__main__":
    output = sys.argv[1] if len(sys.argv) > 1 else "test-japanese-dialogue.wav"
    generate_dialogue(output)
