# WebSocket通信プロトコル仕様

## 概要

Wernickeシステムでは、MacクライアントとWindowsサーバー間の通信にWebSocketを採用しています。これにより、音声ストリームの送信と文字起こし結果の受信を単一の双方向コネクションで実現します。

## WebSocketエンドポイント

```
ws://[SERVER_IP]:8000/transcribe
```

**例**: `ws://172.25.77.5:8000/transcribe`

## 接続フロー

```
Client                                  Server
  |                                       |
  |--- WebSocket Handshake ----------->  |
  |                                       |
  |<-- 101 Switching Protocols --------- |
  |                                       |
  |=== WebSocket Connection Established ==|
  |                                       |
  |--- Audio Chunk (Binary) -----------> |
  |--- Audio Chunk (Binary) -----------> |
  |--- Audio Chunk (Binary) -----------> |
  |                                       |
  |                         [Processing]  |
  |                         - Whisper     |
  |                         - Alignment   |
  |                         - Diarization |
  |                         - LLM         |
  |                                       |
  |<-- Transcription Result (JSON) ------ |
  |                                       |
  |--- Audio Chunk (Binary) -----------> |
  |                                       |
```

## メッセージフォーマット

### 1. クライアント → サーバー（音声データ）

**タイプ**: バイナリメッセージ

**フォーマット**: 生の音声データ（Float32Array）

```typescript
// 音声チャンクの送信
const audioChunk: Buffer = ...; // FFmpegからの音声データ
websocket.send(audioChunk);
```

**音声フォーマット**:
- サンプリングレート: 48000 Hz
- チャンネル数: 2 (stereo)
- ビット深度: 32-bit float
- エンコーディング: Little-endian

**チャンクサイズ**: 可変（通常0.1秒〜1秒分）

### 2. サーバー → クライアント（文字起こし結果）

**タイプ**: テキストメッセージ（JSON）

**フォーマット**:

```json
{
  "segments": [
    {
      "start": 0.12,
      "end": 1.85,
      "text": "今日は機会について話します",
      "speaker": "Speaker_00",
      "corrected": true,
      "original_text": "今日はきかいについて話します"
    },
    {
      "start": 3.80,
      "end": 6.20,
      "text": "興味深いですね",
      "speaker": "Speaker_01",
      "corrected": false
    }
  ],
  "language": "ja",
  "duration": 6.2,
  "processing_time": 12.4,
  "models_used": {
    "whisper": "large-v3",
    "diarization": "pyannote-3.1",
    "llm": "qwen2.5-14b-q4_0"
  }
}
```

**フィールド説明**:

| フィールド | 型 | 説明 |
|----------|---|------|
| `segments` | Array | 文字起こしセグメントの配列 |
| `segments[].start` | Number | セグメント開始時刻（秒） |
| `segments[].end` | Number | セグメント終了時刻（秒） |
| `segments[].text` | String | 文字起こしテキスト（LLM補正済み） |
| `segments[].speaker` | String | 話者ID（例: Speaker_00） |
| `segments[].corrected` | Boolean | LLM補正が適用されたか |
| `segments[].original_text` | String | LLM補正前のテキスト（optiona） |
| `language` | String | 言語コード（ja, en等） |
| `duration` | Number | 音声の長さ（秒） |
| `processing_time` | Number | 処理時間（秒） |
| `models_used` | Object | 使用されたモデル情報 |

## エラーハンドリング

### サーバーエラー

サーバー側でエラーが発生した場合、以下のJSONを送信:

```json
{
  "error": true,
  "code": "TRANSCRIPTION_FAILED",
  "message": "Whisper model failed to transcribe audio",
  "details": "CUDA out of memory"
}
```

**エラーコード一覧**:

| コード | 説明 | 対処法 |
|--------|------|--------|
| `INVALID_AUDIO_FORMAT` | 音声フォーマットが不正 | 音声設定を確認 |
| `TRANSCRIPTION_FAILED` | 文字起こし処理失敗 | サーバーログを確認 |
| `LLM_TIMEOUT` | LLM補正がタイムアウト | LLMモデルを軽量化 |
| `CUDA_OUT_OF_MEMORY` | GPU VRAMが不足 | モデルサイズを削減 |
| `SERVER_OVERLOADED` | サーバー過負荷 | 同時接続数を制限 |

### 接続エラー

```typescript
websocket.on('error', (error) => {
  console.error('WebSocket error:', error);
  // 再接続ロジック
});

websocket.on('close', (code, reason) => {
  console.log(`WebSocket closed: ${code} - ${reason}`);
  // 再接続ロジック
});
```

**クローズコード**:

| コード | 説明 |
|--------|------|
| 1000 | 正常終了 |
| 1001 | サーバーシャットダウン |
| 1002 | プロトコルエラー |
| 1006 | 異常切断 |
| 1011 | サーバー内部エラー |

