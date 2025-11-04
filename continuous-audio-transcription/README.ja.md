# Continuous Audio Transcription

**日本語** | [English](README.md)

24時間連続音声文字起こしシステム - BlackHole + WhisperX + 話者分離

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.3-blue.svg)](https://www.typescriptlang.org/)
[![Node.js](https://img.shields.io/badge/Node.js-18%2B-green.svg)](https://nodejs.org/)
[![Test Coverage](https://img.shields.io/badge/coverage-75.43%25-brightgreen.svg)](https://github.com/your-repo/continuous-audio-transcription)

## 概要

BlackHole経由で取得したZoom/Discord等の音声をWhisperXでリアルタイム文字起こしする常時稼働システムです。LadioCastで音声ルーティングを行い、自分の声も相手の声も両方記録できます。

### 主要機能

- **24時間連続稼働**: メモリ効率を最優先し、長期間の安定稼働を実現
- **自動エラー復帰**: 音声入力の途切れやクラッシュから自動復帰
- **話者分離**: pyannote.audioによる話者識別（オプション）
- **柔軟なファイル管理**: 30秒単位の生データ、1時間・日次の集約データ
- **自動ローテーション**: 保持期間に応じた自動削除とgzip圧縮
- **リソース監視**: CPU/メモリ/ディスクの監視とアラート
- **CLIインターフェース**: シンプルなコマンドでサービス管理

## システム要件

### クライアント（文字起こし実行側）

- **OS**: macOS 10.15以降 / Linux（Ubuntu 20.04以降推奨）
- **Node.js**: 18.0.0以降
- **FFmpeg**: 4.4以降（音声キャプチャ）
- **BlackHole**: 2ch（macOS仮想オーディオデバイス）
- **PM2**: プロセス管理
- **空きディスク容量**: 10GB以上推奨

### サーバー（WhisperX実行側）

- **OS**: Linux（Ubuntu 20.04以降推奨）/ Windows 10/11
- **Python**: 3.9以降
- **CUDA**: 11.8以降（NVIDIA GPU必須）
- **cuDNN**: 8.6以降
- **VRAM**: 4GB以上（medium モデル使用時）

詳細は [CUDA Server Setup Guide](docs/cuda-server-setup.md) を参照してください。

## インストール

### 1. 前提条件のインストール

#### macOS

```bash
# Homebrewでインストール
brew install node ffmpeg

# BlackHoleのインストール（仮想オーディオデバイス）
brew install blackhole-2ch

# PM2のグローバルインストール
npm install -g pm2
```

#### Linux

```bash
# Node.jsのインストール
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# FFmpegのインストール
sudo apt-get install -y ffmpeg

# PM2のグローバルインストール
sudo npm install -g pm2
```

### 2. プロジェクトのセットアップ

```bash
# リポジトリのクローン
git clone <repository-url>
cd continuous-audio-transcription

# 依存関係のインストール
npm install

# ビルド
npm run build
```

### 3. 設定ファイルの作成

`config.json`をプロジェクトルートに作成:

```json
{
  "audio": {
    "deviceName": "BlackHole 2ch",
    "sampleRate": 16000,
    "channels": 1,
    "chunkDurationSeconds": 30
  },
  "transcription": {
    "serverUrl": "http://localhost:8000",
    "language": "ja",
    "enableDiarization": false,
    "timeout": 300000,
    "retryAttempts": 3,
    "retryDelay": 5000
  },
  "storage": {
    "baseDir": "~/transcriptions",
    "rawRetentionDays": 7,
    "hourlyRetentionDays": 30,
    "compressionAfterDays": 3
  },
  "monitoring": {
    "cpuThresholdPercent": 80,
    "memoryThresholdMB": 2048,
    "diskThresholdGB": 5,
    "errorThresholdPerHour": 10,
    "webhookUrl": ""
  },
  "logging": {
    "level": "info"
  }
}
```

### 4. CUDAサーバーのセットアップ

WhisperXを実行するCUDAサーバーを別途セットアップする必要があります。

詳細は [CUDA Server Setup Guide](docs/cuda-server-setup.md) を参照してください。

## 使用方法

### サービスの起動

```bash
# バックグラウンドでサービスを起動
transcribe start
```

出力例:
```
Transcription service started successfully
PID: 12345
Status: online
```

### ステータスの確認

```bash
# ステータスを表示
transcribe status

# JSON形式で出力
transcribe status --json
```

出力例:
```
=== Transcription Service Status ===
Status: online
PID: 12345
Uptime: 2h 15m
Restarts: 0
CPU: 12.3%
Memory: 156.42 MB

=== Health Metrics ===
Last Check: 2025-01-27T10:30:00.000Z
CPU Usage: 12.3%
Memory Usage: 156.42 MB
Disk Free: 45.67 GB
```

### ログの表示

```bash
# 直近100行のログを表示
transcribe logs

# 直近50行のログを表示
transcribe logs --lines 50

# リアルタイムでログを表示（tail -f風）
transcribe logs --follow

# エラーログのみ表示
transcribe logs --level error
```

### サービスの停止

```bash
# サービスを停止
transcribe stop
```

## ファイル構成

```
~/transcriptions/
├── 2025-01-27/
│   ├── raw/                    # 生の文字起こし（30秒ごと）
│   │   ├── 12-00-00.jsonl
│   │   ├── 12-00-30.jsonl
│   │   └── ...
│   ├── hourly/                 # 1時間ごとの集約
│   │   ├── 12.txt
│   │   ├── 13.txt
│   │   └── ...
│   └── daily.txt               # 日次サマリー
├── 2025-01-28/
│   └── ...
└── logs/                       # PM2ログ
    ├── error.log
    ├── out.log
    └── combined.log
```

### ファイル形式

#### JSONL形式（raw/*.jsonl）

```jsonl
{"timestamp":"2025-01-27T12:00:00.000Z","text":"こんにちは","language":"ja","segments":[{"start":0.0,"end":1.5,"text":"こんにちは"}],"audioFile":"/path/to/audio.wav"}
```

#### テキスト形式（hourly/*.txt, daily.txt）

```
[2025-01-27 12:00:00] こんにちは
[2025-01-27 12:00:30] お元気ですか
```

## トラブルシューティング

### サービスが起動しない

1. **CUDAサーバーが起動しているか確認**
   ```bash
   curl http://localhost:8000/health
   ```

2. **PM2プロセスの確認**
   ```bash
   pm2 list
   pm2 logs continuous-transcription
   ```

3. **設定ファイルの確認**
   - `config.json`が正しい形式か確認
   - オーディオデバイス名が正しいか確認

### 音声がキャプチャされない

1. **BlackHoleデバイスの確認**
   ```bash
   ffmpeg -f avfoundation -list_devices true -i ""
   ```

2. **LadioCastの設定確認**
   - Input: マイク + システムオーディオ
   - Output: BlackHole 2ch + スピーカー

### メモリ使用量が増加し続ける

1. **プロセスの再起動**
   ```bash
   transcribe stop
   transcribe start
   ```

2. **設定の見直し**
   - `chunkDurationSeconds`を短くする（デフォルト30秒）
   - `rawRetentionDays`を短くする（デフォルト7日）

### 文字起こし精度が低い

1. **音声品質の確認**
   - サンプリングレート: 16000Hz推奨
   - ノイズが多い場合は音声フィルター追加を検討

2. **WhisperXモデルの変更**
   - CUDAサーバー側でlargeモデルに変更（VRAM 8GB以上必要）

## 開発

### テスト実行

```bash
# 全テスト実行
npm test

# テストをwatch mode で実行
npm run test:watch

# カバレッジレポート生成
npm run test:coverage
```

### コード品質

```bash
# Lint実行
npm run lint

# Lint自動修正
npm run lint:fix

# フォーマット確認
npm run format:check

# フォーマット自動修正
npm run format
```

## ライセンス

MIT

## 関連ドキュメント

- [CUDA Server Setup Guide](docs/cuda-server-setup.md) - WhisperX CUDAサーバーのセットアップ手順
- [Requirements](../.kiro/specs/continuous-audio-transcription/requirements.md) - システム要件詳細
- [Design Document](../.kiro/specs/continuous-audio-transcription/design.md) - システム設計詳細
