# Requirements Document

## Project Description (Input)

wernicke-v2: WebSocketベースのリアルタイム音声文字起こしシステム。Mac（クライアント）とWindows（CUDAサーバー）の2台構成で、高精度な日本語音声認識、話者分離、LLM補正を実現。

## プロジェクト概要

Wernickeは、WebSocketベースのリアルタイム音声文字起こしシステムです。Mac（クライアント）とWindows（CUDAサーバー）の2台構成で、高精度な日本語音声認識、話者分離、LLM補正を実現します。

## 主要機能

### 1. WebSocketストリーミングアーキテクチャ
- Mac ClientからWindows ServerへWebSocket経由で音声ストリーム送信
- エンドポイント: ws://[SERVER_IP]:8000/transcribe
- バイナリ音声チャンク（Float32Array）の送信
- JSON形式の文字起こし結果受信

### 2. Mac Client (Node.js/TypeScript)
- **AudioCaptureService**: BlackHoleから音声キャプチャ（FFmpeg）
- **VoiceActivityDetector**: VADによる音声/無音判定（-85dB threshold）
- **WebSocketClient**: 自動再接続、エラーハンドリング
- **TranscriptionDisplay**: 人間が読みやすい形式で表示（~/transcriptions/live.txt）
- **設定**: 48kHz, stereo, 32-bit float

### 3. Windows Server (Python/FastAPI)
- **WebSocketServer**: FastAPI + uvicorn
- **TranscriptionSession**: 音声バッファ管理、VADトリガー（無音2秒 or 最大30秒）
- **GPUPipeline**:
  1. Whisper large-v3: 音声認識（3GB VRAM）
  2. Wav2Vec2: アライメント（0.5GB VRAM）
  3. pyannote.audio: 話者分離（1GB VRAM）
  4. Qwen2.5-14B-Instruct: LLM補正（6-8GB VRAM）
- **総VRAM使用量**: 10.5-12.5GB / 24GB (RTX 3090)

### 4. LLM補正パイプライン
- **同音異義語修正**: 文脈から適切な漢字選択（きかい→機械/機会）
- **フィラー削除**: 話し言葉のフィラー（えー、あの等）除去
- **自然な文章整形**: 句読点の適切な配置
- **プロンプトエンジニアリング**: Few-shot examples、System prompt最適化

### 5. 話者分離
- pyannote.audioによる自動話者識別
- Speaker_00, Speaker_01等のラベル付け
- セッション内一貫性維持

## システム要件

### Mac Client
- macOS 13.0以上
- Node.js 18以上
- FFmpeg
- BlackHole 2ch（仮想オーディオデバイス）
- RAM: 8GB以上推奨

### Windows Server
- Windows 10/11 (64-bit)
- NVIDIA RTX 3090 (24GB VRAM)
- Python 3.10以上
- CUDA 11.8以上
- Ollama（LLM実行環境）
- RAM: 32GB以上

## アーキテクチャ原則

1. **完全ローカル実行**: 外部API依存なし（プライバシー保護、コスト削減）
2. **WebSocketストリーミング**: 双方向リアルタイム通信
3. **GPU最適化**: CUDA GPUでの並列処理
4. **VADベース送信**: 無音スキップによるネットワーク帯域効率化

## パフォーマンス目標

- レイテンシ（発話→表示）: 15秒以内
- 音声認識精度: 95%以上
- 話者分離精度: 90%以上
- システム稼働率: 99.9%
- GPU使用率: 60%以下

## 参考ドキュメント

- docs/architecture/01-overview.md: システム概要
- docs/architecture/02-client-architecture.md: Macクライアント設計
- docs/architecture/03-server-architecture.md: Windowsサーバー設計
- docs/architecture/04-websocket-protocol.md: WebSocket通信プロトコル
- docs/architecture/05-llm-correction.md: LLM補正パイプライン
- docs/architecture/06-deployment.md: デプロイメントガイド
- docs/market-research.md: 市場調査（競合分析）

## 旧実装との違い

- **旧**: HTTP POSTベースのバッチ処理
- **新**: WebSocketベースのリアルタイムストリーミング
- **旧**: サーバー側バッファリングなし
- **新**: サーバー側でVADトリガーベースのバッファリング
- **新規追加**: LLM補正パイプライン（Qwen2.5-14B-Instruct）

