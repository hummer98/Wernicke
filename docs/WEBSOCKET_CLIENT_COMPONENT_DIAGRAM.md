# WebSocket Client - Component Architecture Diagram

## High-Level System Architecture

```
┌───────────────────────────────────────────────────────────────────────┐
│                          Application Layer                            │
│  ┌──────────────────────────────────────────────────────────────────┐ │
│  │  index.ts - Entry Point                                          │ │
│  │  ├─ Parse CLI arguments (--server-url, --audio-device, etc)     │ │
│  │  ├─ Merge with environment variables                            │ │
│  │  ├─ Create TranscriptionClient instance                         │ │
│  │  ├─ Attach event listeners (partial/final results)             │ │
│  │  └─ Handle process signals (SIGINT, SIGTERM)                   │ │
│  └──────────────────────────────────────────────────────────────────┘ │
└───────────────────────────────────────────────────────────────────────┘
                                  │
                                  ▼
┌───────────────────────────────────────────────────────────────────────┐
│                     Orchestration Layer                               │
│  ┌──────────────────────────────────────────────────────────────────┐ │
│  │  TranscriptionClient (extends EventEmitter)                      │ │
│  │                                                                  │ │
│  │  Responsibilities:                                              │ │
│  │  - Start/Stop lifecycle management                              │ │
│  │  - Bridge WebSocket, AudioCapture, VAD, and Display services   │ │
│  │  - Route audio chunks through VAD before sending                │ │
│  │  - Re-emit component events to application                      │ │
│  │  - Provide aggregated statistics                                │ │
│  │                                                                  │ │
│  │  Public Methods:                                                │ │
│  │  - start(): Promise<void>                                       │ │
│  │  - stop(): Promise<void>                                        │ │
│  │  - isRunning(): boolean                                         │ │
│  │  - getStatistics(): AggregatedStats                            │ │
│  └──────────────────────────────────────────────────────────────────┘ │
└───────────────────────────────────────────────────────────────────────┘
                    │              │              │              │
        ┌───────────┘              │              │              └────────┐
        │                          │              │                       │
        ▼                          ▼              ▼                       ▼
┌──────────────────┐  ┌──────────────────┐  ┌──────────────┐  ┌──────────────────┐
│ WebSocketClient  │  │AudioCapture      │  │VoiceActivity │  │Display Service   │
│                  │  │Service           │  │Detector      │  │                  │
│ (Network I/O)    │  │(Audio Source)    │  │(Analysis)    │  │(Output Handler)  │
│                  │  │                  │  │              │  │                  │
└──────────────────┘  └──────────────────┘  └──────────────┘  └──────────────────┘
```

## Service Components in Detail

### 1. WebSocketClient Service

```
WebSocketClient (extends EventEmitter)
│
├─ Configuration:
│  ├─ serverUrl: string
│  ├─ maxReconnectAttempts: number (default: 10)
│  ├─ reconnectBackoffBase: number (default: 1000ms)
│  └─ reconnectBackoffMax: number (default: 16000ms)
│
├─ Internal State:
│  ├─ ws: WS | null (WebSocket instance)
│  ├─ connectionState: ConnectionState (DISCONNECTED | CONNECTING | CONNECTED)
│  ├─ reconnectAttempts: number
│  ├─ permanentError: boolean (tracks HTTP 4xx errors)
│  └─ statistics: WebSocketStatistics
│
├─ Core Methods:
│  ├─ connect(): Promise<void>
│  │  └─ Establishes WebSocket connection
│  │     ├─ Detects permanent errors (4xx responses)
│  │     └─ Emits: 'connected', 'error', 'permanentError'
│  │
│  ├─ disconnect(): Promise<void>
│  │  └─ Cleanly closes connection and resets state
│  │
│  ├─ sendAudioChunk(chunk: Buffer): Promise<void>
│  │  └─ Sends audio data to server via WebSocket
│  │
│  ├─ handleMessage(data: WS.Data): void
│  │  └─ Parses incoming JSON and emits typed events
│  │     ├─ connection_established → emit 'connectionEstablished'
│  │     ├─ partial → emit 'partialResult'
│  │     ├─ final → emit 'finalResult'
│  │     ├─ error → emit 'serverError'
│  │     └─ [unknown] → emit 'error'
│  │
│  └─ scheduleReconnect(): void
│     └─ Exponential backoff retry with detailed error logging
│
└─ Events Emitted:
   ├─ 'connected': WebSocket open
   ├─ 'disconnected': WebSocket close
   ├─ 'partialResult': PartialResultMessage
   ├─ 'finalResult': FinalResultMessage
   ├─ 'error': Error
   └─ 'permanentError': Error (non-retryable)
```

