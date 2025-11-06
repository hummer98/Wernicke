# デプロイメントガイド

## 概要

このドキュメントでは、Wernickeシステムの完全なセットアップ手順を説明します。Mac（クライアント）とWindows（サーバー）の両方の環境構築、依存関係のインストール、設定、起動までをカバーします。

## システム構成

```
Mac Client (M3 Pro, 16GB RAM)
    ↕ WebSocket (ws://172.25.77.5:8000/transcribe)
Windows Server (RTX 3090, 24GB VRAM)
```

## 前提条件

### Mac（クライアント）
- macOS 13.0以上
- Node.js 18.0以上
- 管理者権限（システム音声デバイス設定用）

### Windows（サーバー）
- Windows 10/11 (64-bit)
- NVIDIA RTX 3090（または同等のCUDA対応GPU）
- Python 3.10以上
- CUDA 11.8以上
- 管理者権限（GPU設定用）

## Windowsサーバーのセットアップ

### 1. NVIDIA CUDAドライバのインストール

```powershell
# NVIDIA公式サイトからドライバをダウンロード
# https://www.nvidia.com/Download/index.aspx

# インストール後、確認
nvidia-smi
```

**期待される出力**:
```
+-----------------------------------------------------------------------------+
| NVIDIA-SMI 535.xx.xx    Driver Version: 535.xx.xx    CUDA Version: 12.x   |
|-------------------------------+----------------------+----------------------+
| GPU  Name        TCC/WDDM | Bus-Id        Disp.A | Volatile Uncorr. ECC |
|===============================+======================+======================|
|   0  NVIDIA GeForce RTX 3090  | 00000000:01:00.0 Off |                  N/A |
```

### 2. CUDA Toolkitのインストール

```powershell
# CUDA 11.8をダウンロード・インストール
# https://developer.nvidia.com/cuda-11-8-0-download-archive

# cuDNN 8.6をダウンロード・インストール
# https://developer.nvidia.com/cudnn

# 環境変数を設定
setx CUDA_PATH "C:\Program Files\NVIDIA GPU Computing Toolkit\CUDA\v11.8"
setx PATH "%PATH%;%CUDA_PATH%\bin"
```

### 3. Pythonのインストール

```powershell
# Python 3.10をダウンロード・インストール
# https://www.python.org/downloads/

# バージョン確認
python --version
# Python 3.10.x

# pipのアップグレード
python -m pip install --upgrade pip
```

### 4. Python依存関係のインストール

```powershell
# プロジェクトディレクトリに移動
cd C:\path\to\Wernicke\continuous-audio-transcription\cuda-server

# 仮想環境作成
python -m venv venv

# 仮想環境をアクティベート
.\venv\Scripts\activate

# 依存関係をインストール
pip install -r requirements.txt
```

**requirements.txt**:
```
fastapi==0.104.1
uvicorn[standard]==0.24.0
websockets==12.0
python-multipart==0.0.6
torch==2.1.0+cu118
torchaudio==2.1.0+cu118
whisperx @ git+https://github.com/m-bain/whisperX.git
pyannote.audio==3.1.1
numpy==1.24.3
```

### 5. Hugging Face Tokenの取得

pyannote.audioを使用するには、Hugging Face tokenが必要です。

```powershell
# Hugging Faceアカウント作成
# https://huggingface.co/join

# アクセストークン生成
# https://huggingface.co/settings/tokens

# pyannoteモデルの利用規約に同意
# https://huggingface.co/pyannote/speaker-diarization-3.1
# https://huggingface.co/pyannote/segmentation-3.0
```

トークンを `server-config.json` に設定:

```json
{
  "models": {
    "hf_token": "hf_xxxxxxxxxxxxxxxxxxxxx"
  }
}
```

### 6. Ollamaのインストール

```powershell
# Ollamaをダウンロード・インストール
# https://ollama.ai/download

# Ollamaサービス起動
ollama serve

# Qwen2.5モデルをダウンロード
ollama pull qwen2.5:14b-instruct-q4_0
```

**モデルサイズ確認**:
```powershell
ollama list
# NAME                          ID              SIZE     MODIFIED
# qwen2.5:14b-instruct-q4_0    abc123def456    7.7 GB   2 minutes ago
```

