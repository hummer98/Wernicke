# Compact Display Mode - Quick Reference for Implementation

## Message Flow Diagram

```
WebSocket Server
       |
       v
WebSocketClient.handleMessage()
       |
       ├─> Partial: emit 'partialResult'
       |        |
       |        v
       |   TranscriptionClient.setupEventHandlers()
       |        |
       |        v
       |   CompactDisplay.displayPartialResult()
       |        |
       |        +─> Extract speaker from segments[0]?.speaker
       |        +─> Format: [Now][Speaker X] text
       |        +─> process.stdout.write('\r\x1b[K' + line)
       |
       └─> Final: emit 'finalResult'
                |
                v
           TranscriptionClient.setupEventHandlers()
                |
                v
           CompactDisplay.displayFinalResult()
                |
                +─> Extract speaker from segments[0]?.speaker
                +─> Clear current partial line
                +─> Format: [HH:MM:SS][Speaker X] text
                +─> console.log(line) + emit new [Now] prompt
```

## Key Code Locations

### Current Implementation
- **Main Entry:** `/Users/yamamoto/git/Wernicke/websocket-client/src/index.ts` (lines 1-204)
- **Message Types:** `/Users/yamamoto/git/Wernicke/websocket-client/src/types/websocket.ts` (lines 1-130)
- **WebSocket Handler:** `/Users/yamamoto/git/Wernicke/websocket-client/src/services/WebSocketClient.ts` (lines 314-363)
- **Existing Display:** `/Users/yamamoto/git/Wernicke/websocket-client/src/services/TranscriptionDisplay.ts` (lines 100-121, 130-155)
- **Client Orchestrator:** `/Users/yamamoto/git/Wernicke/websocket-client/src/services/TranscriptionClient.ts` (lines 58-99)

### Event Chain Example

```typescript
// Line 333 in WebSocketClient.ts
case 'partial':
  logger.info('Partial result received', { bufferId: message.buffer_id });
  this.emit('partialResult', message);
  break;

// Line 70-73 in TranscriptionClient.ts (setupEventHandlers)
this.wsClient.on('partialResult', (result: PartialResultMessage) => {
  logger.info('Partial result received', { text: result.text.substring(0, 50) });
  this.emit('partialResult', result);  // <-- Re-emit to app
});
```

## Required Changes Summary

### 1. Add Display Mode Enum
**File:** `src/types/websocket.ts`
```typescript
export enum DisplayMode {
  COMPACT = 'compact',
  VERBOSE = 'verbose',
}
```

### 2. Create CompactDisplay Service
**File:** `src/services/CompactDisplay.ts` (NEW - ~150-200 lines)

**Core Methods:**
```typescript
public displayPartialResult(result: PartialResultMessage): void {
  // 1. Extract speaker from result.segments[0]?.speaker
  // 2. Format: [Now][Speaker X] text (or [Now] if no speaker)
  // 3. Write with: process.stdout.write('\r\x1b[K' + line)
}

public displayFinalResult(result: FinalResultMessage): void {
  // 1. Clear current partial line (newline)
  // 2. Format: [HH:MM:SS][Speaker X] text
  // 3. Output with: console.log(line)
  // 4. Emit new [Now] prompt
}
```

### 3. Update CLI Argument Parser
**File:** `src/index.ts` (lines 12-99)

Add case in switch statement:
```typescript
case '--display':
  if (!config.display) config.display = {} as any;
  const mode = args[++i];
  if (!['compact', 'verbose'].includes(mode)) {
    console.error('Error: invalid display mode. Use "compact" or "verbose"');
    process.exit(1);
  }
  config.display!.mode = mode;
  break;
```

### 4. Add Display Config to TranscriptionClientConfig
**File:** `src/services/TranscriptionClient.ts` (lines 20-24)

```typescript
export interface TranscriptionClientConfig {
  websocket: WebSocketConfig;
  audioCapture: AudioCaptureConfig;
  vad: VADConfig;
  display?: { mode: DisplayMode };  // <-- ADD THIS
}
```

### 5. Update TranscriptionClient Constructor
**File:** `src/services/TranscriptionClient.ts` (lines 37-52)

```typescript
constructor(config: TranscriptionClientConfig) {
  super();
  this.config = config;

  // Initialize display service based on mode
  if (config.display?.mode === 'compact') {
    this.displayService = new CompactDisplay();
  } else {
    this.displayService = new TranscriptionDisplay(config);
  }

  // ... rest of initialization
}
```

### 6. Update Main Entry Point Config
**File:** `src/index.ts` (lines 105-125)

```typescript
const config: TranscriptionClientConfig = {
  websocket: {
    serverUrl: cliConfig.websocket?.serverUrl || process.env['WS_SERVER_URL'] || 'ws://localhost:8000/transcribe',
    // ...
  },
  display: {
    mode: (cliConfig.display?.mode as DisplayMode) || DisplayMode.COMPACT,  // <-- Default to COMPACT
  },
  // ...
};
```

## Partial vs Final Display Comparison

### Partial Message Reception
```
Input:  PartialResultMessage {
  type: 'partial',
  buffer_id: 'buff_001',
  text: 'こんにちは',
  segments: [{ text: 'こんにちは', speaker: 'Speaker 1' }]
}

Output to Console:
[Now][Speaker 1] こんにちは
                 ↑ (cursor position - ready to overwrite)

Next Partial:
PartialResultMessage { text: 'こんにちは、元気ですか' }

Output:
\r\x1b[K[Now][Speaker 1] こんにちは、元気ですか
(carriage return + clear + new text)
```

### Final Message Reception
```
Input:  FinalResultMessage {
  type: 'final',
  buffer_id: 'buff_001',
  text: 'こんにちは、元気ですか',
  segments: [{ text: '...', speaker: 'Speaker 1' }]
}

Output to Console:
(clear previous partial line with newline)
[12:34:56][Speaker 1] こんにちは、元気ですか
[Now]
     ↑ (cursor position for next partial)
```

## Testing Checklist

- [ ] Partial message updates in-place with `\r` (no newlines until Final)
- [ ] Final message clears Partial and creates new line with timestamp
- [ ] Speaker extraction works (fallback to no speaker if absent)
- [ ] Multiple Partials stack properly (newest overwrites previous)
- [ ] Multiple Finals create permanent history (scrollback only)
- [ ] Default mode is Compact when no `--display` argument
- [ ] `--display=verbose` uses old TranscriptionDisplay
- [ ] `--display=compact` uses new CompactDisplay
- [ ] Invalid `--display` value shows error and exits
- [ ] Empty text Partial shows `[Now][Speaker X]` only
- [ ] No text Partial shows `[Now]` only
- [ ] Terminal resize doesn't break display (natural wordwrap)

## Implementation Order

1. Create `src/services/CompactDisplay.ts` with basic structure
2. Add `DisplayMode` enum to `src/types/websocket.ts`
3. Update `src/index.ts` with `--display` argument parsing
4. Update `TranscriptionClientConfig` interface in `src/services/TranscriptionClient.ts`
5. Update `TranscriptionClient` constructor to instantiate correct service
6. Implement partial/final display methods in CompactDisplay
7. Add unit tests for CompactDisplay
8. Test with real WebSocket messages

