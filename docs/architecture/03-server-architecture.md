# Windowsサーバー - アーキテクチャ設計

## 概要

Windowsサーバーは、MacクライアントからWebSocket経由で受信した音声データを処理し、文字起こし・話者分離・LLM補正を行い、結果を返却する役割を担います。RTX 3090 GPUを活用し、高速な並列処理を実現します。

## システム要件

### ハードウェア
- **GPU**: NVIDIA RTX 3090 (24GB VRAM)
- **CPU**: Intel Core i7以上 / AMD Ryzen 7以上
- **RAM**: 32GB以上
- **ストレージ**: SSD 50GB以上の空き容量

### ソフトウェア
- **OS**: Windows 10/11 (64-bit)
- **Python**: 3.10以上
- **CUDA**: 11.8以上
- **cuDNN**: 8.6以上
- **Ollama**: LLM実行環境

## アーキテクチャ構成

```
┌─────────────────────────────────────────────────────────────┐
│ Windows Server (RTX 3090)                                   │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌──────────────────────────────────────────────────────┐  │
│  │ WebSocket Server Layer                               │  │
│  │                                                      │  │
│  │  FastAPI + uvicorn                                   │  │
│  │  - Endpoint: ws://0.0.0.0:8000/transcribe           │  │
│  │  - Max connections: 5                                │  │
│  │  - Timeout: 300s                                     │  │
│  └──────────────────────────────────────────────────────┘  │
│                         ↓                                   │
│  ┌──────────────────────────────────────────────────────┐  │
│  │ Audio Buffer Manager                                 │  │
│  │                                                      │  │
│  │  - Receive: Binary audio chunks                     │  │
│  │  - Buffer: Accumulate until trigger                 │  │
│  │  - Trigger: 無音2秒 or 最大30秒                     │  │
│  │  - VAD: Server-side silence detection               │  │
│  └──────────────────────────────────────────────────────┘  │
│                         ↓                                   │
│  ┌──────────────────────────────────────────────────────┐  │
│  │ GPU Processing Pipeline (CUDA)                       │  │
│  │                                                      │  │
│  │  ┌──────────────────────────────────────────────┐   │  │
│  │  │ 1. Whisper large-v3 (3GB VRAM)               │   │  │
│  │  │    - Speech to text                          │   │  │
│  │  │    - Language detection                      │   │  │
│  │  │    - Initial timestamps                      │   │  │
│  │  └──────────────────────────────────────────────┘   │  │
│  │                    ↓                                 │  │
│  │  ┌──────────────────────────────────────────────┐   │  │
│  │  │ 2. Wav2Vec2 Alignment (0.5GB VRAM)           │   │  │
│  │  │    - Phoneme-level alignment                 │   │  │
│  │  │    - Word-level timestamps                   │   │  │
│  │  └──────────────────────────────────────────────┘   │  │
│  │                    ↓                                 │  │
│  │  ┌──────────────────────────────────────────────┐   │  │
│  │  │ 3. pyannote.audio (1GB VRAM)                 │   │  │
│  │  │    - Speaker embedding                       │   │  │
│  │  │    - Segmentation                            │   │  │
│  │  │    - Clustering (Speaker_00, Speaker_01...)  │   │  │
│  │  └──────────────────────────────────────────────┘   │  │
│  │                    ↓                                 │  │
│  │  ┌──────────────────────────────────────────────┐   │  │
│  │  │ 4. Qwen2.5-14B-Instruct (6-8GB VRAM)         │   │  │
│  │  │    - Homophone correction                    │   │  │
│  │  │    - Context-aware rewriting                 │   │  │
│  │  │    - Natural sentence formatting             │   │  │
│  │  └──────────────────────────────────────────────┘   │  │
│  │                                                      │  │
│  │  Total VRAM: 10.5-12.5GB / 24GB                     │  │
│  └──────────────────────────────────────────────────────┘  │
│                         ↓                                   │
│  ┌──────────────────────────────────────────────────────┐  │
│  │ Result Formatter                                     │  │
│  │                                                      │  │
│  │  - Format: JSON                                     │  │
│  │  - Fields: segments, language, duration, etc.       │  │
│  │  - Metadata: processing_time, models_used           │  │
│  └──────────────────────────────────────────────────────┘  │
│                         ↓                                   │
│  ┌──────────────────────────────────────────────────────┐  │
│  │ WebSocket Response                                   │  │
│  │                                                      │  │
│  │  Send JSON to client                                │  │
│  └──────────────────────────────────────────────────────┘  │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

## コンポーネント設計

### 1. WebSocketServer

**責務**: WebSocket接続管理とセッション処理

**実装**:
```python
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
import asyncio

