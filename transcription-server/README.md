# Transcription Server

24時間連続音声文字起こしシステム - CUDAサーバー

## Overview

WhisperXとpyannote.audioを使用した高精度音声文字起こし・話者分離サーバー。
Windows + CUDA (RTX 3090) 環境で動作し、Mac Clientからの音声処理リクエストを受け付けます。

## Requirements

- Python 3.10+
- CUDA 11.8+ (NVIDIA GPU required)
- 16GB+ VRAM recommended
- Windows 10/11 or Linux

## Installation

### Basic Installation (Development/Mac)

```bash
# Install basic dependencies
pip install -r requirements.txt
```

### Full Installation (CUDA Server)

On the CUDA server with GPU, uncomment and install GPU dependencies in `requirements.txt`:

```bash
# Uncomment WhisperX, pyannote.audio lines in requirements.txt
pip install -r requirements.txt

# Set Hugging Face token for pyannote.audio
export HF_TOKEN="your_huggingface_token"
```

## Usage

### Start Server

```bash
# Using startup script
./start.sh

# Or manually
uvicorn main:app --host 0.0.0.0 --port 8000 --timeout-keep-alive 70
```

### API Endpoints

#### Health Check

```bash
curl http://localhost:8000/health
```

Response:
```json
{
  "status": "ok",
  "timestamp": "2025-11-04T12:00:00.000000"
}
```

#### Transcribe Audio

```bash
curl -X POST http://localhost:8000/transcribe \
  -F "file=@audio.wav"
```

Response:
```json
{
  "segments": [
    {
      "start": 0.0,
      "end": 2.5,
      "text": "これはモック文字起こし結果です。",
      "speaker": "Speaker_00",
      "words": [...]
    }
  ],
  "language": "ja",
  "duration": 2.5
}
```

#### Deployment Management

**Deploy (Git Pull + Restart)**

```bash
curl -X POST http://localhost:8000/deploy
```

**Restart Service**

```bash
curl -X POST http://localhost:8000/restart
```

**Get Service Status**

```bash
curl http://localhost:8000/status
```

**Get Logs**

```bash
curl http://localhost:8000/logs?lines=100
```

**Get Version Info**

```bash
curl http://localhost:8000/version
```

Response:
```json
{
  "commit_hash": "a1b2c3d",
  "commit_message": "Latest commit message",
  "branch": "main",
  "timestamp": "2025-11-04T12:00:00.000000"
}
```

## Testing

```bash
# Run all tests
pytest

# Run with coverage
pytest --cov=. --cov-report=html
```

## Project Structure

```
transcription-server/
├── main.py              # FastAPI application
├── routers/             # API route handlers
├── services/            # Business logic
├── tests/               # Test files
├── requirements.txt     # Python dependencies
├── pytest.ini          # Pytest configuration
└── start.sh            # Server startup script
```

## Development Status

- [x] Task 2.1: FastAPI Project Initialization
- [x] Task 2.2: WhisperX Transcription Implementation (Mock)
- [x] Task 2.3: pyannote.audio Diarization Implementation (Mock)
- [x] Task 2.4: Transcription API Endpoint
- [x] Task 2.5: Deployment Management API Integration

**Phase 2 Complete!** All CUDA server tasks are implemented.

**Note**: Tasks 2.2-2.4 are implemented with mock services for development on Mac. On the CUDA server with GPU, uncomment the actual WhisperX and pyannote.audio dependencies in `requirements.txt` and the services will use real GPU-accelerated processing.

**Environment Variables for Deployment**:
- `REPO_DIR`: Path to the repository (default: `/path/to/transcription-server`)
- `SERVICE_NAME`: PM2 service name (default: `transcription-server`)
- `HF_TOKEN`: Hugging Face token for pyannote.audio (required for speaker diarization)
