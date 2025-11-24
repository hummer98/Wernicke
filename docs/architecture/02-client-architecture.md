# Macクライアント - アーキテクチャ設計

## 概要

Macクライアントは、システム音声/マイク入力をキャプチャし、WebSocket経由でWindowsサーバーに送信、受信した文字起こし結果を表示する役割を担います。

## システム要件

### ハードウェア
- **CPU**: Apple Silicon (M1以降) 推奨
- **RAM**: 8GB以上（16GB推奨）
- **ストレージ**: 空き容量10GB以上

### ソフトウェア
- **OS**: macOS 13.0以上
- **Node.js**: 18.0以上
- **FFmpeg**: 音声フォーマット変換用
- **BlackHole**: 仮想オーディオデバイス（2ch版）

## アーキテクチャ構成

```
┌─────────────────────────────────────────────────────────────┐
│ Mac Client Application                                       │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌──────────────────────────────────────────────────────┐  │
│  │ Audio Input Layer                                    │  │
│  │                                                      │  │
│  │  BlackHole 2ch ──→ FFmpeg ──→ Audio Buffer         │  │
│  │                       │                              │  │
│  │                       ↓                              │  │
│  │                    Format:                           │  │
│  │                    - 48000 Hz                        │  │
│  │                    - 2 channels (stereo)             │  │
│  │                    - 32-bit float                    │  │
│  └──────────────────────────────────────────────────────┘  │
│                         ↓                                   │
│  ┌──────────────────────────────────────────────────────┐  │
│  │ VAD (Voice Activity Detection) Layer                │  │
│  │                                                      │  │
│  │  Silero VAD Model                                   │  │
│  │  - Threshold: -85dB (RMS)                           │  │
│  │  - Window: 0.5秒                                    │  │
│  │  - Decision: 音声検出 → Send / 無音 → Skip         │  │
│  └──────────────────────────────────────────────────────┘  │
│                         ↓                                   │
│  ┌──────────────────────────────────────────────────────┐  │
│  │ WebSocket Client Layer                               │  │
│  │                                                      │  │
│  │  ws://172.25.77.5:8000/transcribe                   │  │
│  │  - Send: Binary audio chunks                        │  │
│  │  - Receive: JSON transcription results              │  │
│  │  - Auto-reconnect: Exponential backoff              │  │
│  └──────────────────────────────────────────────────────┘  │
│                         ↓                                   │
│  ┌──────────────────────────────────────────────────────┐  │
│  │ Display Buffer Layer                                 │  │
│  │                                                      │  │
│  │  - Format: Human-readable text                      │  │
│  │  - Speaker labels: [Speaker_00], [Speaker_01]       │  │
│  │  - Timestamps: HH:MM format                         │  │
│  │  - File: ~/transcriptions/live.txt                  │  │
│  └──────────────────────────────────────────────────────┘  │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

## コンポーネント設計

### 1. AudioCaptureService

**責務**: 音声キャプチャとバッファ管理

**実装**:
```typescript
class AudioCaptureService {
  private ffmpegProcess: ChildProcess | null = null;
  private websocket: WebSocket | null = null;
  private vadDetector: VoiceActivityDetector;

  constructor(config: AudioConfig) {
    this.vadDetector = new VoiceActivityDetector({
      threshold: -85, // dB
      windowSize: 0.5, // seconds
    });
  }

  async start(): Promise<void> {
    // FFmpegプロセス起動
    this.ffmpegProcess = spawn('ffmpeg', [
      '-f', 'avfoundation',
      '-i', ':BlackHole 2ch',
      '-ar', '48000',
      '-ac', '2',
      '-f', 'f32le',
      '-',
    ]);

    // 音声データのストリーム処理
    this.ffmpegProcess.stdout.on('data', (chunk: Buffer) => {
      this.processAudioChunk(chunk);
    });
  }

  private processAudioChunk(chunk: Buffer): void {
    // VAD判定
    const isVoice = this.vadDetector.detect(chunk);

    if (isVoice) {
      // 音声検出 → WebSocket送信
      this.sendAudioChunk(chunk);
    } else {
      // 無音 → スキップ
      this.emit('silenceDetected');
    }
  }

  private sendAudioChunk(chunk: Buffer): void {
    if (this.websocket?.readyState === WebSocket.OPEN) {
      this.websocket.send(chunk);
    }
  }
}
```

**キー機能**:
- BlackHoleからの音声キャプチャ
- リアルタイムVAD判定
- 音声検出時のみWebSocket送信

### 2. WebSocketClient

**責務**: WebSocket接続管理と再接続ロジック

**実装**:
```typescript
class WebSocketClient extends EventEmitter {
  private ws: WebSocket | null = null;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectDelay = 1000; // ms

