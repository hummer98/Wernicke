# WhisperX CUDA Server - Windows Setup

## Prerequisites

### Required Software
- Python 3.9-3.11
- NVIDIA GPU with CUDA support
- **ffmpeg** (required for audio file processing)

### Installing ffmpeg on Windows

**Method 1: Using Chocolatey (Recommended)**
```powershell
choco install ffmpeg
```

**Method 2: Manual Installation**
1. Download from https://www.gyan.dev/ffmpeg/builds/
2. Extract to `C:\ffmpeg`
3. Add `C:\ffmpeg\bin` to system PATH
4. Verify: `ffmpeg -version`

## Starting the Server

### Method 1: Using PowerShell
```powershell
.\cuda-server\start-server.ps1
```

### Method 2: Using Batch File (Double-click)
Double-click `cuda-server\start-server.bat`

### Method 3: Manual
```powershell
.\whisperx-env\Scripts\Activate.ps1
python cuda-server\server.py
```

## Accessing the Server

- Health Check: http://localhost:8000/health
- API Docs: http://localhost:8000/docs
- Transcribe endpoint: POST http://localhost:8000/transcribe

## Testing

### Initial Verification (After Installation)

**Quick Health Check:**
```powershell
curl http://localhost:8000/health
```

Expected response: `{"status":"ok","device":"cuda",...}`

**Generate Test Audio (Japanese dialogue):**
```powershell
.\whisperx-env\Scripts\Activate.ps1
python cuda-server\generate-japanese-dialogue.py
```

This creates `test-japanese-dialogue.wav` with a sample conversation:
- Person 1: "おはようございます。今日の会議は何時からですか？"
- Person 2: "おはようございます。午後2時からです。"
- Person 1: "わかりました。資料の準備はできていますか？"
- Person 2: "はい、すでに準備完了しています。"
- Person 1: "ありがとうございます。それでは会議室でお待ちしています。"

**Test Transcription:**
```powershell
curl -X POST "http://localhost:8000/transcribe" -F "audio=@test-japanese-dialogue.wav" -F "language=ja"
```

Expected: JSON response with transcribed Japanese text and word-level timestamps.

**⚠️ User Confirmation Required:**
After running the test, verify the transcription output is correct. If you need to test with your own audio files, continue with the methods below.

### Method 1: Using Python Test Script (Recommended)

```powershell
# Activate virtual environment first
.\whisperx-env\Scripts\Activate.ps1

# Test with your audio file
python cuda-server\test-transcribe.py path\to\your\audio.wav ja

# Or with English audio
python cuda-server\test-transcribe.py audio.mp3 en
```

### Method 2: Using curl

```powershell
# Test from another terminal
curl -X POST "http://localhost:8000/transcribe" -F "audio=@test.wav" -F "language=ja"
```

### Method 3: Using Browser

1. Open http://localhost:8000/docs
2. Click on "POST /transcribe"
3. Click "Try it out"
4. Upload your audio file
5. Set language (e.g., "ja")
6. Click "Execute"

## Firewall Configuration

Run as Administrator:
```powershell
.\cuda-server\configure-firewall.ps1
```

## Server Configuration

Edit `server-config.json` to customize:

- `model`: Model size (tiny/base/small/medium/large/large-v2/large-v3)
- `language`: Default language code (ja/en/etc)
- `compute_type`: Computation precision (float16/int8_float16/int8)
- `enable_diarization`: Enable speaker diarization (requires HF token)
- `hf_token`: Hugging Face access token for diarization

## Troubleshooting

### CUDA Out of Memory
- Use smaller model in `server-config.json`
- Reduce batch size
- Close other GPU applications

### Module Import Errors
- Ensure virtual environment is activated
- Reinstall dependencies: `pip install -r requirements.txt`

### Server Won't Start
- Check if port 8000 is already in use
- Verify CUDA drivers are installed
- Check `nvidia-smi` output

## System Information

Tested with:
- Python 3.10.6
- PyTorch 2.5.1+cu121
- CUDA 12.1
- NVIDIA GeForce RTX 3090 (24GB VRAM)

## API Usage Example

### Using Python requests

```python
import requests

url = "http://localhost:8000/transcribe"
files = {"audio": open("audio.wav", "rb")}
data = {"language": "ja"}

response = requests.post(url, files=files, data=data)
print(response.json())
```

### Response Format

```json
{
  "text": "完全な文字起こしテキスト",
  "language": "ja",
  "segments": [
    {
      "start": 0.0,
      "end": 2.5,
      "text": "セグメントのテキスト",
      "words": [...]
    }
  ]
}
```
