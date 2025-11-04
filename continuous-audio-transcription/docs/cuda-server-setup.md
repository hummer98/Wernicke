# CUDA Server Setup Guide

WhisperX + pyannote.audio による文字起こしCUDAサーバーのセットアップ手順

## システム要件

### ハードウェア

- **GPU**: NVIDIA GPU（CUDA対応）
  - VRAM 4GB以上（mediumモデル使用時）
  - VRAM 8GB以上（largeモデル使用時）
  - 推奨: RTX 3060以上、Tesla T4以上

### ソフトウェア

- **OS**: Linux（Ubuntu 20.04/22.04推奨）または Windows 10/11
- **Python**: 3.9 - 3.11（3.12は未対応）
- **CUDA Toolkit**: 11.8以降
- **cuDNN**: 8.6以降
- **Git**: バージョン管理用

## セットアップ手順

### 1. CUDA Toolkitのインストール

#### Ubuntu/Linux

```bash
# CUDA 12.1のインストール例
wget https://developer.download.nvidia.com/compute/cuda/repos/ubuntu2204/x86_64/cuda-ubuntu2204.pin
sudo mv cuda-ubuntu2204.pin /etc/apt/preferences.d/cuda-repository-pin-600
wget https://developer.download.nvidia.com/compute/cuda/12.1.0/local_installers/cuda-repo-ubuntu2204-12-1-local_12.1.0-530.30.02-1_amd64.deb
sudo dpkg -i cuda-repo-ubuntu2204-12-1-local_12.1.0-530.30.02-1_amd64.deb
sudo cp /var/cuda-repo-ubuntu2204-12-1-local/cuda-*-keyring.gpg /usr/share/keyrings/
sudo apt-get update
sudo apt-get -y install cuda

# 環境変数の設定
echo 'export PATH=/usr/local/cuda/bin:$PATH' >> ~/.bashrc
echo 'export LD_LIBRARY_PATH=/usr/local/cuda/lib64:$LD_LIBRARY_PATH' >> ~/.bashrc
source ~/.bashrc

# インストール確認
nvcc --version
nvidia-smi
```

#### Windows