  connect(): void {
    this.ws = new WebSocket(this.url);

    this.ws.on('open', () => {
      console.log('WebSocket connected');
      this.reconnectAttempts = 0;
      this.emit('connected');
    });

    this.ws.on('message', (data: Buffer) => {
      // JSON文字起こし結果の受信
      const result = JSON.parse(data.toString());
      this.emit('transcription', result);
    });

    this.ws.on('error', (error: Error) => {
      console.error('WebSocket error:', error);
      this.emit('error', error);
    });

    this.ws.on('close', (code: number, reason: string) => {
      console.log(`WebSocket closed: ${code} - ${reason}`);
      this.reconnect();
    });
  }

  private reconnect(): void {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      this.emit('fatal_error', new Error('Max reconnect attempts reached'));
      return;
    }

    this.reconnectAttempts++;
    const delay = Math.min(
      this.reconnectDelay * Math.pow(2, this.reconnectAttempts),
      30000 // 最大30秒
    );

    console.log(`Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})`);

    setTimeout(() => this.connect(), delay);
  }

  send(data: Buffer): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(data);
    } else {
      console.warn('WebSocket not ready, data dropped');
    }
  }
}
```

**キー機能**:
- 自動再接続（指数バックオフ）
- エラーハンドリング
- 接続状態管理

### 3. VoiceActivityDetector

**責務**: 音声区間検出（VAD）

**実装**:
```typescript
class VoiceActivityDetector {
  private threshold: number; // dB
  private windowSize: number; // seconds
  private sampleRate: number;

  constructor(config: VADConfig) {
    this.threshold = config.threshold;
    this.windowSize = config.windowSize;
    this.sampleRate = config.sampleRate || 48000;
  }

  detect(audioChunk: Buffer): boolean {
    // Float32Arrayに変換
    const samples = new Float32Array(
      audioChunk.buffer,
      audioChunk.byteOffset,
      audioChunk.byteLength / 4
    );

    // RMS計算
    const rms = this.calculateRMS(samples);

    // dBに変換
    const db = 20 * Math.log10(rms);

    // しきい値判定
    return db > this.threshold;
  }

  private calculateRMS(samples: Float32Array): number {
    let sum = 0;
    for (let i = 0; i < samples.length; i++) {
      sum += samples[i] * samples[i];
    }
    return Math.sqrt(sum / samples.length);
  }
}
```

**キー機能**:
- RMSベースの音声検出
- dBしきい値判定
- 0.5秒ウィンドウでの判定

### 4. TranscriptionDisplay

**責務**: 文字起こし結果の表示管理

**実装**:
```typescript
class TranscriptionDisplay {
  private outputPath: string;
  private displayBuffer: TranscriptionSegment[] = [];

  constructor(config: DisplayConfig) {
    this.outputPath = config.outputPath ||
      path.join(os.homedir(), 'transcriptions', 'live.txt');
  }

  async updateDisplay(result: TranscriptionResult): Promise<void> {
    // 新しいセグメントを追加
    this.displayBuffer.push(...result.segments);

    // 10秒以上古いコンテンツのみ表示
    const now = Date.now() / 1000;
    const visibleSegments = this.displayBuffer.filter(
      (seg) => (now - seg.end) >= 10
    );

    // フォーマット変換
    const formattedText = this.formatSegments(visibleSegments);

    // ファイル書き込み
    await fs.promises.writeFile(this.outputPath, formattedText, 'utf-8');
  }

  private formatSegments(segments: TranscriptionSegment[]): string {
    const lines: string[] = [];
    let currentSpeaker = '';
    let currentLine = '';
    let currentTime = '';

    for (const segment of segments) {
      const speaker = segment.speaker || 'Speaker_00';
      const time = this.formatTime(segment.start);

      // 話者が変わった場合、改行
      if (currentSpeaker && currentSpeaker !== speaker) {
        lines.push(`${currentTime} [${currentSpeaker}] ${currentLine}`);
        currentLine = '';
      }

      currentSpeaker = speaker;
      currentTime = time;
      currentLine += segment.text;

      // LLM補正が適用された場合、マーク
      if (segment.corrected) {
        currentLine += ' ✓';
      }
    }

    // 最後の行を追加
    if (currentLine) {
      lines.push(`${currentTime} [${currentSpeaker}] ${currentLine}`);
    }

    return lines.join('\n');
  }

  private formatTime(seconds: number): string {
    const date = new Date(seconds * 1000);
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    return `${hours}:${minutes}`;
  }
}
```

**キー機能**:
- 10秒以上古いコンテンツの表示
- 話者ごとの改行
- タイムスタンプ付加
- LLM補正マーク

## データフロー

### 音声送信フロー

```
BlackHole 2ch
    ↓
FFmpeg (48kHz, stereo, f32le)
    ↓
AudioCaptureService.processAudioChunk()
    ↓
VoiceActivityDetector.detect()
    ↓
[isVoice = true]
    ↓
WebSocketClient.send(chunk)
    ↓
ws://172.25.77.5:8000/transcribe
```

### 結果受信フロー

```
WebSocket message event
    ↓
WebSocketClient.on('message')
    ↓
JSON.parse(data)
    ↓