### 7. サーバー設定

`continuous-audio-transcription/server-config.json` を編集:

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

### 8. ファイアウォール設定

```powershell
# ポート8000を開放
New-NetFirewallRule -DisplayName "Wernicke Server" -Direction Inbound -LocalPort 8000 -Protocol TCP -Action Allow
```

### 9. サーバー起動

```powershell
# 仮想環境をアクティベート
.\venv\Scripts\activate

# サーバー起動
python server.py

# または uvicornで起動
uvicorn server:app --host 0.0.0.0 --port 8000 --workers 1
```

**期待される出力**:
```
[Startup] Device: cuda
[Startup] Compute type: float16
[Startup] Loading WhisperX model: large-v3
[Startup] WhisperX model loaded successfully
[Startup] Loading diarization model...
[Startup] Diarization model loaded successfully
INFO:     Started server process [12345]
INFO:     Waiting for application startup.
INFO:     Application startup complete.
INFO:     Uvicorn running on http://0.0.0.0:8000 (Press CTRL+C to quit)
```

### 10. サーバー動作確認

別のターミナルで:

```powershell
# ヘルスチェック
curl http://localhost:8000/health
```

**期待される出力**:
```json
{
  "status": "ok",
  "device": "cuda",
  "compute_type": "float16",
  "model": "large-v3",
  "model_loaded": true,
  "diarization_available": true,
  "cuda_available": true,
  "cuda_version": "11.8"
}
```

## Macクライアントのセットアップ

### 1. Node.jsのインストール

```bash
# Homebrewをインストール（未インストールの場合）
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"

# Node.jsをインストール
brew install node

# バージョン確認
node --version
# v18.x.x or higher
```

### 2. FFmpegのインストール

```bash
# FFmpegをインストール
brew install ffmpeg

# バージョン確認
ffmpeg -version
```

### 3. BlackHoleのインストール

```bash
# BlackHole 2chをインストール
brew install blackhole-2ch

# または公式サイトからダウンロード
# https://existential.audio/blackhole/
```

**インストール後、システム再起動が必要な場合があります。**

### 4. LadioCastのセットアップ

LadioCastは、システム音声とマイク入力をBlackHoleにルーティングするために使用します。

```bash
# LadioCastをダウンロード・インストール
# https://apps.apple.com/jp/app/ladiocast/id411213048
```

**LadioCast設定**:
1. **入力1**: MacBook Proのマイク
   - Aux1にチェック
2. **出力メイン**: N/A（使用しない）
3. **出力Aux1**: BlackHole 2ch
4. **ボリュームスライダー**: 50-70%程度（音声レベルに応じて調整）

### 5. プロジェクトのクローンとセットアップ

```bash
# プロジェクトディレクトリに移動
cd ~/git/Wernicke/continuous-audio-transcription

# 依存関係をインストール
npm install

# TypeScriptビルド
npm run build
```

### 6. クライアント設定

`continuous-audio-transcription/config.json` を編集:

```json
{
  "audio": {
    "deviceName": "BlackHole 2ch",
    "sampleRate": 48000,
    "channels": 2,
    "format": "f32le"
  },
  "websocket": {
    "serverUrl": "ws://172.25.77.5:8000/transcribe",
    "reconnectAttempts": 5,
    "reconnectDelay": 1000
  },
  "vad": {
    "threshold": -85,
    "windowSize": 0.5
  },
  "display": {
    "outputPath": "~/transcriptions/live.txt",
    "minAge": 10
  },
  "log": {
    "level": "info",
    "enableConsole": true,
    "enableFile": true,
    "logDir": "~/transcriptions/logs"
  }
}
```

**重要**: `serverUrl` のIPアドレスをWindowsサーバーの実際のIPアドレスに変更してください。

### 7. ログディレクトリの作成

```bash
# ログディレクトリを作成
mkdir -p ~/transcriptions/logs
```

### 8. クライアント起動

```bash
# 開発モード
npm run dev

# または本番モード
npm start
```