### 2. AudioCaptureService

```
AudioCaptureService (extends EventEmitter)
│
├─ Configuration:
│  ├─ deviceName: string (default: 'BlackHole 2ch')
│  ├─ sampleRate: number (16000 Hz)
│  ├─ channels: number (1 - mono)
│  └─ format: string ('f32le' - 32-bit float)
│
├─ Internal State:
│  ├─ ffmpegProcess: ChildProcess | null
│  ├─ running: boolean
│  ├─ bufferManager: BufferManager
│  ├─ statistics: AudioStatistics
│  ├─ retryCount: number
│  └─ maxAutoRestarts: number (3)
│
├─ Core Methods:
│  ├─ start(): Promise<void>
│  │  └─ Spawns FFmpeg process for audio capture
│  │     └─ Retry logic: up to 3 attempts with 10s delay
│  │
│  ├─ stop(): Promise<void>
│  │  └─ Terminates FFmpeg process gracefully
│  │
│  ├─ startFFmpeg(): Promise<void>
│  │  └─ Creates FFmpeg subprocess:
│  │     $ ffmpeg -f avfoundation -i :BlackHole\ 2ch \
│  │       -ar 16000 -ac 1 -f f32le -
│  │     ├─ stdout: audio stream data
│  │     ├─ stderr: FFmpeg diagnostics
│  │     └─ Auto-restart on crash (max 3 times)
│  │
│  └─ autoRestart(): Promise<void>
│     └─ Handles FFmpeg crashes
│        ├─ Increments restart count
│        ├─ Max 3 restarts, then emits 'fatalError'
│        └─ Emits 'error' on auto-restart failure
│
└─ Events Emitted:
   ├─ 'data': Buffer (audio chunk)
   ├─ 'bufferFlushed': string (file path)
   ├─ 'bufferSkipped': void (silence-only buffer)
   ├─ 'error': Error
   └─ 'fatalError': AudioCaptureError (max restarts reached)
```

### 3. VoiceActivityDetector

```
VoiceActivityDetector
│
├─ Configuration:
│  ├─ sampleRate: number (16000 Hz)
│  ├─ channels: number (1 - mono)
│  ├─ silenceThreshold: number (dB, default: -85)
│  ├─ silenceDuration: number (seconds, default: 10)
│  └─ forceVoiceAfter: number (seconds, default: 300 = 5 min)
│
├─ Internal State:
│  ├─ currentSilenceDuration: number
│  └─ statistics: VADStatistics
│
├─ Core Methods:
│  ├─ analyze(buffer: Buffer): VADResult
│  │  ├─ Calculate RMS (Root Mean Square) level in dB
│  │  ├─ Compare against silenceThreshold
│  │  ├─ Track silence duration
│  │  ├─ Force voice detection after 5 minutes of silence
│  │  └─ Return: { isVoiceDetected, averageLevel, silenceDuration }
│  │
│  └─ calculateRMSLevel(buffer: Buffer): number
│     └─ Converts 16-bit PCM samples to RMS dB value
│
└─ Stateless Analysis:
   └─ No memory of previous buffers
      ├─ Each analysis is independent
      ├─ Only tracks cumulative silence duration
      └─ Reset on voice detection
```

### 4. TranscriptionDisplay Service (Current File-Based)