## VADベース送信制御

クライアント側でVAD（Voice Activity Detection）を実行し、音声検出時のみ送信:

```typescript
class AudioStreamController {
  private vad: VoiceActivityDetector;
  private websocket: WebSocket;

  onAudioChunk(chunk: Buffer) {
    // VAD判定
    const isVoice = this.vad.detect(chunk);

    if (isVoice) {
      // 音声検出 → 送信
      this.websocket.send(chunk);
    } else {
      // 無音 → スキップ（帯域節約）
      console.log('Silence detected, skipping chunk');
    }
  }
}
```

## パフォーマンス最適化

### 1. バッファリング

サーバー側で音声チャンクをバッファリングし、VADトリガーで一括処理:

```python
class TranscriptionSession:
    def __init__(self):
        self.audio_buffer = []
        self.buffer_duration = 0

    async def on_audio_chunk(self, chunk: bytes):
        self.audio_buffer.append(chunk)
        self.buffer_duration += len(chunk) / SAMPLE_RATE

        # トリガー条件
        if self.should_process():
            await self.process_buffer()

    def should_process(self) -> bool:
        # 無音2秒検出 or 最大30秒
        return (
            self.detect_silence(duration=2.0) or
            self.buffer_duration >= 30.0
        )
```

### 2. 並列処理

複数クライアント接続時、各セッションを並列処理:

```python
@app.websocket("/transcribe")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()

    # セッション作成（スレッドプールで並列実行）
    session = TranscriptionSession(websocket)

    try:
        async for data in websocket.iter_bytes():
            await session.process_audio_chunk(data)
    except WebSocketDisconnect:
        pass
```

### 3. メモリ管理

処理完了後、即座にメモリ解放:

```python
async def process_buffer(self):
    audio = np.concatenate(self.audio_buffer)

    # 処理
    result = await self.transcribe(audio)

    # 送信
    await self.websocket.send_json(result)

    # メモリ解放
    self.audio_buffer.clear()
    gc.collect()
    torch.cuda.empty_cache()
```

## 再接続ロジック

クライアント側で自動再接続を実装:

```typescript
class ReconnectingWebSocket extends EventEmitter {
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectDelay = 1000; // ms

  connect() {
    this.ws = new WebSocket(this.url);

    this.ws.on('close', () => {
      this.reconnect();
    });
  }

  reconnect() {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      this.emit('fatal_error', new Error('Max reconnect attempts'));
      return;
    }

    this.reconnectAttempts++;
    const delay = Math.min(
      this.reconnectDelay * Math.pow(2, this.reconnectAttempts),
      30000 // 最大30秒
    );

    setTimeout(() => this.connect(), delay);
  }
}
```

## セキュリティ

### CORS設定

```python
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # LAN内のみアクセス想定
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
```

### 認証（将来的に検討）

```typescript
// クライアント
const ws = new WebSocket('ws://server/transcribe', {
  headers: {
    'Authorization': 'Bearer <token>'
  }
});

// サーバー
@app.websocket("/transcribe")
async def websocket_endpoint(
    websocket: WebSocket,
    token: str = Header(None)
):
    if not verify_token(token):
        await websocket.close(code=1008)  # Policy violation
        return
```

## モニタリング

### 接続状態

```python
active_connections: set[WebSocket] = set()

@app.websocket("/transcribe")
async def websocket_endpoint(websocket: WebSocket):
    active_connections.add(websocket)
    try:
        # 処理
        pass
    finally:
        active_connections.remove(websocket)

@app.get("/stats")
async def get_stats():
    return {
        "active_connections": len(active_connections),
        "uptime": get_uptime(),
        "gpu_usage": get_gpu_stats()
    }
```

## テスト

### 手動テスト（wscat）

```bash
# インストール
npm install -g wscat

# 接続テスト
wscat -c ws://172.25.77.5:8000/transcribe

# バイナリ送信テスト
wscat -c ws://172.25.77.5:8000/transcribe -b
```

### 自動テスト

```typescript
describe('WebSocket Transcription', () => {
  it('should receive transcription result', (done) => {
    const ws = new WebSocket('ws://localhost:8000/transcribe');

    ws.on('open', () => {
      // テスト音声送信
      const testAudio = fs.readFileSync('test.wav');
      ws.send(testAudio);
    });

    ws.on('message', (data) => {
      const result = JSON.parse(data);
      expect(result.segments).toHaveLength(> 0);
      done();
    });
  });
});
```

## まとめ

WebSocketプロトコルにより、以下を実現:

1. **低レイテンシ**: HTTP RESTより高速な双方向通信
2. **ストリーミング**: 音声の連続送信と逐次結果受信
3. **効率的**: 単一コネクションで完結
4. **シンプル**: クライアント・サーバー実装が容易

次のドキュメント: [05-llm-correction.md](./05-llm-correction.md)