**期待される出力**:
```
[2025-01-15 10:23:45] INFO  Starting Continuous Audio Transcription System...
[2025-01-15 10:23:45] INFO  Configuration loaded successfully
[2025-01-15 10:23:46] INFO  CUDA server is healthy: ws://172.25.77.5:8000/transcribe
[2025-01-15 10:23:47] INFO  Audio capture started successfully
[2025-01-15 10:23:47] INFO  Listening for audio input...
[2025-01-15 10:23:47] INFO  System is running. Press Ctrl+C to stop.
```

### 9. 表示の確認

別のターミナルで:

```bash
# live.txtをwatchで監視
watch -n 1 cat ~/transcriptions/live.txt
```

または:

```bash
# tailで継続監視
tail -f ~/transcriptions/logs/transcriptions.log
```

## トラブルシューティング

### Windowsサーバー

#### 1. CUDA out of memory

**症状**:
```
RuntimeError: CUDA out of memory. Tried to allocate X.XX GiB
```

**解決策**:
```json
// server-config.json
{
  "models": {
    "compute_type": "int8"  // float16からint8に変更
  }
}
```

または、軽量モデルを使用:
```json
{
  "models": {
    "whisper": "medium"  // large-v3からmediumに変更
  }
}
```

#### 2. pyannote.audio認証エラー

**症状**:
```
OSError: You are trying to access a gated repo...
```

**解決策**:
1. Hugging Faceアカウントでログイン
2. pyannoteモデルの利用規約に同意
3. アクセストークンを再生成
4. `server-config.json` のトークンを更新

#### 3. Ollamaモデルが見つからない

**症状**:
```
Error: model 'qwen2.5:14b-instruct-q4_0' not found
```

**解決策**:
```powershell
# モデルを再ダウンロード
ollama pull qwen2.5:14b-instruct-q4_0

# Ollamaサービス再起動
taskkill /F /IM ollama.exe
ollama serve
```

### Macクライアント

#### 1. 音声デバイスが見つからない

**症状**:
```
Error: Audio device 'BlackHole 2ch' not found
```

**解決策**:
```bash
# BlackHoleが正しくインストールされているか確認
system_profiler SPAudioDataType | grep BlackHole

# 再インストール
brew reinstall blackhole-2ch

# システム再起動
sudo reboot
```

#### 2. VADが音声を検出しない

**症状**:
ログに「Silence detected」が連続して表示される

**解決策**:
1. LadioCastのボリュームスライダーを上げる（70-80%）
2. しきい値を調整:

```json
// config.json
{
  "vad": {
    "threshold": -90  // -85から-90に下げる
  }
}
```

3. 音声レベルを確認:
```bash
# 音声レベルを解析
npm run analyze-audio
```

#### 3. WebSocket接続エラー

**症状**:
```
WebSocket error: connect ECONNREFUSED 172.25.77.5:8000
```

**解決策**:
1. WindowsサーバーのIPアドレスを確認:
```powershell
# Windowsで実行
ipconfig
```

2. `config.json` のIPアドレスを更新
3. Windowsファイアウォールでポート8000が開放されているか確認
4. サーバーが起動しているか確認

#### 4. 文字起こし結果が表示されない

**症状**:
音声は送信されているが、結果が返ってこない

**解決策**:
1. サーバーのログを確認:
```powershell
# Windowsサーバーのコンソール出力を確認
```

2. サーバーのヘルスチェック:
```bash
curl http://172.25.77.5:8000/health
```

3. タイムアウトを延長:
```json
// config.json
{
  "websocket": {
    "timeout": 600000  // 300秒から600秒に延長
  }
}
```

## バックグラウンド起動

### Windowsサーバー

**方法1: nssm（Non-Sucking Service Manager）を使用**

```powershell
# nssmをダウンロード・インストール
# https://nssm.cc/download

# サービス作成
nssm install WernickeServer "C:\path\to\venv\Scripts\python.exe" "C:\path\to\server.py"

# サービス開始
nssm start WernickeServer

# サービス停止
nssm stop WernickeServer
```

**方法2: タスクスケジューラ**

1. タスクスケジューラを開く
2. 「タスクの作成」をクリック
3. 「全般」タブ:
   - 名前: Wernicke Server
   - 「ユーザーがログオンしているかどうかにかかわらず実行する」をチェック