app = FastAPI(title="Wernicke Transcription Server")

# CORS設定
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # LAN内のみアクセス想定
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# アクティブな接続を管理
active_connections: set[WebSocket] = set()
MAX_CONNECTIONS = 5

@app.websocket("/transcribe")
async def websocket_endpoint(websocket: WebSocket):
    # 接続数制限
    if len(active_connections) >= MAX_CONNECTIONS:
        await websocket.close(code=1008, reason="Server overloaded")
        return

    await websocket.accept()
    active_connections.add(websocket)

    # セッション作成
    session = TranscriptionSession(websocket)

    try:
        async for data in websocket.iter_bytes():
            # 音声チャンク受信
            await session.process_audio_chunk(data)

    except WebSocketDisconnect:
        print(f"Client disconnected")

    except Exception as e:
        print(f"Error: {e}")
        await websocket.send_json({
            "error": True,
            "code": "INTERNAL_ERROR",
            "message": str(e)
        })

    finally:
        active_connections.remove(websocket)
        await session.cleanup()
```

**キー機能**:
- WebSocket接続受付
- 同時接続数制限
- セッション管理

### 2. TranscriptionSession

**責務**: セッションごとの音声バッファ管理と処理トリガー

**実装**:
```python
import numpy as np
import torch

class TranscriptionSession:
    def __init__(self, websocket: WebSocket):
        self.websocket = websocket
        self.audio_buffer = []
        self.buffer_duration = 0
        self.sample_rate = 48000
        self.silence_threshold = -85  # dB
        self.silence_duration = 0
        self.max_buffer_duration = 30  # seconds

    async def process_audio_chunk(self, chunk: bytes):
        # Float32Arrayに変換
        audio = np.frombuffer(chunk, dtype=np.float32)

        # バッファに追加
        self.audio_buffer.append(audio)
        chunk_duration = len(audio) / self.sample_rate
        self.buffer_duration += chunk_duration

        # 無音検出
        if self.is_silence(audio):
            self.silence_duration += chunk_duration
        else:
            self.silence_duration = 0

        # トリガー条件チェック
        if self.should_process():
            await self.process_buffer()

    def is_silence(self, audio: np.ndarray) -> bool:
        # RMS計算
        rms = np.sqrt(np.mean(audio ** 2))
        db = 20 * np.log10(rms + 1e-10)
        return db < self.silence_threshold

    def should_process(self) -> bool:
        # 無音2秒検出 or 最大30秒
        return (
            self.silence_duration >= 2.0 or
            self.buffer_duration >= self.max_buffer_duration
        )

    async def process_buffer(self):
        if len(self.audio_buffer) == 0:
            return

        # バッファを結合
        audio = np.concatenate(self.audio_buffer)

        # GPU処理パイプライン実行
        result = await self.run_pipeline(audio)

        # 結果送信
        await self.websocket.send_json(result)

        # バッファクリア
        self.audio_buffer.clear()
        self.buffer_duration = 0
        self.silence_duration = 0

        # メモリ解放
        gc.collect()
        torch.cuda.empty_cache()

    async def cleanup(self):
        self.audio_buffer.clear()
        gc.collect()
        torch.cuda.empty_cache()
```

**キー機能**:
- 音声バッファの蓄積
- 無音検出（RMSベース）
- トリガー条件判定（無音2秒 or 最大30秒）
- メモリ管理

### 3. GPUPipeline

**責務**: Whisper → Alignment → Diarization → LLM の並列実行

**実装**:
```python
import whisperx
from ollama import Client

