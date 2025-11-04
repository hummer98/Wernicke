# WhisperX CUDA Server - Testing Guide

## Test Data

### Included Sample Files

1. **test-japanese-dialogue.wav** - Japanese conversation sample
   - Duration: ~24 seconds
   - Content: Business meeting dialogue (5 exchanges)
   - Generated using: `generate-japanese-dialogue.py`

2. **test-simple.wav** - Simple tone (440Hz)
   - Duration: 3 seconds
   - Use case: Testing audio file loading (no speech)

### Generating Test Audio

**Create Japanese Dialogue:**
```bash
.\whisperx-env\Scripts\Activate.ps1
python cuda-server\generate-japanese-dialogue.py
```

**Custom Duration:**
```bash
python cuda-server\generate-japanese-dialogue.py my-test.wav
```

## Test Scenarios

### 1. Server Health Check

```bash
curl http://localhost:8000/health
```

**Expected Response:**
```json
{
  "status": "ok",
  "device": "cuda",
  "model": "medium",
  "cuda_available": true
}
```

### 2. Basic Japanese Transcription

```bash
curl -X POST "http://localhost:8000/transcribe" \
  -F "audio=@test-japanese-dialogue.wav" \
  -F "language=ja"
```

**Expected Output:**
- Text field with Japanese transcription
- Segments array with timestamp information
- Words array with word-level timing and confidence scores

**Sample Expected Text:**
```
おはようございます今日の会議は何時からですか おはようございます午後2時からですわかりました資料の準備はできていますか はいすでに準備完了していますありがとうございますそれでは会議室でお待ちしています
```

### 3. English Transcription

```bash
curl -X POST "http://localhost:8000/transcribe" \
  -F "audio=@your-english-audio.wav" \
  -F "language=en"
```

### 4. Automatic Language Detection

Omit the language parameter to let WhisperX detect the language:

```bash
curl -X POST "http://localhost:8000/transcribe" \
  -F "audio=@test-japanese-dialogue.wav"
```

## Verification Checklist

After installation, verify the following:

- [ ] Server starts without errors
- [ ] Health check returns status "ok"
- [ ] CUDA is available (`cuda_available: true`)
- [ ] Model loads successfully (check startup logs)
- [ ] Japanese alignment model loads (jonatasgrosman/wav2vec2-large-xlsr-53-japanese)
- [ ] Test transcription completes successfully
- [ ] Output contains accurate Japanese text
- [ ] Word-level timestamps are present
- [ ] Confidence scores are reasonable (>0.8 for most words)

## Troubleshooting Tests

### Test Fails: "FileNotFoundError" for ffmpeg

**Cause:** ffmpeg not in PATH

**Solution:**
```powershell
# Verify ffmpeg installation
ffmpeg -version

# If not found, install via Chocolatey
choco install ffmpeg -y

# Restart PowerShell session
```

### Test Fails: Alignment model error

**Cause:** transformers version incompatibility

**Solution:**
```bash
pip install transformers==4.44.2 --force-reinstall
pip install "numpy>=2.0.2,<2.1.0"
```

### Test Fails: Empty transcription

**Cause:** Audio contains no speech (e.g., test-simple.wav)

**Solution:** Use test-japanese-dialogue.wav or your own voice recording

## Performance Expectations

### RTX 3090 (24GB VRAM)

- **Model:** medium
- **Test audio:** 24 seconds
- **Transcription time:** ~3-5 seconds
- **Memory usage:** ~8GB VRAM

### Lower-end GPUs

Consider using smaller models:
- `tiny`: Fastest, less accurate
- `base`: Good balance
- `small`: Better accuracy
- `medium`: High accuracy (default)

Edit `server-config.json` to change model size.

## User Confirmation Prompt

**After successful test, ask the user:**

> ✅ Test completed successfully. Transcription output verified.
>
> Would you like to:
> 1. Test with your own audio files?
> 2. Proceed with production use?
> 3. Adjust server configuration (model size, language, etc.)?
>
> Please confirm before continuing.

This ensures the user validates the installation before proceeding to production use.
