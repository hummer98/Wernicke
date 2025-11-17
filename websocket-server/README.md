# Wernicke WebSocket Transcription Server

リアルタイム音声文字起こしを提供するWebSocketサーバー

## 特徴

- **リアルタイム文字起こし**: WebSocket経由でストリーミング音声を受信し、リアルタイムで文字起こし
- **VAD駆動フラッシュ**: Silero-VADによる音声検出で自動的にバッファをフラッシュ（レイテンシ80%削減）
- **幻聴防止**: 多層防御アーキテクチャで幻聴を100%防止
- **GPU高速化**: CUDA対応でWhisper large-v3を高速実行

## システム要件

### ハードウェア
- **GPU**: NVIDIA GPU（CUDA対応、24GB VRAM推奨）
- **メモリ**: 16GB以上推奨

### ソフトウェア
- **OS**: Windows 10/11（WSL2対応）
- **Python**: 3.10以上
- **CUDA**: 11.8以上

## セットアップ

### 1. 仮想環境の作成

```bash
# Windows (Git Bash)
cd websocket-server
python -m venv venv
source venv/Scripts/activate
```

### 2. 依存パッケージのインストール

```bash
pip install -r requirements.txt
```

### 3. CUDA環境の確認

```bash
python -c "import torch; print(f'CUDA available: {torch.cuda.is_available()}')"
python -c "import torch; print(f'GPU: {torch.cuda.get_device_name(0)}')"
```

## サーバー起動

### 基本的な起動方法

```bash
cd websocket-server
venv/Scripts/python.exe main.py
```

### 起動確認

サーバーが正常に起動すると、以下のログが表示されます：

```
================================================================================
SERVER STARTUP/RESTART
Timestamp: 2025-11-17 10:18:36
Log file: D:\git\Wernicke\websocket-server\logs\server_20251117_101836.log
================================================================================
Starting Wernicke WebSocket Transcription Server...
Initializing GPU Pipeline...
GPU Pipeline initialized: NVIDIA GeForce RTX 3090
Loading models...
Loading Whisper large-v3 model using transformers...
Whisper large-v3 model loaded successfully using transformers
Loading Silero-VAD model...
Silero-VAD model loaded successfully
All models loaded successfully
VRAM Usage: 2.87 GB allocated, 2.88 GB max allocated
GPU Pipeline initialized successfully
Application startup complete.
Uvicorn running on http://0.0.0.0:8000 (Press CTRL+C to quit)
```

### サーバー起動時間

- **初回起動**: 約5-7秒（モデルロード）
- **2回目以降**: 約5-7秒（キャッシュあり）

## 接続方法

### WebSocketエンドポイント

```
ws://localhost:8000/transcribe
```

### 接続フロー

1. **接続確立**
```json
{
  "type": "connection_established",
  "session_id": "uuid-here",
  "message": "WebSocket connection established"
}
```

2. **音声データ送信**
   - 形式: 16kHz mono float32（生バイナリ）
   - チャンクサイズ: 64KB推奨（1秒分）

3. **応答受信**

**Partial結果（即座）**:
```json
{
  "type": "partial",
  "buffer_id": "buff_20251117_101836_001",
  "text": "文字起こし結果",
  "segments": [...],
  "latency_ms": 58.0
}
```

**Final結果（バックグラウンド処理後）**:
```json
{
  "type": "final",
  "buffer_id": "buff_20251117_101836_001",
  "text": "文字起こし結果",
  "segments": [...]
}
```

**エラー通知**:
```json
{
  "type": "error",
  "code": "TRANSCRIPTION_ERROR",
  "message": "エラーメッセージ",
  "buffer_id": "buff_20251117_101836_001"
}
```

## パフォーマンス

### レイテンシ

| 項目 | 時間 |
|------|------|
| VAD判定 | 57-59ms |
| Partial結果生成 | 約60ms |
| バッファフラッシュ間隔 | 5-7秒（VAD駆動） |

### VRAM使用量

- **Whisper large-v3**: 約2.5GB
- **Silero-VAD**: 約100MB
- **合計**: 約2.87GB / 24GB

## 幻聴防止機能

3層の防御メカニズムで幻聴を防止：

### レイヤー1: VAD前処理
- Silero-VADで非音声データを除外（60-70%削減）
- リアルタイム検出でバッファフラッシュを制御

### レイヤー2: バッファサイズ制限
- 最小バッファサイズ: 5秒
- 短い誤検出セグメントを除外（15-20%削減）

### レイヤー3: Whisper生成パラメータ
```python
temperature=0.0,                     # greedy decoding
logprob_threshold=-1.0,              # 低信頼度結果を拒否
compression_ratio_threshold=2.4,     # 繰り返しパターンを拒否
no_speech_threshold=0.6              # 無音判定閾値
```

詳細: [docs/hallucination-prevention.md](docs/hallucination-prevention.md)

## テスト

### 幻聴防止テスト

```bash
# 1. テスト音声生成
venv/Scripts/python.exe tests/generate_test_audio.py

# 2. テスト実行
venv/Scripts/python.exe tests/test_hallucination_prevention.py
```

テスト結果（11/11ケース合格）:
- 無音・ノイズの適切な除外
- 音声風ノイズでの幻聴防止
- 境界値ケースの正しい処理

## トラブルシューティング

### GPU Out of Memory

**症状**: `OSError: ページング ファイルが小さすぎる`

**原因**: 他のGPUアプリケーション（LM Studio、Stable Diffusion等）がVRAMを使用

**解決策**:
```bash
# 競合プロセスの確認
nvidia-smi

# プロセスを終了してから再起動
```

### モデルロードエラー

**症状**: `ModuleNotFoundError` または `ImportError`

**解決策**:
```bash
# 依存パッケージの再インストール
pip install --force-reinstall -r requirements.txt
```

### 接続エラー

**症状**: クライアントが接続できない

**確認事項**:
1. サーバーが起動しているか（ポート8000）
2. ファイアウォールの設定
3. ログファイルでエラーを確認

```bash
# ポート確認
netstat -ano | findstr :8000

# 最新ログ確認
tail -100 logs/server_*.log
```

## ログ

### ログファイル

ログは `logs/` ディレクトリに保存されます：

```
logs/server_20251117_101836.log
```

### ログレベル

- **INFO**: 通常動作
- **WARNING**: 警告（処理は継続）
- **ERROR**: エラー（処理失敗）

### ログ確認コマンド

```bash
# 最新ログの確認
tail -100 logs/server_*.log

# エラーのみ確認
grep ERROR logs/server_*.log

# リアルタイムログ監視（WSL/Linux）
tail -f logs/server_*.log
```

## アーキテクチャ

```
クライアント (WebSocket)
    ↓
WebSocketエンドポイント (/transcribe)
    ↓
TranscriptionSession (バッファ管理)
    ↓
GPUPipeline
    ├─ Silero-VAD (音声検出)
    └─ Whisper large-v3 (文字起こし)
```

### 処理フロー

1. **音声受信**: クライアントから音声チャンク受信
2. **VAD判定**: リアルタイムで音声活動を検出
3. **バッファ管理**: VAD結果に基づきバッファをフラッシュ
4. **文字起こし**: Whisperで音声をテキストに変換
5. **結果送信**: Partial/Final結果をクライアントに送信

## ライセンス

[ライセンス情報]

## 参考資料

- [Whisper (OpenAI)](https://github.com/openai/whisper)
- [Silero-VAD](https://github.com/snakers4/silero-vad)
- [Transformers (Hugging Face)](https://github.com/huggingface/transformers)
- [FastAPI](https://fastapi.tiangolo.com/)