class GPUPipeline:
    def __init__(self, config: dict):
        self.device = "cuda"
        self.compute_type = "float16"

        # Whisperモデル読み込み
        self.whisper_model = whisperx.load_model(
            "large-v3",
            self.device,
            compute_type=self.compute_type,
            language="ja"
        )

        # Alignmentモデル読み込み
        self.align_model, self.align_metadata = whisperx.load_align_model(
            language_code="ja",
            device=self.device
        )

        # Diarizationモデル読み込み
        hf_token = config.get("hf_token")
        self.diarize_model = whisperx.DiarizationPipeline(
            use_auth_token=hf_token,
            device=self.device
        )

        # Ollamaクライアント
        self.ollama = Client(host="http://localhost:11434")

    async def process(self, audio: np.ndarray) -> dict:
        start_time = time.time()

        # 1. Whisper文字起こし
        whisper_result = self.whisper_model.transcribe(
            audio,
            language="ja"
        )

        # 2. Alignment（タイムスタンプ精緻化）
        aligned_result = whisperx.align(
            whisper_result["segments"],
            self.align_model,
            self.align_metadata,
            audio,
            self.device
        )

        # 3. Diarization（話者分離）
        diarize_segments = self.diarize_model(audio)
        diarized_result = whisperx.assign_word_speakers(
            diarize_segments,
            aligned_result
        )

        # 4. LLM補正
        corrected_segments = await self.apply_llm_correction(
            diarized_result["segments"]
        )

        processing_time = time.time() - start_time

        return {
            "segments": corrected_segments,
            "language": "ja",
            "duration": len(audio) / 48000,
            "processing_time": processing_time,
            "models_used": {
                "whisper": "large-v3",
                "diarization": "pyannote-3.1",
                "llm": "qwen2.5-14b-q4_0"
            }
        }

    async def apply_llm_correction(self, segments: list) -> list:
        corrected = []

        for segment in segments:
            original_text = segment["text"]

            # LLM補正プロンプト
            prompt = f"""以下の音声認識結果を、自然な日本語に補正してください。
同音異義語の誤りを修正し、文脈に合った表現にしてください。

音声認識結果: {original_text}

補正後のテキストのみを出力してください。"""

            # Ollama APIコール
            response = self.ollama.generate(
                model="qwen2.5:14b-instruct-q4_0",
                prompt=prompt
            )

            corrected_text = response["response"].strip()

            # 補正されたかどうかをチェック
            is_corrected = (original_text != corrected_text)

            corrected.append({
                **segment,
                "text": corrected_text,
                "corrected": is_corrected,
                "original_text": original_text if is_corrected else None
            })

        return corrected
```

**キー機能**:
- Whisper large-v3による文字起こし
- Wav2Vec2によるアライメント
- pyannote.audioによる話者分離
- Qwen2.5-14BによるLLM補正
- VRAM効率的な処理

### 4. ErrorHandler

**責務**: エラーハンドリングとクライアントへの通知

**実装**:
```python
class ErrorHandler:
    @staticmethod
    async def handle_error(
        websocket: WebSocket,
        error: Exception,
        code: str
    ):
        error_message = {
            "error": True,
            "code": code,
            "message": str(error),
            "details": traceback.format_exc()
        }

        try:
            await websocket.send_json(error_message)
        except:
            print(f"Failed to send error to client: {error}")

    @staticmethod
    def get_error_code(error: Exception) -> str:
        if isinstance(error, torch.cuda.OutOfMemoryError):
            return "CUDA_OUT_OF_MEMORY"
        elif isinstance(error, TimeoutError):
            return "LLM_TIMEOUT"
        elif "whisper" in str(error).lower():
            return "TRANSCRIPTION_FAILED"
        else:
            return "INTERNAL_ERROR"
```

**エラーコード**:
- `INVALID_AUDIO_FORMAT`: 音声フォーマットが不正
- `TRANSCRIPTION_FAILED`: 文字起こし処理失敗
- `LLM_TIMEOUT`: LLM補正がタイムアウト
- `CUDA_OUT_OF_MEMORY`: GPU VRAMが不足
- `SERVER_OVERLOADED`: サーバー過負荷
- `INTERNAL_ERROR`: その他の内部エラー

## データフロー

### 処理フロー

```
WebSocket receive (binary audio chunk)
    ↓