```
TranscriptionDisplay
│
├─ Configuration:
│  ├─ transcriptionDir: string
│  ├─ liveFile: string (path to live.txt)
│  └─ logDir: string (path to daily logs)
│
├─ Internal State:
│  ├─ partialBuffers: Map<string, PartialResultMessage>
│  └─ statistics: TranscriptionDisplayStatistics
│
├─ Core Methods:
│  ├─ displayPartialResult(result: PartialResultMessage): void
│  │  ├─ Store in partialBuffers map by buffer_id
│  │  ├─ Format: [HH:MM] [Speaker X] (partial) text
│  │  ├─ Append to live.txt (fs.appendFileSync)
│  │  └─ Track: count, total latency
│  │
│  ├─ displayFinalResult(result: FinalResultMessage): void
│  │  ├─ If partial exists:
│  │  │  └─ Read live.txt, find "(partial)" line, replace it
│  │  └─ Otherwise: Append to live.txt
│  │  ├─ Record to daily log file (YYYY-MM-DD.log)
│  │  └─ Track: count, total latency
│  │
│  ├─ replacePartialWithFinal(result): void
│  │  ├─ Read entire file
│  │  ├─ Find line with "(partial)" marker
│  │  ├─ Replace with final text (remove marker)
│  │  ├─ Write back to file
│  │  └─ Remove from memory
│  │
│  ├─ recordToLogFile(result): void
│  │  ├─ Create/append to YYYY-MM-DD.log
│  │  ├─ Format: [HH:MM] [Speaker X] text
│  │  └─ Set file permissions: 0o600
│  │
│  ├─ extractSpeaker(segments): string | null
│  │  └─ Return segments[0]?.speaker or null
│  │
│  └─ formatTimestamp(date: Date): string
│     └─ Return "HH:MM" format
│
└─ Output: Files Only
   ├─ live.txt: Current transcription
   ├─ logs/YYYY-MM-DD.log: Permanent history
   └─ No console output
```

### 5. CompactDisplay Service (Proposed for Compact Mode)

```
CompactDisplay (extends EventEmitter)
│
├─ Internal State:
│  ├─ currentPartialLine: string | null
│  ├─ lastPartialBufferId: string | null
│  └─ statistics: CompactDisplayStatistics
│
├─ Core Methods:
│  ├─ displayPartialResult(result: PartialResultMessage): void
│  │  ├─ Extract speaker from segments[0]?.speaker
│  │  ├─ Format: [Now][Speaker X] text (or [Now] if no speaker)
│  │  ├─ Write to console with carriage return:
│  │  │  process.stdout.write('\r\x1b[K' + line)
│  │  │  └─ \r = carriage return (move to line start)
│  │  │  └─ \x1b[K = clear to end of line (ANSI escape)
│  │  └─ Track: partial display count
│  │
│  ├─ displayFinalResult(result: FinalResultMessage): void
│  │  ├─ Write newline to clear partial line
│  │  ├─ Extract speaker from segments[0]?.speaker
│  │  ├─ Format: [HH:MM:SS][Speaker X] text
│  │  ├─ Output with: console.log(line)
│  │  ├─ Write new "[Now]" prompt
│  │  └─ Track: final display count
│  │
│  ├─ extractSpeaker(segments): string | null
│  │  └─ Return segments[0]?.speaker or null
│  │
│  ├─ formatTimestamp(date: Date): string
│  │  └─ Return "HH:MM:SS" format
│  │
│  ├─ formatPartialLine(text: string, speaker?: string): string
│  │  └─ Return "[Now][Speaker X] text" or "[Now] text"
│  │
│  └─ formatFinalLine(text: string, speaker?: string): string
│     └─ Return "[HH:MM:SS][Speaker X] text" or "[HH:MM:SS] text"
│
└─ Output: Console (stdout) Only
   ├─ Partial: In-place updates with \r
   ├─ Final: New permanent line with timestamp
   └─ Terminal scrollback shows history
```

## Message Flow Architecture

### Full Message Processing Pipeline

