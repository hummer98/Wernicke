# Windows Setup Automation Prompt for Claude Code

このファイルをClaude Codeで実行すると、Windows環境でのCUDAサーバーセットアップを自動化します。

---

# Setup Instructions

Please help me set up the WhisperX CUDA server on Windows by executing the following tasks automatically:

## Prerequisites Verification

First, verify that the following are installed:
1. Python 3.9-3.11 (check with `python --version`)
2. NVIDIA GPU with CUDA support (check with `nvidia-smi`)
3. Git (check with `git --version`)

If any are missing, provide installation instructions and wait for user confirmation before proceeding.

## Setup Tasks

Execute the following tasks in order:

### Task 1: Create Python Virtual Environment

```powershell
# Navigate to project root
cd continuous-audio-transcription

# Create virtual environment
python -m venv whisperx-env

# Activate virtual environment
.\whisperx-env\Scripts\Activate.ps1

# Upgrade pip
pip install --upgrade pip setuptools wheel
```

### Task 2: Install PyTorch with CUDA Support

Detect the CUDA version using `nvidia-smi` and install the appropriate PyTorch version:

```powershell
# For CUDA 11.8
pip install torch torchvision torchaudio --index-url https://download.pytorch.org/whl/cu118

# For CUDA 12.1
pip install torch torchvision torchaudio --index-url https://download.pytorch.org/whl/cu121
```

Verify installation:
```python
python -c "import torch; print(f'PyTorch: {torch.__version__}'); print(f'CUDA available: {torch.cuda.is_available()}'); print(f'CUDA version: {torch.version.cuda}')"
```

### Task 3: Install WhisperX

```powershell
pip install git+https://github.com/m-bain/whisperx.git
```

### Task 4: Install FastAPI and Dependencies

```powershell
pip install fastapi uvicorn python-multipart
```

### Task 5: Install pyannote.audio (Optional - for speaker diarization)

Ask user if they want speaker diarization support. If yes:

1. Prompt user to obtain Hugging Face Access Token:
   - Visit https://huggingface.co/settings/tokens
   - Create a new token
   - Accept terms for:
     - https://huggingface.co/pyannote/speaker-diarization-3.1
     - https://huggingface.co/pyannote/segmentation-3.0

2. Install and login:
```powershell
pip install pyannote.audio huggingface_hub
huggingface-cli login
# User will paste token when prompted
```

### Task 6: Create Server Configuration

Create `server-config.json` in the project root:

```json
{
  "host": "0.0.0.0",
  "port": 8000,
  "model": "medium",
  "language": "ja",
  "compute_type": "float16",
  "enable_diarization": false,
  "hf_token": ""
}
```

Ask user for:
- Model size (tiny/base/small/medium/large)
- Default language (ja/en/etc)
- Enable diarization (true/false)
- Hugging Face token (if diarization enabled)

Update the config file with user's choices.

### Task 7: Create FastAPI Server

Create `cuda-server/server.py`:

```python
from fastapi import FastAPI, File, UploadFile, Form, HTTPException
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
import whisperx
import torch
import tempfile
import os
import json
import gc
from typing import Optional
from pathlib import Path

# Load configuration
config_path = Path(__file__).parent.parent / "server-config.json"
with open(config_path) as f:
    config = json.load(f)

app = FastAPI(title="WhisperX Transcription Server")

# Enable CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Global variables for models
device = "cuda" if torch.cuda.is_available() else "cpu"
compute_type = config.get("compute_type", "float16") if device == "cuda" else "float32"
model = None
align_models = {}
diarize_model = None

@app.on_event("startup")
async def startup_event():
    """Load models on startup"""
    global model, diarize_model

    print(f"[Startup] Device: {device}")
    print(f"[Startup] Compute type: {compute_type}")
    print(f"[Startup] Loading WhisperX model: {config['model']}")

    model = whisperx.load_model(
        config["model"],
        device,
        compute_type=compute_type,
        language=config.get("language", "ja")
    )
    print("[Startup] WhisperX model loaded successfully")

    # Load diarization model if enabled
    if config.get("enable_diarization", False):
        hf_token = config.get("hf_token")
        if hf_token:
            print("[Startup] Loading diarization model...")
            diarize_model = whisperx.DiarizationPipeline(
                use_auth_token=hf_token,
                device=device
            )
            print("[Startup] Diarization model loaded successfully")
        else:
            print("[Warning] Diarization enabled but no HF token provided")

@app.on_event("shutdown")
async def shutdown_event():
    """Cleanup on shutdown"""
    global model, align_models, diarize_model
    model = None
    align_models = {}
    diarize_model = None
    gc.collect()
    if torch.cuda.is_available():
        torch.cuda.empty_cache()

@app.get("/")
async def root():
    """Root endpoint"""
    return {
        "service": "WhisperX Transcription Server",
        "status": "running",
        "device": device,
        "model": config["model"]
    }

@app.get("/health")
async def health_check():
    """Health check endpoint"""
    return {
        "status": "ok",
        "device": device,
        "compute_type": compute_type,
        "model": config["model"],
        "model_loaded": model is not None,
        "diarization_available": diarize_model is not None,
        "cuda_available": torch.cuda.is_available(),
        "cuda_version": torch.version.cuda if torch.cuda.is_available() else None
    }

@app.post("/transcribe")
async def transcribe_audio(
    audio: UploadFile = File(...),
    language: str = Form(None),
    enable_diarization: bool = Form(False)
):
    """Transcribe audio file"""
    if model is None:
        raise HTTPException(status_code=503, detail="Model not loaded")

    # Use configured language if not specified
    lang = language or config.get("language", "ja")

    temp_path = None
    try:
        # Save uploaded file to temp
        with tempfile.NamedTemporaryFile(delete=False, suffix=".wav") as temp_file:
            content = await audio.read()
            temp_file.write(content)
            temp_path = temp_file.name

        # Load audio
        audio_data = whisperx.load_audio(temp_path)

        # Transcribe
        result = model.transcribe(audio_data, language=lang)

        # Align timestamps
        if lang not in align_models:
            align_models[lang] = whisperx.load_align_model(
                language_code=lang,
                device=device
            )

        model_a, metadata = align_models[lang]
        result = whisperx.align(
            result["segments"],
            model_a,
            metadata,
            audio_data,
            device
        )

        # Speaker diarization (optional)
        if enable_diarization and diarize_model:
            diarize_segments = diarize_model(temp_path)
            result = whisperx.assign_word_speakers(diarize_segments, result)

        # Cleanup
        gc.collect()
        if torch.cuda.is_available():
            torch.cuda.empty_cache()

        return JSONResponse(content={
            "text": " ".join([seg.get("text", "") for seg in result.get("segments", [])]),
            "language": lang,
            "segments": result.get("segments", [])
        })

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

    finally:
        # Cleanup temp file
        if temp_path and os.path.exists(temp_path):
            try:
                os.unlink(temp_path)
            except:
                pass

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        app,
        host=config.get("host", "0.0.0.0"),
        port=config.get("port", 8000),
        log_level="info"
    )
```

