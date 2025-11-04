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
        # On Windows, we need to close the file before other processes can access it
        temp_file = tempfile.NamedTemporaryFile(delete=False, suffix=".wav")
        try:
            content = await audio.read()
            temp_file.write(content)
            temp_path = temp_file.name
        finally:
            temp_file.close()

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
        import traceback
        error_detail = f"{str(e)}\n\nTraceback:\n{traceback.format_exc()}"
        print(f"[ERROR] Transcription failed: {error_detail}")
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