```
Audio Source (FFmpeg)
    │
    ├─ Captures 16kHz mono audio
    └─ Emits 'data' event with audio chunks
        │
        ▼
AudioCaptureService
    │
    └─ Forwards chunk to TranscriptionClient
        │
        ▼
TranscriptionClient.handleAudioChunk()
    │
    ├─ Run VAD.analyze(chunk)
    │  │
    │  └─ Returns: { isVoiceDetected, averageLevel, silenceDuration }
    │
    └─ IF isVoiceDetected:
       │
       ├─ Send to WebSocket server:
       │  │
       │  └─ WebSocketClient.sendAudioChunk(chunk)
       │
       └─ Emit 'voiceDetected' event to app
           │
           └─ Logger captures statistics

┌─────────────────────────────────────────────────────────────────┐
│                  WebSocket Server Processing                    │
│  (Speech-to-Text, Speaker Diarization, LLM Correction)        │
└─────────────────────────────────────────────────────────────────┘
    │
    ├─ Generates partial transcription
    │  │
    │  └─ Sends: PartialResultMessage
    │
    ├─ Refines to final transcription
    │  │
    │  └─ Sends: FinalResultMessage
    │
    └─ Sends: ErrorMessage (if error)

WebSocketClient.handleMessage()
    │
    ├─ Parse JSON
    │
    └─ Switch on message.type:
       │
       ├─ 'partial':
       │  │
       │  └─ emit 'partialResult' → TranscriptionClient
       │
       ├─ 'final':
       │  │
       │  └─ emit 'finalResult' → TranscriptionClient
       │
       └─ 'error':
          │
          └─ emit 'serverError' → TranscriptionClient

TranscriptionClient
    │
    ├─ On 'partialResult':
    │  │
    │  ├─ Re-emit to application
    │  │
    │  └─ Forward to Display Service:
    │     │
    │     └─ CompactDisplay.displayPartialResult()
    │        │
    │        └─ Output: [Now][Speaker X] text (with \r updates)
    │
    └─ On 'finalResult':
       │
       ├─ Re-emit to application
       │
       └─ Forward to Display Service:
          │
          └─ CompactDisplay.displayFinalResult()
             │
             └─ Output: [HH:MM:SS][Speaker X] text (new line)
```

## Data Structures

### PartialResultMessage
```typescript
{
  type: 'partial',                    // Message type identifier
  buffer_id: 'buff_20250116_120000_001', // Unique identifier
  text: 'こんにちは、元気',           // Incremental transcription
  segments: [
    {
      start: 0.0,                     // Start timestamp (seconds)
      end: 2.5,                       // End timestamp (seconds)
      text: 'こんにちは、元気',
      speaker: 'Speaker 1',           // Speaker identifier (optional)
      corrected: false                // LLM correction flag
    }
  ],
  timestamp_range: {
    start: 0.0,
    end: 2.5
  },
  latency_ms: 1250                    // Round-trip latency
}
```

### FinalResultMessage
```typescript
{
  type: 'final',
  buffer_id: 'buff_20250116_120000_001',
  text: 'こんにちは、元気ですか',      // Complete transcription
  segments: [
    {
      start: 0.0,
      end: 3.2,
      text: 'こんにちは、元気ですか',
      speaker: 'Speaker 1',
      corrected: true                 // LLM-corrected version
    }
  ],
  timestamp_range: {
    start: 0.0,
    end: 3.2
  },
  latency_ms: 2100
}
```

## Configuration Cascade

```
CLI Arguments           Environment Variables    Default Values
     │                       │                        │
     ├─ --server-url        WS_SERVER_URL           localhost:8000
     ├─ --audio-device      AUDIO_DEVICE            BlackHole 2ch
     ├─ --vad-threshold     VAD_SILENCE_THRESHOLD   -85 dB
     ├─ --display           DISPLAY_MODE            compact
     └─ (more options)      (more env vars)         (more defaults)
     │                       │                        │
     └───────────┬───────────┴────────────────────────┘
                 │
                 ▼
    TranscriptionClientConfig {
      websocket: { serverUrl, maxReconnectAttempts, ... },
      audioCapture: { deviceName, sampleRate, channels, format },
      vad: { sampleRate, silenceThreshold, silenceDuration, ... },
      display: { mode: 'compact' | 'verbose' }
    }
```

---

## Summary: Key Design Principles

1. **Separation of Concerns**: Each service has single responsibility
2. **Event-Driven**: Services communicate via EventEmitter pattern
3. **Configuration-First**: All behavior controlled by configuration objects
4. **Layered Architecture**: Clear boundaries between components
5. **Error Resilience**: Graceful error handling with detailed logging
6. **Extensibility**: Easy to add new display modes or services
7. **Type Safety**: Full TypeScript with strict interfaces
8. **Testability**: Mock-friendly design with dependency injection