4. 「トリガー」タブ:
   - 新規 → システム起動時
5. 「操作」タブ:
   - プログラム: `C:\path\to\venv\Scripts\python.exe`
   - 引数: `C:\path\to\server.py`
6. 「OK」をクリック

### Macクライアント

**方法1: launchdを使用**

`~/Library/LaunchAgents/com.wernicke.client.plist` を作成:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.wernicke.client</string>
    <key>ProgramArguments</key>
    <array>
        <string>/usr/local/bin/node</string>
        <string>/Users/yamamoto/git/Wernicke/continuous-audio-transcription/dist/index.js</string>
    </array>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <true/>
    <key>StandardOutPath</key>
    <string>/Users/yamamoto/transcriptions/logs/stdout.log</string>
    <key>StandardErrorPath</key>
    <string>/Users/yamamoto/transcriptions/logs/stderr.log</string>
</dict>
</plist>
```

起動:
```bash
# サービス読み込み
launchctl load ~/Library/LaunchAgents/com.wernicke.client.plist

# サービス開始
launchctl start com.wernicke.client

# サービス停止
launchctl stop com.wernicke.client

# サービス削除
launchctl unload ~/Library/LaunchAgents/com.wernicke.client.plist
```

**方法2: nohupを使用**

```bash
# バックグラウンド起動
cd ~/git/Wernicke/continuous-audio-transcription
nohup npm start > /dev/null 2>&1 &

# プロセスID確認
ps aux | grep node

# 停止
kill <PID>
```

## パフォーマンスチューニング

### Windowsサーバー

#### GPUメモリ使用量の最適化

```python
# server.py
import torch

# メモリフラグメンテーション削減
torch.cuda.empty_cache()
gc.collect()

# メモリプール設定
torch.cuda.set_per_process_memory_fraction(0.9, 0)  # GPU 0の90%まで使用
```

#### バッチ処理の調整

```json
// server-config.json
{
  "llm": {
    "batch_size": 5  // 一度に処理するセグメント数
  }
}
```

### Macクライアント

#### VAD調整

```json
// config.json
{
  "vad": {
    "threshold": -85,      // しきい値（低いほど敏感）
    "windowSize": 0.5,     // 判定ウィンドウ（秒）
    "minVoiceDuration": 0.3  // 最小音声継続時間（秒）
  }
}
```

## 監視とメンテナンス

### ログローテーション

**Windows**:
```powershell
# ログファイルを定期的に圧縮・削除
# タスクスケジューラで毎週実行

$logPath = "C:\path\to\logs"
Get-ChildItem $logPath -Filter *.log |
  Where-Object { $_.LastWriteTime -lt (Get-Date).AddDays(-7) } |
  Remove-Item
```

**Mac**:
```bash
# crontabでログローテーション
crontab -e

# 毎週日曜日の午前3時に実行
0 3 * * 0 find ~/transcriptions/logs -name "*.log" -mtime +7 -delete
```

### パフォーマンスモニタリング

**Windows**:
```powershell
# GPU使用率確認
nvidia-smi -l 1

# メモリ使用量確認
nvidia-smi --query-gpu=memory.used,memory.total --format=csv -l 1
```

**Mac**:
```bash
# CPU使用率確認
top -pid $(pgrep -f "node.*wernicke")

# メモリ使用量確認
ps aux | grep node
```

## 次のステップ

1. **基本動作確認**: サーバーとクライアントが正常に通信できることを確認
2. **音声テスト**: 実際の音声でテストし、文字起こし精度を確認
3. **パフォーマンス調整**: VAD、LLMパラメータを環境に応じて調整
4. **長時間稼働テスト**: 24時間連続稼働でメモリリーク等がないか確認
5. **バックアップ設定**: ログと文字起こし結果の定期バックアップ

## 参考資料

- [01-overview.md](./01-overview.md) - システム概要
- [02-client-architecture.md](./02-client-architecture.md) - クライアント設計
- [03-server-architecture.md](./03-server-architecture.md) - サーバー設計
- [04-websocket-protocol.md](./04-websocket-protocol.md) - WebSocketプロトコル
- [05-llm-correction.md](./05-llm-correction.md) - LLM補正パイプライン
