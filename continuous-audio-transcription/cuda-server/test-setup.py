# -*- coding: utf-8 -*-
import sys
import torch
import whisperx
import io

# Set UTF-8 encoding for Windows console
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

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
    print("[OK] Model loaded successfully")
    del model
    if torch.cuda.is_available():
        torch.cuda.empty_cache()
except Exception as e:
    print(f"[ERROR] Model loading failed: {e}")

print("\n=== Setup test complete ===")