TranscriptionSession.process_audio_chunk()
    ↓
Audio buffer accumulation
    ↓
Trigger condition check
    ↓
[Should process = true]
    ↓
GPUPipeline.process(audio)
    ↓
┌─────────────────────────────────────┐
│ GPU Processing (CUDA)               │
│                                     │
│ Whisper (3GB)                       │
│   ↓                                 │
│ Wav2Vec2 Alignment (0.5GB)          │
│   ↓                                 │
│ pyannote Diarization (1GB)          │
│   ↓                                 │
│ Qwen2.5 LLM Correction (6-8GB)      │
└─────────────────────────────────────┘
    ↓
Result formatting (JSON)
    ↓
WebSocket send (text message)
    ↓
Client receives transcription
```

## 設定ファイル

### server-config.json

```json
{
  "host": "0.0.0.0",
  "port": 8000,
  "max_connections": 5,
  "timeout": 300,
  "models": {
    "whisper": "large-v3",
    "language": "ja",
    "compute_type": "float16",
    "enable_diarization": true,
    "hf_token": "hf_xxxxxxxxxxxxxxxxxxxxx"
  },
  "llm": {
    "model": "qwen2.5:14b-instruct-q4_0",
    "host": "http://localhost:11434",
    "timeout": 60
  },
  "audio": {
    "sample_rate": 48000,
    "channels": 2,
    "silence_threshold": -85,
    "silence_duration_trigger": 2.0,
    "max_buffer_duration": 30.0
  }
}
```

## VRAM管理

### モデル読み込み順序

```python
# 起動時に一度だけ読み込み
def load_models():
    # 1. Whisper (3GB)
    whisper_model = whisperx.load_model("large-v3", "cuda")
    print(f"VRAM after Whisper: {torch.cuda.memory_allocated() / 1e9:.2f} GB")

    # 2. Alignment (0.5GB)
    align_model, metadata = whisperx.load_align_model("ja", "cuda")
    print(f"VRAM after Alignment: {torch.cuda.memory_allocated() / 1e9:.2f} GB")

    # 3. Diarization (1GB)
    diarize_model = whisperx.DiarizationPipeline(device="cuda")
    print(f"VRAM after Diarization: {torch.cuda.memory_allocated() / 1e9:.2f} GB")

    # 4. Ollama (Qwen2.5-14B q4_0: 6-8GB)
    # Ollamaは別プロセスで実行、VRAMは自動管理
    print(f"Total VRAM used: {torch.cuda.memory_allocated() / 1e9:.2f} GB")
```

### メモリ解放

```python
async def cleanup_memory():
    # Pythonガベージコレクション
    gc.collect()

    # CUDA キャッシュクリア
    torch.cuda.empty_cache()

    # VRAM使用状況確認
    allocated = torch.cuda.memory_allocated() / 1e9
    reserved = torch.cuda.memory_reserved() / 1e9
    print(f"VRAM: {allocated:.2f} GB allocated, {reserved:.2f} GB reserved")
```

## パフォーマンス最適化

### 1. バッチ処理

```python
# 複数セグメントをまとめてLLM補正
async def batch_llm_correction(segments: list, batch_size: int = 5):
    corrected = []

    for i in range(0, len(segments), batch_size):
        batch = segments[i:i+batch_size]
        texts = [seg["text"] for seg in batch]

        # バッチプロンプト
        prompt = f"""以下の{len(texts)}個の音声認識結果を補正してください。

{chr(10).join([f"{i+1}. {text}" for i, text in enumerate(texts)])}

補正後のテキストを番号付きで出力してください。"""

        # LLM呼び出し（1回で複数処理）
        response = await ollama.generate(prompt)
        # ... パース処理

    return corrected
```

### 2. モデルの事前ウォームアップ

```python
@app.on_event("startup")
async def warmup_models():
    # ダミー音声で各モデルをウォームアップ
    dummy_audio = np.zeros(48000, dtype=np.float32)  # 1秒

    # Whisper
    _ = whisper_model.transcribe(dummy_audio)

    # Diarization
    _ = diarize_model(dummy_audio)

    # LLM
    _ = ollama.generate("テスト")

    print("Models warmed up successfully")
