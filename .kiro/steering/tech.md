# Technology Stack and Architectural Decisions

## Python環境管理（Windows）
- Git Bash環境ではWindowsパスでもUnix形式の `/` を使用
- PyTorchバージョンはWhisperXの要求を確認後にインストール（依存関係競合を防止）
- CUDA版PyTorch: `--index-url https://download.pytorch.org/whl/cu121`を明示
- Windows console出力時はUTF-8エンコーディング設定必須（`sys.stdout = io.TextIOWrapper(...)`）

## WhisperX/音声処理依存関係
- ffmpegが必須（音声ファイル読み込みに使用）
- Windows: choco install ffmpeg または手動インストール後PATH設定
- インストール確認: `ffmpeg -version`
- **Chocolatey PATH**: インストール後は新しいPowerShellセッション開始が必要

## WhisperX バージョン互換性（2025-11現在）
- PyTorch 2.5.1+cu121で動作（WhisperXが2.8.0要求だが実用上問題なし）
- transformers 4.44.2必須（CVE-2025-32434によりPyTorch 2.6+が必要な4.52+は使用不可）
- numpy 2.0.2-2.1.0（WhisperX要件）
- CUDA 12.1版PyTorch 2.6+は未提供（2025-11時点）

## Core Technologies
- TypeScript/Node.js for client applications
- Python for ML/AI processing (WhisperX, CUDA)
- FastAPI for API servers

## Architecture Principles
- Separation of concerns: Client/Server architecture
- GPU-accelerated processing on dedicated CUDA server
- RESTful API design for transcription services