TranscriptionDisplay.updateDisplay(result)
    ↓
Format segments (speaker labels, timestamps)
    ↓
Write to ~/transcriptions/live.txt
    ↓
ユーザーがwatchコマンドで監視
```

## 設定ファイル

### config.json

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

## エラーハンドリング

### WebSocket切断

```typescript
websocket.on('close', (code, reason) => {
  logger.warn(`WebSocket closed: ${code} - ${reason}`);

  // 自動再接続（指数バックオフ）
  this.reconnect();
});
```

### FFmpegプロセス異常終了

```typescript
ffmpegProcess.on('exit', (code, signal) => {
  if (code !== 0) {
    logger.error(`FFmpeg exited with code ${code}, signal ${signal}`);

    // 再起動
    setTimeout(() => this.start(), 5000);
  }
});
```

### VAD誤検出対策

```typescript
// 連続した音声検出が必要
const MIN_VOICE_DURATION = 0.3; // 秒

if (this.voiceDuration >= MIN_VOICE_DURATION) {
  this.sendAudioChunk(chunk);
} else {
  // 短い音声は無視（ノイズ除去）
  logger.debug('Voice detected but too short, skipped');
}
```

## パフォーマンス最適化

### 1. バッファサイズ調整

```typescript
// FFmpegの出力バッファサイズ
const BUFFER_SIZE = 4096; // bytes

// WebSocketの送信バッファサイズ
websocket.bufferedAmount < MAX_BUFFERED_AMOUNT
```

### 2. メモリ管理

```typescript
// 表示バッファのサイズ制限
const MAX_BUFFER_SIZE = 1000; // セグメント数

if (this.displayBuffer.length > MAX_BUFFER_SIZE) {
  // 古いセグメントを削除
  this.displayBuffer = this.displayBuffer.slice(-MAX_BUFFER_SIZE);
}
```

### 3. CPU使用率削減

```typescript
// VAD判定の間隔を調整
const VAD_CHECK_INTERVAL = 100; // ms

setInterval(() => {
  this.vadDetector.detect(this.audioBuffer);
}, VAD_CHECK_INTERVAL);
```

## 監視とログ

### ログ出力

```
[2025-01-15 10:23:45] INFO  Audio capture started
[2025-01-15 10:23:47] INFO  WebSocket connected
[2025-01-15 10:23:50] DEBUG Voice detected, sending chunk (4096 bytes)
[2025-01-15 10:23:52] INFO  Transcription received: 5 segments
[2025-01-15 10:23:53] DEBUG Display updated: ~/transcriptions/live.txt
```

### メトリクス

```typescript
class MetricsCollector {
  private metrics = {
    audioChunksSent: 0,
    audioChunksSkipped: 0,
    transcriptionsReceived: 0,
    websocketReconnects: 0,
  };

  increment(metric: string): void {
    this.metrics[metric]++;
  }

  report(): void {
    console.log('=== Metrics ===');
    console.log(`Audio chunks sent: ${this.metrics.audioChunksSent}`);
    console.log(`Audio chunks skipped: ${this.metrics.audioChunksSkipped}`);
    console.log(`Transcriptions received: ${this.metrics.transcriptionsReceived}`);
    console.log(`WebSocket reconnects: ${this.metrics.websocketReconnects}`);
  }
}
```

## テスト

### ユニットテスト

```typescript
describe('VoiceActivityDetector', () => {
  it('should detect voice above threshold', () => {
    const vad = new VoiceActivityDetector({ threshold: -85 });
    const audioChunk = generateAudioChunk(-70); // dB
    expect(vad.detect(audioChunk)).toBe(true);
  });

  it('should skip silence below threshold', () => {
    const vad = new VoiceActivityDetector({ threshold: -85 });
    const audioChunk = generateAudioChunk(-90); // dB
    expect(vad.detect(audioChunk)).toBe(false);
  });
});
```

### 統合テスト

```typescript
describe('WebSocket Integration', () => {
  it('should reconnect on connection loss', async () => {
    const client = new WebSocketClient({ url: 'ws://localhost:8000/transcribe' });
    client.connect();

    // サーバー停止をシミュレート
    server.close();

    // 再接続を確認
    await waitForEvent(client, 'connected');
    expect(client.isConnected()).toBe(true);
  });
});
```

## デプロイ

### 依存関係のインストール

```bash
# Node.js依存関係
npm install

# FFmpegインストール
brew install ffmpeg

# BlackHoleインストール
brew install blackhole-2ch
```

### 起動

```bash
# 開発モード
npm run dev

# プロダクションモード
npm start

# バックグラウンド起動
nohup npm start > /dev/null 2>&1 &
```

### 監視

```bash
# live.txtをwatchで監視
watch -n 1 cat ~/transcriptions/live.txt
```

## 次のドキュメント

- [03-server-architecture.md](./03-server-architecture.md) - Windowsサーバーの詳細設計
- [05-llm-correction.md](./05-llm-correction.md) - LLM補正パイプライン