```

### 3. 並列セッション処理

```python
# asyncioで複数セッションを並列処理
async def handle_multiple_sessions():
    sessions = []

    for websocket in active_connections:
        session = TranscriptionSession(websocket)
        sessions.append(session.run())

    # 並列実行
    await asyncio.gather(*sessions)
```

## 監視とログ

### メトリクス収集

```python
class ServerMetrics:
    def __init__(self):
        self.active_sessions = 0
        self.total_transcriptions = 0
        self.total_processing_time = 0
        self.errors = defaultdict(int)

    def record_transcription(self, processing_time: float):
        self.total_transcriptions += 1
        self.total_processing_time += processing_time

    def record_error(self, error_code: str):
        self.errors[error_code] += 1

    def get_stats(self) -> dict:
        avg_time = (
            self.total_processing_time / self.total_transcriptions
            if self.total_transcriptions > 0
            else 0
        )

        return {
            "active_sessions": self.active_sessions,
            "total_transcriptions": self.total_transcriptions,
            "average_processing_time": avg_time,
            "errors": dict(self.errors),
            "gpu_stats": self.get_gpu_stats()
        }

    def get_gpu_stats(self) -> dict:
        return {
            "vram_allocated": torch.cuda.memory_allocated() / 1e9,
            "vram_reserved": torch.cuda.memory_reserved() / 1e9,
            "vram_total": torch.cuda.get_device_properties(0).total_memory / 1e9,
            "gpu_utilization": self.get_gpu_utilization()
        }
```

### ステータスエンドポイント

```python
@app.get("/stats")
async def get_stats():
    return metrics.get_stats()

@app.get("/health")
async def health_check():
    return {
        "status": "ok",
        "active_connections": len(active_connections),
        "gpu_available": torch.cuda.is_available(),
        "vram_free": (
            torch.cuda.get_device_properties(0).total_memory -
            torch.cuda.memory_allocated()
        ) / 1e9
    }
```

## テスト

### ユニットテスト

```python
import pytest

@pytest.mark.asyncio
async def test_audio_buffer_trigger():
    session = TranscriptionSession(mock_websocket)

    # 30秒分の音声を追加
    for _ in range(30):
        await session.process_audio_chunk(
            np.random.randn(48000).astype(np.float32).tobytes()
        )

    # 最大バッファ時間でトリガー
    assert session.should_process()

@pytest.mark.asyncio
async def test_silence_detection():
    session = TranscriptionSession(mock_websocket)

    # 無音データ（2秒）
    silence = np.zeros(48000 * 2, dtype=np.float32)

    assert session.is_silence(silence)
```

### 統合テスト

```python
@pytest.mark.asyncio
async def test_websocket_transcription():
    async with websockets.connect("ws://localhost:8000/transcribe") as ws:
        # テスト音声送信
        audio = load_test_audio("test.wav")
        await ws.send(audio.tobytes())

        # 結果受信
        response = await ws.recv()
        result = json.loads(response)

        assert "segments" in result
        assert len(result["segments"]) > 0
        assert result["language"] == "ja"
```

## デプロイ

### 依存関係のインストール

```bash
# Python依存関係
pip install -r requirements.txt

# CUDA Toolkit
# https://developer.nvidia.com/cuda-downloads

# Ollama
# https://ollama.ai/download

# Qwen2.5モデルダウンロード
ollama pull qwen2.5:14b-instruct-q4_0
```

### 起動

```bash
# 開発モード
python server.py

# プロダクションモード（uvicorn）
uvicorn server:app --host 0.0.0.0 --port 8000 --workers 1

# バックグラウンド起動
nohup uvicorn server:app --host 0.0.0.0 --port 8000 > server.log 2>&1 &
```

## 次のドキュメント

- [05-llm-correction.md](./05-llm-correction.md) - LLM補正パイプライン詳細
- [06-deployment.md](./06-deployment.md) - デプロイメントガイド