1. [CUDA Toolkit Download](https://developer.nvidia.com/cuda-downloads) から最新版をダウンロード
2. インストーラーを実行（Visual Studio Integrationを含む）
3. 環境変数が自動設定されることを確認

```powershell
# インストール確認
nvcc --version
nvidia-smi
```

### 2. cuDNNのインストール

#### Ubuntu/Linux

```bash
# cuDNNのダウンロード（NVIDIAアカウントが必要）
# https://developer.nvidia.com/cudnn からダウンロード

# ダウンロードしたファイルを展開
tar -xvf cudnn-linux-x86_64-8.x.x.x_cudaX.Y-archive.tar.xz

# CUDAディレクトリにコピー
sudo cp cudnn-*-archive/include/cudnn*.h /usr/local/cuda/include
sudo cp -P cudnn-*-archive/lib/libcudnn* /usr/local/cuda/lib64
sudo chmod a+r /usr/local/cuda/include/cudnn*.h /usr/local/cuda/lib64/libcudnn*
```

#### Windows

1. [cuDNN Download](https://developer.nvidia.com/cudnn) からダウンロード
2. ZIPファイルを展開
3. 以下のファイルをCUDAディレクトリにコピー:
   - `bin/cudnn*.dll` → `C:\Program Files\NVIDIA GPU Computing Toolkit\CUDA\v12.1\bin`
   - `include/cudnn*.h` → `C:\Program Files\NVIDIA GPU Computing Toolkit\CUDA\v12.1\include`
   - `lib/x64/cudnn*.lib` → `C:\Program Files\NVIDIA GPU Computing Toolkit\CUDA\v12.1\lib\x64`

### 3. Python環境のセットアップ

#### Ubuntu/Linux

```bash
# Python 3.10のインストール（推奨）
sudo apt-get update
sudo apt-get install -y python3.10 python3.10-venv python3-pip

# 仮想環境の作成
python3.10 -m venv whisperx-env
source whisperx-env/bin/activate

# pipのアップグレード
pip install --upgrade pip setuptools wheel
```

#### Windows

```powershell
# Python 3.10のインストール
# https://www.python.org/downloads/ からダウンロードしてインストール

# 仮想環境の作成
python -m venv whisperx-env
.\whisperx-env\Scripts\Activate.ps1

# pipのアップグレード
pip install --upgrade pip setuptools wheel
```

### 4. WhisperXのインストール

```bash
# PyTorchのインストール（CUDA 11.8の場合）
pip install torch torchvision torchaudio --index-url https://download.pytorch.org/whl/cu118

# WhisperXのインストール
pip install git+https://github.com/m-bain/whisperx.git

# 必要なモデルの事前ダウンロード（オプション）
python -c "import whisperx; whisperx.load_model('medium', device='cuda')"
```

### 5. pyannote.audioのインストール（話者分離用）

#### Hugging Face Access Tokenの取得

1. [Hugging Face](https://huggingface.co/) でアカウント作成
2. [Access Tokens](https://huggingface.co/settings/tokens) で新しいトークンを作成
3. 以下のモデルに同意が必要:
   - [pyannote/speaker-diarization-3.1](https://huggingface.co/pyannote/speaker-diarization-3.1)
   - [pyannote/segmentation-3.0](https://huggingface.co/pyannote/segmentation-3.0)

#### インストール

```bash
# pyannote.audioのインストール
pip install pyannote.audio

# Hugging Face CLIでログイン
pip install huggingface_hub
huggingface-cli login
# プロンプトでAccess Tokenを入力
```

### 6. FastAPIサーバーのセットアップ

#### サーバーコードの作成

```bash
# 作業ディレクトリの作成
mkdir -p ~/whisperx-server
cd ~/whisperx-server

# 必要なパッケージのインストール
pip install fastapi uvicorn python-multipart
```

`server.py`を作成:

```python
from fastapi import FastAPI, File, UploadFile, Form
from fastapi.responses import JSONResponse
import whisperx
import torch
import tempfile
import os
from typing import Optional

app = FastAPI()

# モデルのロード（起動時に一度だけ）
device = "cuda" if torch.cuda.is_available() else "cpu"
compute_type = "float16" if device == "cuda" else "float32"

model = None
diarize_model = None

@app.on_event("startup")
async def startup_event():
    global model, diarize_model
    print(f"Loading WhisperX model on {device}...")
    model = whisperx.load_model("medium", device, compute_type=compute_type, language="ja")
    print("WhisperX model loaded successfully")

    # 話者分離モデル（オプション）
    # diarize_model = whisperx.DiarizationPipeline(use_auth_token="YOUR_HF_TOKEN", device=device)

@app.get("/health")
async def health_check():
    """ヘルスチェックエンドポイント"""
    return {
        "status": "ok",
        "device": device,
        "model_loaded": model is not None
    }

@app.post("/transcribe")
async def transcribe_audio(
    audio: UploadFile = File(...),
    language: str = Form("ja"),
    enable_diarization: bool = Form(False)
):
    """音声ファイルを文字起こし"""
    try:
        # 一時ファイルに保存
        with tempfile.NamedTemporaryFile(delete=False, suffix=".wav") as temp_file:
            content = await audio.read()
            temp_file.write(content)
            temp_path = temp_file.name

        try:
            # 音声ロード
            audio_data = whisperx.load_audio(temp_path)

            # 文字起こし
            result = model.transcribe(audio_data, language=language)

            # アライメント（オプション）
            model_a, metadata = whisperx.load_align_model(
                language_code=language,
                device=device
            )
            result = whisperx.align(
                result["segments"],
                model_a,
                metadata,
                audio_data,
                device
            )

            # 話者分離（オプション）
            if enable_diarization and diarize_model:
                diarize_segments = diarize_model(temp_path)
                result = whisperx.assign_word_speakers(diarize_segments, result)

            return JSONResponse(content={
                "text": result.get("text", ""),
                "language": language,
                "segments": result.get("segments", [])
            })

        finally:
            # 一時ファイルの削除
            if os.path.exists(temp_path):
                os.unlink(temp_path)

    except Exception as e:
        return JSONResponse(
            status_code=500,
            content={"error": str(e)}
        )

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
```

#### サーバーの起動

```bash
# 開発モード（自動リロード有効）
python server.py

# 本番モード
uvicorn server:app --host 0.0.0.0 --port 8000 --workers 1
```

### 7. ファイアウォール設定

#### Ubuntu/Linux (ufw)

```bash
# ポート8000を開放
sudo ufw allow 8000/tcp
sudo ufw reload
sudo ufw status
```

#### Windows Firewall

```powershell
# PowerShellで実行（管理者権限）
New-NetFirewallRule -DisplayName "WhisperX Server" -Direction Inbound -Protocol TCP -LocalPort 8000 -Action Allow
```

### 8. 動作確認

```bash
# ヘルスチェック
curl http://localhost:8000/health

# 文字起こしテスト
curl -X POST "http://localhost:8000/transcribe" \
  -F "audio=@test.wav" \
  -F "language=ja" \
  -F "enable_diarization=false"
```

## systemdサービス化（Linux）

本番環境では、サーバーをsystemdサービスとして登録することを推奨します。

`/etc/systemd/system/whisperx.service`を作成:

```ini
[Unit]
Description=WhisperX Transcription Server
After=network.target

[Service]
Type=simple
User=your-username
WorkingDirectory=/home/your-username/whisperx-server
Environment="PATH=/home/your-username/whisperx-env/bin"
ExecStart=/home/your-username/whisperx-env/bin/uvicorn server:app --host 0.0.0.0 --port 8000 --workers 1
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
```

サービスの有効化:

```bash
sudo systemctl daemon-reload
sudo systemctl enable whisperx
sudo systemctl start whisperx
sudo systemctl status whisperx
```

## トラブルシューティング

### CUDA out of memory エラー

```bash
# 小さいモデルに変更
model = whisperx.load_model("small", device, compute_type=compute_type)

# バッチサイズを削減
result = model.transcribe(audio_data, batch_size=8)
```

### cuDNN not found エラー

```bash
# 環境変数の確認
echo $LD_LIBRARY_PATH

# cuDNNライブラリの存在確認
ls -l /usr/local/cuda/lib64/libcudnn*

# 環境変数の再設定
export LD_LIBRARY_PATH=/usr/local/cuda/lib64:$LD_LIBRARY_PATH
```

### モデルダウンロードが遅い

```bash
# Hugging Faceのミラーを使用
export HF_ENDPOINT=https://hf-mirror.com

# またはプロキシ設定
export HTTP_PROXY=http://proxy.example.com:8080
export HTTPS_PROXY=http://proxy.example.com:8080
```

### pyannote.audio の話者分離エラー

```bash
# Hugging Faceトークンの確認
huggingface-cli whoami

# 必要なモデルへのアクセス権限を確認
# https://huggingface.co/pyannote/speaker-diarization-3.1
# https://huggingface.co/pyannote/segmentation-3.0
```

## パフォーマンスチューニング

### GPU使用率の最適化

```python
# compute_typeの調整
compute_type = "int8"  # メモリ節約、精度低下
compute_type = "float16"  # バランス（推奨）
compute_type = "float32"  # 高精度、メモリ消費大

# バッチサイズの調整
result = model.transcribe(audio_data, batch_size=16)  # デフォルト: 16
```

### メモリ使用量の削減

```python
import gc
import torch

# 推論後にメモリをクリア
gc.collect()
torch.cuda.empty_cache()
```

## セキュリティ考慮事項

1. **認証の追加**: FastAPIのOAuth2やAPIキー認証を実装
2. **ファイルサイズ制限**: 大きすぎる音声ファイルを拒否
3. **レート制限**: 過度なリクエストを防ぐ
4. **HTTPS化**: nginxでリバースプロキシ + SSL証明書

## 関連リンク

- [WhisperX GitHub](https://github.com/m-bain/whisperx)
- [pyannote.audio](https://github.com/pyannote/pyannote-audio)
- [NVIDIA CUDA Toolkit](https://developer.nvidia.com/cuda-toolkit)
- [Hugging Face](https://huggingface.co/)