### Task 8: Create Startup Scripts

Create `cuda-server/start-server.ps1`:

```powershell
# Activate virtual environment
& ".\whisperx-env\Scripts\Activate.ps1"

# Start server
python cuda-server\server.py
```

Create `cuda-server/start-server.bat`:

```batch
@echo off
call whisperx-env\Scripts\activate.bat
python cuda-server\server.py
pause
```

### Task 9: Configure Windows Firewall

Create `cuda-server/configure-firewall.ps1` (requires admin):

```powershell
# This script must be run as Administrator
$ruleName = "WhisperX CUDA Server"
$port = 8000

# Remove existing rule if exists
Remove-NetFirewallRule -DisplayName $ruleName -ErrorAction SilentlyContinue

# Create new rule
New-NetFirewallRule -DisplayName $ruleName `
    -Direction Inbound `
    -Protocol TCP `
    -LocalPort $port `
    -Action Allow `
    -Profile Any `
    -Description "Allow WhisperX CUDA transcription server"

Write-Host "Firewall rule created for port $port"
```

### Task 10: Test Installation

Create a test script `cuda-server/test-setup.py`:

```python
import sys
import torch
import whisperx

print("=== WhisperX Setup Test ===\n")

# Check Python version
print(f"Python version: {sys.version}")

# Check PyTorch
print(f"\nPyTorch version: {torch.__version__}")
print(f"CUDA available: {torch.cuda.is_available()}")
if torch.cuda.is_available():
    print(f"CUDA version: {torch.version.cuda}")
    print(f"GPU: {torch.cuda.get_device_name(0)}")
    print(f"GPU memory: {torch.cuda.get_device_properties(0).total_memory / 1024**3:.2f} GB")

# Check WhisperX
print(f"\nWhisperX module: OK")

# Try loading a small model
print("\nTesting model loading...")
try:
    device = "cuda" if torch.cuda.is_available() else "cpu"
    model = whisperx.load_model("tiny", device, compute_type="float16" if device == "cuda" else "float32")
    print("✓ Model loaded successfully")
    del model
    torch.cuda.empty_cache()
except Exception as e:
    print(f"✗ Model loading failed: {e}")

print("\n=== Setup test complete ===")
```

Run the test:
```powershell
python cuda-server\test-setup.py
```

### Task 11: Create README

Create `cuda-server/README.md` with usage instructions:

```markdown
# WhisperX CUDA Server - Windows Setup

## Starting the Server

### Method 1: Using PowerShell
```powershell
.\start-server.ps1
```

### Method 2: Using Batch File (Double-click)
Double-click `start-server.bat`

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

```powershell
# Test from another terminal
curl -X POST "http://localhost:8000/transcribe" -F "audio=@test.wav" -F "language=ja"
```

## Firewall Configuration

Run as Administrator:
```powershell
.\configure-firewall.ps1
```

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
```

## Final Steps

After completing all tasks:

1. Create `requirements.txt`:
```powershell
pip freeze > cuda-server\requirements.txt
```

2. Display summary:
```
Setup Complete!

📁 Created files:
- server-config.json
- cuda-server/server.py
- cuda-server/start-server.ps1
- cuda-server/start-server.bat
- cuda-server/configure-firewall.ps1
- cuda-server/test-setup.py
- cuda-server/README.md
- cuda-server/requirements.txt

🚀 To start the server:
1. Open PowerShell in project directory
2. Run: .\cuda-server\start-server.ps1
3. Server will start at http://localhost:8000

📝 Next steps:
1. Configure firewall (as Administrator): .\cuda-server\configure-firewall.ps1
2. Test server: http://localhost:8000/health
3. Update client config.json to point to http://localhost:8000
```

## Error Handling

If any step fails:
1. Display clear error message
2. Suggest solution
3. Ask if user wants to retry or skip
4. Log error to `setup-log.txt`

## User Confirmation Points

Pause and ask for confirmation at:
1. After prerequisites check
2. After virtual environment creation
3. After PyTorch installation (verify CUDA works)
4. Before installing large models
5. After each major task completion

---

# Execution Mode

Please execute this setup automatically, but:
- Show progress for each step
- Wait for user confirmation at checkpoints
- Handle errors gracefully
- Provide clear next steps at the end