## 実装優先順位

1. Windows Server WebSocketエンドポイント実装
2. Mac Client WebSocketクライアント実装
3. GPU処理パイプライン統合（Whisper + pyannote）
4. LLM補正パイプライン実装
5. 表示機能、監視、テスト

## Requirements

### 1. WebSocket通信

#### R1.1: リアルタイム双方向通信
**WHEN** Mac ClientがWindows Serverに接続する
**THEN** システムはWebSocket接続を確立する (ws://[SERVER_IP]:8000/transcribe)

**WHEN** 接続が確立される
**THEN** クライアントはバイナリ音声チャンク (Float32Array) を送信できる

**WHEN** サーバーが文字起こし結果を生成する
**THEN** JSON形式でクライアントに送信される

#### R1.2: 自動再接続
**WHEN** WebSocket接続が切断される
**THEN** クライアントは自動的に再接続を試行する

**WHEN** 再接続に失敗する
**THEN** エクスポネンシャルバックオフで再試行する (最大10回)

### 2. 音声キャプチャとVAD

#### R2.1: 音声キャプチャ
**WHEN** システムが起動する
**THEN** BlackHoleから音声をキャプチャする (48kHz, stereo, 32-bit float)

**WHEN** FFmpegで音声をキャプチャする
**THEN** Float32Array形式で出力される

#### R2.2: 音声活動検出 (VAD)
**WHEN** 音声レベルが-85dB以上である
**THEN** 音声区間として判定される

**WHEN** 音声区間が検出される
**THEN** サーバーに送信される

**WHEN** 無音が2秒以上続く OR 音声が30秒に達する
**THEN** サーバー側でバッファをフラッシュして処理を開始する

### 3. プログレッシブ表示システム

#### R3.1: 部分結果 (Partial) 表示
**WHEN** サーバーがWhisper音声認識のみ完了する
**THEN** 部分結果 (type: "partial") をクライアントに送信する

**WHEN** 部分結果の待機時間を測定する
**THEN** 2〜3秒以内に表示される

**WHEN** 部分結果を表示する
**THEN** グレー/イタリック体で暫定的に表示される

#### R3.2: 最終結果 (Final) 表示
**WHEN** サーバーが全パイプライン (Whisper → Alignment → Diarization → LLM) を完了する
**THEN** 最終結果 (type: "final") をクライアントに送信する

**WHEN** 最終結果の待機時間を測定する
**THEN** 10〜15秒以内に表示される

**WHEN** 最終結果が届く
**THEN** 対応する部分結果を完全に置き換える (buffer_idで識別)

#### R3.3: タイムスタンプ管理
**WHEN** サーバーが音声バッファを受信する
**THEN** バッファ開始時刻を記録する (buffer_start_time)

**WHEN** セグメントのタイムスタンプを生成する
**THEN** バッファ開始時刻からの相対時間として記録される (絶対時刻ではない)

**WHEN** クライアントが結果を受信する
**THEN** buffer_idを使って該当時間範囲を特定する

### 4. GPU処理パイプライン

#### R4.1: Whisper音声認識
**WHEN** サーバーがバッファをフラッシュする
**THEN** Whisper large-v3モデルで音声認識を実行する (VRAM: 3GB)

**WHEN** 音声認識が完了する
**THEN** 日本語テキストとタイムスタンプ付きセグメントを生成する

#### R4.2: アライメント
**WHEN** Whisper認識が完了する
**THEN** Wav2Vec2でセグメント単位のアライメントを実行する (VRAM: 0.5GB)

#### R4.3: 話者分離
**WHEN** アライメントが完了する
**THEN** pyannote.audioで話者分離を実行する (VRAM: 1GB)

**WHEN** 話者が識別される
**THEN** Speaker_00, Speaker_01等のラベルが付与される

**WHEN** セッション内で話者を追跡する
**THEN** 一貫したラベルが維持される

#### R4.4: LLM補正
**WHEN** 話者分離が完了する
**THEN** Qwen2.5-14B-Instructで文章補正を実行する (VRAM: 6-8GB)

**WHEN** LLMに文章を入力する
**THEN** 同音異義語を文脈から判断して修正する (例: きかい→機械/機会)

**WHEN** LLMに文章を入力する
**THEN** フィラー (えー、あの等) を削除する

**WHEN** LLMに文章を入力する
**THEN** 句読点を適切に配置する

### 5. WebSocketプロトコル

#### R5.1: 部分結果メッセージ
**WHEN** サーバーが部分結果を送信する
**THEN** 以下の形式のJSONメッセージを送信する:
```json
{
  "type": "partial",
  "buffer_id": "buff_12345",
  "timestamp_range": {"start": 0, "end": 30},
  "segments": [
    {
      "start": 0.12,
      "end": 1.85,
      "text": "きょうはきかいについて",
      "speaker": "Speaker_00"
    }
  ]
}
```

#### R5.2: 最終結果メッセージ
**WHEN** サーバーが最終結果を送信する
**THEN** 以下の形式のJSONメッセージを送信する:
```json
{
  "type": "final",
  "buffer_id": "buff_12345",
  "timestamp_range": {"start": 0, "end": 30},
  "segments": [
    {
      "start": 0.12,
      "end": 1.85,
      "text": "今日は機械について",
      "speaker": "Speaker_00",
      "corrected": true
    }
  ]
}
```

#### R5.3: エラーメッセージ
**WHEN** サーバーでエラーが発生する
**THEN** 以下の形式のエラーメッセージを送信する:
```json
{
  "type": "error",
  "code": "GPU_OOM",
  "message": "CUDA out of memory",
  "timestamp": "2025-11-05T12:34:56Z"
}
```

### 6. 表示とログ記録

#### R6.1: リアルタイム表示
**WHEN** 部分結果が届く
**THEN** ~/transcriptions/live.txt にグレー/イタリック体で追記される

**WHEN** 最終結果が届く
**THEN** 該当範囲を通常フォント/黒色で上書きする

#### R6.2: ログファイル記録
**WHEN** 最終結果が確定する
**THEN** ~/transcriptions/logs/YYYY-MM-DD.log にタイムスタンプと話者付きで記録される

**WHEN** ログに記録する
**THEN** 以下の形式で保存される:
```
12:34 [Speaker_00] 今日は機械について話します。
12:36 [Speaker_01] それは興味深いですね。
```

### 7. エラーハンドリング

#### R7.1: GPU OOM
**WHEN** GPUメモリ不足が発生する
**THEN** エラーメッセージをクライアントに送信する

**WHEN** GPU OOMが発生する
**THEN** バッファをクリアして次のバッファ処理を継続する

#### R7.2: 接続切断
**WHEN** クライアントが切断される
**THEN** サーバーはセッションをクリーンアップする

**WHEN** サーバーがクラッシュする
**THEN** クライアントは自動再接続を試行する

#### R7.3: モデル読み込みエラー
**WHEN** モデル読み込みに失敗する
**THEN** 起動時にエラーログを出力して終了する

### 8. パフォーマンス要件

#### R8.1: レイテンシ
**WHEN** 部分結果を生成する
**THEN** 発話終了から2〜3秒以内に表示される

**WHEN** 最終結果を生成する
**THEN** 発話終了から15秒以内に表示される

#### R8.2: 精度
**WHEN** 音声認識を実行する
**THEN** 95%以上の認識精度を達成する

**WHEN** 話者分離を実行する
**THEN** 90%以上の分離精度を達成する

#### R8.3: リソース使用量
**WHEN** 全GPUパイプラインを実行する
**THEN** VRAM使用量は10.5〜12.5GB以内に収まる (RTX 3090の24GB内)

**WHEN** GPU使用率を測定する
**THEN** 平均60%以下で動作する

#### R8.4: 稼働率
**WHEN** システムを24時間連続稼働させる
**THEN** 99.9%の稼働率を維持する

### 9. セキュリティとプライバシー

#### R9.1: ローカル実行
**WHEN** 音声データを処理する
**THEN** 全処理をローカルネットワーク内で完結する (外部API不使用)

**WHEN** データを送信する
**THEN** Mac ClientとWindows Server間のみで通信する

#### R9.2: データ保持
**WHEN** 音声バッファを処理する
**THEN** 処理完了後はメモリから削除される

**WHEN** ログファイルを保存する
**THEN** ローカルディスクの~/transcriptions/logs/以下にのみ保存される
