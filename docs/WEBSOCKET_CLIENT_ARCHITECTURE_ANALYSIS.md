# WebSocket Client Implementation Architecture Analysis

## Executive Summary

The WebSocket client is a modular, event-driven TypeScript application that implements real-time audio transcription with voice activity detection. The architecture follows a layered pattern with clear separation of concerns: WebSocket communication, audio capture, voice detection, and display logic are each handled by dedicated services that communicate through event emitters.

---

## 1. Main Entry Point Analysis

**File:** `/Users/yamamoto/git/Wernicke/websocket-client/src/index.ts` (204 lines)

### Command-Line Argument Parsing Pattern

The entry point implements a manual argument parser that:

```typescript
function parseArgs(): Partial<TranscriptionClientConfig> {
  const args = process.argv.slice(2);
  const config: Partial<TranscriptionClientConfig> = {};

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    switch (arg) {
      case '--server-url' | '-s':
        config.websocket!.serverUrl = args[++i]!;
      // ... more cases
    }
  }
  return config;
}
```

**Current Supported Options:**
- `-s, --server-url <url>` - WebSocket server URL (default: ws://localhost:8000/transcribe)
- `-d, --audio-device <device>` - Audio device name (default: BlackHole 2ch)
- `-t, --vad-threshold <dB>` - VAD silence threshold in dB (default: -85)
- `--vad-silence-duration <seconds>` - Silence duration in seconds (default: 10)
- `--vad-force-voice-after <seconds>` - Force voice detection after N seconds (default: 300)
- `-h, --help` - Show help message

**Configuration Merging:** Arguments override environment variables, which override defaults:
```typescript
const config: TranscriptionClientConfig = {
  websocket: {
    serverUrl: cliConfig.websocket?.serverUrl || process.env['WS_SERVER_URL'] || 'ws://localhost:8000/transcribe',
    // ... other config
  },
};
```

### Client Initialization Flow

1. Parse command-line arguments
2. Merge with environment variables and defaults
3. Create `TranscriptionClient` instance
4. Attach event listeners:
   - `wsConnected` - WebSocket connected
   - `wsDisconnected` - WebSocket disconnected
   - `partialResult` - Partial transcription received
   - `finalResult` - Final transcription received
   - `error` - General errors
   - `permanentError` - Configuration/permanent errors

5. Setup graceful shutdown handlers (SIGINT, SIGTERM)
6. Call `client.start()` to begin transcription

---

## 2. WebSocket Message Handling

**File:** `/Users/yamamoto/git/Wernicke/websocket-client/src/services/WebSocketClient.ts` (372 lines)

### Message Types and Structures

**Type Definition File:** `/Users/yamamoto/git/Wernicke/websocket-client/src/types/websocket.ts`

#### Connection Established Message
```typescript
export interface ConnectionEstablishedMessage {
  type: 'connection_established';
  message: string;
  session_id: string;
}
```

#### Partial Result Message
```typescript
export interface PartialResultMessage {
  type: 'partial';
  buffer_id: string;              // Unique buffer identifier
  text: string;                   // Current partial text
  segments: TranscriptionSegment[];
  timestamp_range: TimestampRange; // {start, end} in seconds
  latency_ms: number;             // Round-trip latency
}
```

#### Final Result Message
```typescript
export interface FinalResultMessage {
  type: 'final';
  buffer_id: string;
  text: string;
  segments: TranscriptionSegment[];
  timestamp_range: TimestampRange;
  latency_ms: number;
}
```

#### Segment Structure
```typescript
export interface TranscriptionSegment {
  start: number;          // Start time in seconds
  end: number;           // End time in seconds
  text: string;
  speaker?: string;      // Speaker identifier (optional)
  corrected?: boolean;   // LLM correction flag
}
```

### Message Handling Flow

**Method:** `handleMessage(data: WS.Data): void` (Lines 314-363)

1. Parse incoming JSON message
2. Switch on message type:
   ```typescript
   switch (message.type) {
     case 'connection_established':
       this.emit('connectionEstablished', message);
     case 'partial':
       this.emit('partialResult', message);
     case 'final':
       this.emit('finalResult', message);
     case 'error':
       this.emit('serverError', message);
   }
   ```

### Event Emission Pattern

The WebSocketClient extends EventEmitter and emits these events:

| Event | Data Type | Trigger |
|-------|-----------|---------|
| `connected` | - | WebSocket open |
| `disconnected` | - | WebSocket close |
| `partialResult` | `PartialResultMessage` | 'partial' message received |
| `finalResult` | `FinalResultMessage` | 'final' message received |
| `serverError` | `ErrorMessage` | 'error' message received |
| `error` | `Error` | JSON parsing error or connection error |
| `permanentError` | `Error` | HTTP 4xx error (not retryable) |

---

## 3. Display/Output Logic

**File:** `/Users/yamamoto/git/Wernicke/websocket-client/src/services/TranscriptionDisplay.ts` (235 lines)

### Current Display Implementation

The display service handles:

#### Partial Result Display (Line 100-121)
```typescript
public displayPartialResult(result: PartialResultMessage): void {
  this.partialBuffers.set(result.buffer_id, result);
  
  const timestamp = this.formatTimestamp(new Date());
  const speaker = this.extractSpeaker(result.segments);
  const formattedLine = `[${timestamp}] ${speaker ? `[${speaker}] ` : ''}(partial) ${result.text}\n`;
  
  fs.appendFileSync(this.config.liveFile, formattedLine, 'utf-8');
  
  this.statistics.partialResultsDisplayed++;
  this.statistics.totalPartialLatencyMs += result.latency_ms;
}
```

**Format:** `[HH:MM] [Speaker X] (partial) text content`
**Output:** Appended to `live.txt` file

#### Final Result Display (Line 130-155)
```typescript
public displayFinalResult(result: FinalResultMessage): void {
  if (this.partialBuffers.has(result.buffer_id)) {
    this.replacePartialWithFinal(result);
  } else {
    // Append if no partial exists
    const formattedLine = `[${timestamp}] ${speaker ? `[${speaker}] ` : ''}${result.text}\n`;
    fs.appendFileSync(this.config.liveFile, formattedLine, 'utf-8');
  }
  
  this.recordToLogFile(result);
  // Update statistics
}
```

#### Partial Replacement Logic (Line 163-188)
- Reads entire `live.txt` file
- Finds line containing `(partial)` marker
- Replaces with final result text (removes `(partial)` marker)
- Writes back to file
- Removes from memory buffer

#### Log File Recording (Line 196-211)
- Stores final results in daily log files (`YYYY-MM-DD.log`)
- Format: `[HH:MM] [Speaker X] text content\n`
- File permissions: `0o600` (owner read/write only)

### Current Console Output

Currently, the application only logs results via the built-in Logger service. No direct console display of Partial/Final messages occurs - everything is written to files.

---

## 4. TypeScript Types and Interfaces

### Core Type Files

#### Message Types (websocket.ts)
```typescript
export enum ConnectionState {
  DISCONNECTED = 'DISCONNECTED',
  CONNECTING = 'CONNECTING',
  CONNECTED = 'CONNECTED',
}

export interface WebSocketConfig {
  serverUrl: string;
  maxReconnectAttempts?: number;
  reconnectBackoffBase?: number;    // milliseconds
  reconnectBackoffMax?: number;      // milliseconds
}

export interface WebSocketStatistics {
  bytesSent: number;
  reconnectCount: number;
  lastReconnectTime?: Date;
}
```

#### Audio Configuration Types

**AudioCaptureConfig:**
```typescript
export interface AudioCaptureConfig {
  deviceName: string;
  sampleRate: number;      // 16000 Hz
  channels: number;         // 1 (mono)
  format: string;          // 'f32le' (32-bit float)
}

export interface AudioStatistics {
  bytesCapture: number;
  uptime: number;
  restartCount: number;
  lastRestartTime?: Date;
}
```

**VADConfig:**
```typescript
export interface VADConfig {
  sampleRate: number;
  channels: number;
  silenceThreshold: number;    // dB (default: -85)
  silenceDuration: number;     // seconds (default: 10)
  forceVoiceAfter: number;     // seconds (default: 300)
}

export interface VADResult {
  isVoiceDetected: boolean;
  averageLevel: number;        // dB
  silenceDuration: number;     // seconds
}
```

---

## 5. Architecture Pattern

### Overall Design Pattern: Event-Driven with Layered Services

```
┌─────────────────────────────────────────┐
│         index.ts (Main Entry)           │
│  - Parse CLI arguments                  │
│  - Create TranscriptionClient           │
│  - Attach event listeners               │
└────────────┬────────────────────────────┘
             │
             └─────────────────────────────────────┐
                                                    │
    ┌───────────────────────────────────────────────▼────────┐
    │        TranscriptionClient (EventEmitter)             │
    │  - Orchestrates all components                        │
    │  - Bridges WebSocket, AudioCapture, VAD, Display      │
    │  - Emits high-level events (partialResult, etc)       │
    └────────────┬──────────┬──────────┬──────────────────────┘
                 │          │          │
    ┌────────────▼──┐ ┌─────▼──────┐ ┌─▼────────────────────┐
    │WebSocketClient│ │AudioCapture│ │VoiceActivityDetector│
    │  - Connection │ │  Service   │ │  - Analyzes audio   │
    │  - Send audio │ │  - FFmpeg  │ │  - Detects voice    │
    │  - Parse msgs │ │  - Streams │ │  - Reports stats    │
    └────────────┬──┘ └─────┬──────┘ └────────────────────┘
                 │          │
    ┌────────────▼──────────▼──────────────────────────┐
    │        TranscriptionDisplay                      │
    │  - Manages output/display                        │
    │  - Partial result buffering                      │
    │  - Final result file recording                   │
    │  - Live.txt and daily logs                       │
    └───────────────────────────────────────────────────┘
```

### Separation of Concerns

1. **WebSocketClient**: Pure network I/O and message parsing
   - No business logic
   - Only handles WebSocket protocol
   - Emits raw message events

2. **AudioCaptureService**: Audio acquisition via FFmpeg
   - Manages FFmpeg subprocess
   - Handles audio stream buffering
   - Auto-restart on crash (max 3 attempts)

3. **VoiceActivityDetector**: Audio analysis
   - Stateless analysis of audio buffers
   - Simple level-based detection (RMS in dB)
   - Tracks silence duration

4. **TranscriptionClient**: Orchestration
   - Bridges all components
   - Routes audio chunks through VAD before sending
   - Re-emits WebSocket events
   - Handles lifecycle (start/stop)

5. **TranscriptionDisplay**: Output handling
   - File I/O for transcriptions
   - Partial buffer management
   - Daily log rotation
   - Timestamp and speaker extraction

### Event Flow

1. **Startup:**
   ```
   TranscriptionClient.start()
     ├─ WebSocketClient.connect()
     └─ AudioCaptureService.start()
   ```

2. **Audio Processing:**
   ```
   AudioCaptureService (FFmpeg)
     └─ data event
        └─ TranscriptionClient.handleAudioChunk()
           ├─ VAD.analyze()
           └─ WebSocketClient.sendAudioChunk() (if voice detected)
   ```

3. **Result Processing:**
   ```
   WebSocketClient.handleMessage()
     ├─ partialResult event
     │  └─ TranscriptionClient (re-emits)
     │     └─ App (logs or displays)
     │
     └─ finalResult event
        └─ TranscriptionClient (re-emits)
           └─ TranscriptionDisplay.displayFinalResult()
              └─ File I/O
   ```

---

## 6. Command-Line Argument Handling

### Current Implementation Pattern

The manual argument parser in `index.ts` (lines 12-99):

```typescript
function parseArgs(): Partial<TranscriptionClientConfig> {
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    switch (arg) {
      case '--server-url':
      case '-s':
        // Manual validation
        if (i + 1 >= args.length) {
          console.error(`Error: ${arg} requires a value`);
          process.exit(1);
        }
        config.websocket!.serverUrl = args[++i]!;
        break;
      // ... repeat for each argument
    }
  }
  return config;
}
```

**Key Characteristics:**
- No external library (no yargs or commander)
- Simple switch/case pattern
- Manual argument validation
- Supports both long form (`--option`) and short form (`-o`)
- Uses index increment for value arguments: `args[++i]`

### Integration with Configuration

```typescript
const cliConfig = parseArgs();
const config: TranscriptionClientConfig = {
  websocket: {
    serverUrl: cliConfig.websocket?.serverUrl || process.env['WS_SERVER_URL'] || 'default',
    // Environment variable fallback
  },
};
```

---

## 7. Dependencies and Imports

### Production Dependencies

```json
{
  "axios": "^1.13.2",      // HTTP client (not currently used in client)
  "winston": "^3.18.3",    // Structured logging
  "ws": "^8.16.0"          // WebSocket client library
}
```

### Key Node.js Built-ins

- `events` - EventEmitter for all services
- `fs` - File I/O for transcription storage
- `path` - Path utilities
- `os` - OS utilities (home directory)
- `child_process` - FFmpeg subprocess management

### Import Patterns

**WebSocketClient:**
```typescript
import { EventEmitter } from 'events';
import WS from 'ws';
import { ConnectionState, TranscriptionMessage, ... } from '../types/websocket';
import { logger } from './Logger';
```

**AudioCaptureService:**
```typescript
import { spawn, ChildProcess } from 'child_process';
import { EventEmitter } from 'events';
import { BufferManager } from './BufferManager';
import { logger } from './Logger';
```

**TranscriptionDisplay:**
```typescript
import * as fs from 'fs';
import * as path from 'path';
import { PartialResultMessage, FinalResultMessage } from '../types/websocket';
import { logger } from './Logger';
```

---

## 8. Logger Service

**File:** `/Users/yamamoto/git/Wernicke/websocket-client/src/services/Logger.ts`

### Winston Configuration

```typescript
export function createLogger(config?: Partial<LoggerConfig>): winston.Logger {
  const transports: winston.transport[] = [];
  
  // Console transport with color and timestamp
  if (finalConfig.enableConsole) {
    transports.push(new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.timestamp({ format: 'HH:mm:ss' }),
        winston.format.printf(...)
      ),
    }));
  }
  
  // File transports (only outside test environment)
  // - Daily log: websocket-client/logs/client-YYYY-MM-DD.log
  // - Error log: websocket-client/logs/error.log
}
```

### Usage Pattern

```typescript
logger.info('Message', { key: 'value' });
logger.error('Error message', { error: error.message });
logger.warn('Warning', { details: ... });
```

---

## 9. How to Extend for Compact Display Mode

### Extension Points for Implementation

#### 1. **Add Display Mode Type**
Location: `src/types/websocket.ts`
```typescript
export enum DisplayMode {
  COMPACT = 'compact',
  VERBOSE = 'verbose',
}
```

#### 2. **Update CLI Argument Parser**
Location: `src/index.ts` (parseArgs function)
```typescript
case '--display':
  if (!config.display) config.display = {} as any;
  const mode = args[++i];
  if (!['compact', 'verbose'].includes(mode)) {
    console.error('Invalid display mode');
    process.exit(1);
  }
  config.display!.mode = mode;
  break;
```

#### 3. **Add Display Config to TranscriptionClientConfig**
Location: `src/services/TranscriptionClient.ts`
```typescript
export interface TranscriptionClientConfig {
  websocket: WebSocketConfig;
  audioCapture: AudioCaptureConfig;
  vad: VADConfig;
  display?: { mode: DisplayMode }; // NEW
}
```

#### 4. **Create CompactDisplay Service**
Location: `src/services/CompactDisplay.ts` (NEW)

**Key Design Points:**
- Extend EventEmitter (like WebSocketClient)
- Manage console output state (current partial line position)
- Use `\r` for in-place updates of partial results
- Clear line before Final result
- Implement speaker extraction (like TranscriptionDisplay)
- Track timestamp for Final results (unlike Partial which uses "[Now]")

**Methods to Implement:**
```typescript
public displayPartialResult(result: PartialResultMessage): void
public displayFinalResult(result: FinalResultMessage): void
private formatPartialLine(text: string, speaker?: string): string
private formatFinalLine(text: string, speaker?: string): string
private clearCurrentLine(): void
private writePartialInPlace(line: string): void
```

#### 5. **Update TranscriptionClient to Support Both Modes**
Location: `src/services/TranscriptionClient.ts`

```typescript
export class TranscriptionClient extends EventEmitter {
  private displayService: TranscriptionDisplay | CompactDisplay;
  
  constructor(config: TranscriptionClientConfig) {
    // Instantiate correct display service based on config.display?.mode
    if (config.display?.mode === DisplayMode.COMPACT) {
      this.displayService = new CompactDisplay();
    } else {
      this.displayService = new TranscriptionDisplay(config);
    }
    
    // Listen to WebSocket events and forward to display service
    this.wsClient.on('partialResult', (result) => {
      this.displayService.displayPartialResult(result);
    });
    
    this.wsClient.on('finalResult', (result) => {
      this.displayService.displayFinalResult(result);
    });
  }
}
```

#### 6. **Main Entry Point (index.ts)**
Add display mode to config merge:
```typescript
const config: TranscriptionClientConfig = {
  display: {
    mode: cliConfig.display?.mode || 'compact', // Default to compact
  },
  // ... rest of config
};
```

### Console Control Techniques

**For Partial Result Updates (In-Place):**
- Use `\r` to return to line start: `process.stdout.write('\r')`
- Clear rest of line with ANSI escape: `\x1b[K`
- Combined: `\r\x1b[K` + new content

**For Clearing on Final:**
- Move cursor up: `\x1b[1A` (ANSI escape)
- Clear line: `\x1b[2K`
- Or use simpler: `\n` to new line and omit the `\r` approach

**Full Line Format:**
```typescript
// Partial (rewritable):
console.log(`[Now][${speaker}] ${text}`); // Using process.stdout.write for carriage return

// Final (permanent):
console.log(`[${HH:MM:SS}][${speaker}] ${text}\n`);
```

---

## 10. Key Implementation Patterns to Follow

### 1. **EventEmitter Pattern**
All major services extend EventEmitter:
- WebSocketClient
- AudioCaptureService
- TranscriptionDisplay (or CompactDisplay)
- TranscriptionClient

### 2. **Configuration Pattern**
Config objects are:
- Immutable at service level (copied in constructor)
- Getter methods provide access: `getConfig()`
- Merged at multiple levels (CLI → env → defaults)

### 3. **Statistics Pattern**
Track metrics through Statistics interfaces:
- WebSocketStatistics (bytes sent, reconnect count)
- AudioStatistics (bytes captured, uptime)
- VADStatistics (voice/silence durations)

### 4. **Error Handling Pattern**
- Specific error types: `AudioCaptureError` (in `src/types/errors.ts`)
- Detailed error logging with troubleshooting guidance
- Emit 'error' and 'permanentError' events for critical issues

### 5. **Timestamp Extraction**
```typescript
private extractSpeaker(segments: Array<{ speaker?: string }>): string | null {
  return segments[0]?.speaker ?? null;
}
```

---

## 11. Testing Structure

**Test Files Present:**
- `WebSocketClient.test.ts` - 100+ tests for connection, reconnection, messaging
- `AudioCaptureService.test.ts` - FFmpeg subprocess mocking
- `VoiceActivityDetector.test.ts` - VAD algorithm tests
- `TranscriptionDisplay.test.ts` - File I/O tests with fs mocking
- `HealthCheckService.test.ts` - Health monitoring tests

**Testing Patterns:**
- Jest with ts-jest
- `jest.mock()` for fs, child_process
- Mock implementations for each test scenario
- Tests verify both happy path and error cases

**For CompactDisplay Tests:**
Would need to mock:
- `process.stdout.write()` or use a mock TTY
- Verify ANSI escape sequences
- Validate partial line clearing behavior

---

## 12. Summary: What to Implement for Compact Display

### New Files Required
1. `src/services/CompactDisplay.ts` - Main compact display logic
2. `src/services/CompactDisplay.test.ts` - Test suite

### Modified Files
1. `src/index.ts` - Add `--display` argument parsing
2. `src/types/websocket.ts` - Add `DisplayMode` enum
3. `src/services/TranscriptionClient.ts` - Accept display config, instantiate correct display service
4. `src/services/TranscriptionClient.test.ts` - Update constructor tests

### Key Behavioral Differences from Existing Display

| Feature | Current (TranscriptionDisplay) | Compact Display |
|---------|--------------------------------|-----------------|
| Output Target | Files (live.txt, logs) | Console (stdout) |
| Partial Display | Append to file | In-place update with `\r` |
| Partial Marker | "(partial)" text marker | None visible |
| Final Display | File replace operation | Console new line |
| Speaker Format | `[Speaker X]` | `[Speaker X]` (same) |
| Partial Timestamp | HH:MM of current time | "[Now]" literal |
| Final Timestamp | HH:MM of current time | HH:MM:SS of current time |
| History | Permanent (files) | Scrollback only |
| ANSI Support | Not used | `\r`, `\x1b[K`, etc. |

---

## References

**File Locations (Absolute Paths):**
- Main: `/Users/yamamoto/git/Wernicke/websocket-client/src/index.ts`
- WebSocket: `/Users/yamamoto/git/Wernicke/websocket-client/src/services/WebSocketClient.ts`
- Types: `/Users/yamamoto/git/Wernicke/websocket-client/src/types/websocket.ts`
- Display: `/Users/yamamoto/git/Wernicke/websocket-client/src/services/TranscriptionDisplay.ts`
- Audio: `/Users/yamamoto/git/Wernicke/websocket-client/src/services/AudioCaptureService.ts`
- VAD: `/Users/yamamoto/git/Wernicke/websocket-client/src/services/VoiceActivityDetector.ts`
- Client: `/Users/yamamoto/git/Wernicke/websocket-client/src/services/TranscriptionClient.ts`

**Package Details:**
- Node.js >=18.0.0
- TypeScript 5.3.3
- Jest for testing
- Winston for logging
- ws for WebSocket protocol

