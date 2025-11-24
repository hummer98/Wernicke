# Wernicke: リアルタイム音声文字起こしシステム - アーキテクチャ概要

## プロジェクト概要

Wernickeは、24時間連続稼働可能なリアルタイム音声文字起こしシステムです。Mac（クライアント）とWindows（CUDAサーバー）の2台構成で、高精度な日本語音声認識、話者分離、AI補正を実現します。

## 主要機能

### 1. リアルタイム文字起こし
- **レイテンシ**: 発話完了から10-15秒以内に補正済みテキストを表示
- **精度**: Whisper large-v3による高精度な日本語認識
- **連続稼働**: 24時間365日の安定動作

### 2. 話者分離（Speaker Diarization）
- **自動識別**: 会話中の複数話者を自動的に識別
- **ラベル付け**: Speaker_00, Speaker_01 として区別
- **セッション内一貫性**: 同一セッション内での話者ID維持

### 3. AI補正
- **同音異義語修正**: 文脈からの適切な漢字選択
- **文章整形**: 自然な日本語文章への補正
- **リアルタイム更新**: 表示テキストの動的書き換え

### 4. Human-Readable表示
- **CLI表示**: Macターミナルでのwatch表示
- **タイムスタンプ**: 発言時刻の記録
- **話者区別**: 話者ごとの発言表示

## システム要件

### クライアント（Mac）
- **OS**: macOS 13.0以上
- **CPU**: Apple Silicon (M1以降) 推奨
- **RAM**: 8GB以上（16GB推奨）
- **ソフトウェア**:
  - Node.js 18以上
  - FFmpeg
  - BlackHole（仮想オーディオデバイス）

### サーバー（Windows）
- **OS**: Windows 10/11
- **GPU**: NVIDIA RTX 3090 (24GB VRAM)
- **RAM**: 32GB以上
- **ソフトウェア**:
  - Python 3.10以上
  - CUDA 11.8以上
  - Ollama（LLM実行環境）

## アーキテクチャ原則

### 1. 完全ローカル実行
- すべての処理をローカル環境で完結
- 外部API依存なし（プライバシー保護、コスト削減）

### 2. WebSocketストリーミング
- 双方向リアルタイム通信
- 音声ストリームと結果受信を単一コネクションで実現

### 3. GPU最適化
- CUDA GPUでの並列処理
- Whisper、Diarization、LLMを同時実行

### 4. VADベース送信
- Voice Activity Detection による無音スキップ
- ネットワーク帯域の効率化

## システム構成図

```
┌─────────────────────────────────────────────────────────────┐
│ Mac Client (M3 Pro, 16GB RAM)                               │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  Audio Capture → VAD → WebSocket Send                      │
│                            ↓ ↑                              │
│                  WebSocket Receive                          │
│                            ↓                                │
│                    Display Buffer                           │
│                            ↓                                │
│              ~/transcriptions/live.txt                      │
│                                                             │
└─────────────────────────────────────────────────────────────┘
                            ↕ WebSocket
                     ws://172.25.77.5:8000
                            ↕
┌─────────────────────────────────────────────────────────────┐
│ Windows Server (RTX 3090, 24GB VRAM)                       │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  WebSocket Server → Audio Buffer → VAD Trigger             │
│                            ↓                                │
│  ┌──────────────────────────────────────────┐              │
│  │ GPU Pipeline (CUDA)                      │              │
│  │                                          │              │
│  │  Whisper large-v3     (3GB VRAM)        │              │
│  │        ↓                                 │              │
│  │  Wav2Vec2            (0.5GB VRAM)       │              │
│  │        ↓                                 │              │
│  │  pyannote.audio       (1GB VRAM)        │              │
│  │        ↓                                 │              │
│  │  Qwen2.5-14B        (6-8GB VRAM)        │              │
│  └──────────────────────────────────────────┘              │
│                            ↓                                │
│              WebSocket Send (補正済み結果)                  │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

## 処理フロー

1. **音声キャプチャ**: BlackHole経由でシステム音声/マイクをキャプチャ
2. **VAD検出**: 音声区間を検出、無音はスキップ
3. **ストリーム送信**: WebSocketで音声チャンクを連続送信
4. **サーバー受信**: 音声バッファに蓄積
5. **処理トリガー**: 無音2秒検出 or 最大30秒でGPUパイプライン実行
6. **文字起こし**: Whisper → Alignment → Diarization → LLM補正
7. **結果返却**: WebSocketで補正済みテキスト送信
8. **表示更新**: Macクライアントで~/transcriptions/live.txtに書き込み

## パフォーマンス目標

| 項目 | 目標値 | 実測値（予想） |
|------|--------|--------------|
| レイテンシ（発話→表示） | 15秒以内 | 11-16秒 |
| 音声認識精度 | 95%以上 | 97%+ (Whisper large-v3) |
| 話者分離精度 | 90%以上 | 92%+ (pyannote.audio) |
| システム稼働率 | 99.9% | - |
| GPU使用率 | 60%以下 | 50-55% |

## 次のドキュメント

- [02-client-architecture.md](./02-client-architecture.md) - Macクライアントの詳細設計
- [03-server-architecture.md](./03-server-architecture.md) - Windowsサーバーの詳細設計
- [04-websocket-protocol.md](./04-websocket-protocol.md) - WebSocket通信プロトコル
- [05-llm-correction.md](./05-llm-correction.md) - LLM補正パイプライン
- [06-deployment.md](./06-deployment.md) - デプロイメントガイド
