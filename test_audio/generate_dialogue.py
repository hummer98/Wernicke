#!/usr/bin/env python3
"""
Generate test dialogue audio for transcription testing
2人の自然な会話音声を生成
"""

import subprocess
import os
from pathlib import Path

# Output directory
output_dir = Path(__file__).parent
output_dir.mkdir(exist_ok=True)

# Dialogue script with natural pauses
dialogue = [
    {
        "speaker": "Speaker1",
        "text": "ねえ、今週末って予定ある？",
        "voice": "Kyoko",  # Female voice
        "pause_after": 1.5
    },
    {
        "speaker": "Speaker2",
        "text": "うーん、特にないかな。どうして？",
        "voice": "Kyoko",  # Same voice (male voice not available)
        "pause_after": 1.2
    },
    {
        "speaker": "Speaker1",
        "text": "実は、新しくできたカフェに行きたいなって思ってて。一緒にどう？",
        "voice": "Kyoko",
        "pause_after": 1.8
    },
    {
        "speaker": "Speaker2",
        "text": "いいね！何時頃がいい？",
        "voice": "Kyoko",
        "pause_after": 1.0
    },
    {
        "speaker": "Speaker1",
        "text": "午後2時くらいはどう？混んでない時間だと思うんだけど。",
        "voice": "Kyoko",
        "pause_after": 1.5
    },
    {
        "speaker": "Speaker2",
        "text": "オッケー。じゃあ、土曜日の2時に駅前で待ち合わせでいい？",
        "voice": "Kyoko",
        "pause_after": 1.3
    },
    {
        "speaker": "Speaker1",
        "text": "うん、わかった！楽しみ。",
        "voice": "Kyoko",
        "pause_after": 0.8
    },
    {
        "speaker": "Speaker2",
        "text": "じゃあまた連絡するね。",
        "voice": "Kyoko",
        "pause_after": 0.5
    }
]

def generate_audio_segment(text, voice, output_file):
    """Generate audio using macOS 'say' command"""
    try:
        subprocess.run(
            ["say", "-v", voice, "-o", output_file, text],
            check=True,
            capture_output=True
        )
        return True
    except subprocess.CalledProcessError as e:
        print(f"Error generating audio: {e}")
        print(f"stderr: {e.stderr.decode() if e.stderr else 'None'}")
        return False

def generate_silence(duration, output_file):
    """Generate silence using ffmpeg"""
    try:
        subprocess.run(
            [
                "ffmpeg", "-f", "lavfi", "-i",
                f"anullsrc=r=48000:cl=stereo:d={duration}",
                "-y", output_file
            ],
            check=True,
            capture_output=True
        )
        return True
    except subprocess.CalledProcessError as e:
        print(f"Error generating silence: {e}")
        return False

def main():
    print("Generating dialogue audio...")

    # Check if required commands are available
    try:
        subprocess.run(["say", "--version"], capture_output=True)
        subprocess.run(["ffmpeg", "-version"], capture_output=True)
    except FileNotFoundError as e:
        print(f"Error: Required command not found: {e}")
        print("Please ensure 'say' (macOS) and 'ffmpeg' are installed")
        return

    # Generate individual segments
    segment_files = []
    temp_dir = output_dir / "temp"
    temp_dir.mkdir(exist_ok=True)

    for i, turn in enumerate(dialogue):
        print(f"Generating segment {i+1}/{len(dialogue)}: {turn['speaker']}")

        # Generate speech
        speech_file = temp_dir / f"speech_{i:02d}.aiff"
        if not generate_audio_segment(turn["text"], turn["voice"], str(speech_file)):
            print(f"Failed to generate speech for segment {i}")
            return

        # Convert to WAV with correct format
        wav_file = temp_dir / f"speech_{i:02d}.wav"
        subprocess.run(
            [
                "ffmpeg", "-i", str(speech_file),
                "-ar", "48000", "-ac", "2", "-y", str(wav_file)
            ],
            check=True,
            capture_output=True
        )
        segment_files.append(str(wav_file))

        # Generate pause after speech
        if turn["pause_after"] > 0:
            pause_file = temp_dir / f"pause_{i:02d}.wav"
            if generate_silence(turn["pause_after"], str(pause_file)):
                segment_files.append(str(pause_file))

    # Concatenate all segments
    print("Concatenating segments...")
    concat_file = temp_dir / "concat_list.txt"
    with open(concat_file, "w") as f:
        for segment_file in segment_files:
            f.write(f"file '{segment_file}'\n")

    output_file = output_dir / "test_dialogue.wav"
    subprocess.run(
        [
            "ffmpeg", "-f", "concat", "-safe", "0",
            "-i", str(concat_file),
            "-ar", "48000", "-ac", "2", "-y", str(output_file)
        ],
        check=True
    )

    # Cleanup temp files
    print("Cleaning up temporary files...")
    import shutil
    shutil.rmtree(temp_dir)

    print(f"\nDialogue audio generated successfully!")
    print(f"Output: {output_file}")
    print(f"Duration: ~{sum(turn['pause_after'] for turn in dialogue) + len(dialogue) * 2:.1f} seconds")

    # Print dialogue transcript
    print("\n=== Dialogue Transcript ===")
    for turn in dialogue:
        print(f"{turn['speaker']}: {turn['text']}")

if __name__ == "__main__":
    main()
