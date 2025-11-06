/**
 * WebSocket Real-time Transcription Client
 * Mac Client Entry Point
 */

import { TranscriptionClient, TranscriptionClientConfig } from './services/TranscriptionClient';
import { logger } from './services/Logger';

/**
 * Parse command line arguments
 */
function parseArgs(): Partial<TranscriptionClientConfig> {
  const args = process.argv.slice(2);
  const config: Partial<TranscriptionClientConfig> = {};

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    switch (arg) {
      case '--server-url':
      case '-s':
        if (!config.websocket) config.websocket = {} as any;
        if (i + 1 >= args.length) {
          console.error(`Error: ${arg} requires a value`);
          process.exit(1);
        }
        config.websocket!.serverUrl = args[++i]!;
        break;

      case '--audio-device':
      case '-d':
        if (!config.audioCapture) config.audioCapture = {} as any;
        if (i + 1 >= args.length) {
          console.error(`Error: ${arg} requires a value`);
          process.exit(1);
        }
        config.audioCapture!.deviceName = args[++i]!;
        break;

      case '--vad-threshold':
      case '-t':
        if (!config.vad) config.vad = {} as any;
        if (i + 1 >= args.length) {
          console.error(`Error: ${arg} requires a value`);
          process.exit(1);
        }
        config.vad!.silenceThreshold = parseFloat(args[++i]!);
        break;

      case '--vad-silence-duration':
        if (!config.vad) config.vad = {} as any;
        if (i + 1 >= args.length) {
          console.error(`Error: ${arg} requires a value`);
          process.exit(1);
        }
        config.vad!.silenceDuration = parseFloat(args[++i]!);
        break;

      case '--vad-force-voice-after':
        if (!config.vad) config.vad = {} as any;
        if (i + 1 >= args.length) {
          console.error(`Error: ${arg} requires a value`);
          process.exit(1);
        }
        config.vad!.forceVoiceAfter = parseFloat(args[++i]!);
        break;

      case '--help':
      case '-h':
        console.log(`
WebSocket Real-time Transcription Client

Usage: npm run dev -- [options]

Options:
  -s, --server-url <url>              WebSocket server URL (default: ws://localhost:8000/transcribe)
  -d, --audio-device <device>         Audio device name (default: BlackHole 2ch)
  -t, --vad-threshold <dB>            VAD silence threshold in dB (default: -85)
  --vad-silence-duration <seconds>    Silence duration in seconds (default: 10)
  --vad-force-voice-after <seconds>   Force voice detection after N seconds (default: 300)
  -h, --help                          Show this help message

Examples:
  npm run dev -- --server-url ws://192.168.1.100:8000/transcribe
  npm run dev -- --vad-threshold -50
  npm run dev -- -s ws://192.168.1.100:8000/transcribe -t -50
`);
        process.exit(0);
        break;

      default:
        console.error(`Unknown option: ${arg}`);
        console.error('Use --help for usage information');
        process.exit(1);
    }
  }

  return config;
}

// Parse command line arguments
const cliConfig = parseArgs();

// Default configuration
const config: TranscriptionClientConfig = {
  websocket: {
    serverUrl: cliConfig.websocket?.serverUrl || process.env['WS_SERVER_URL'] || 'ws://localhost:8000/transcribe',
    maxReconnectAttempts: 10,
    reconnectBackoffBase: 1000,
    reconnectBackoffMax: 16000,
  },
  audioCapture: {
    deviceName: cliConfig.audioCapture?.deviceName || process.env['AUDIO_DEVICE'] || 'BlackHole 2ch',
    sampleRate: 48000,
    channels: 2,
    format: 'f32le', // 32-bit float little-endian
  },
  vad: {
    sampleRate: 48000,
    channels: 2,
    silenceThreshold: cliConfig.vad?.silenceThreshold ?? parseFloat(process.env['VAD_SILENCE_THRESHOLD'] || '-85'), // dB
    silenceDuration: cliConfig.vad?.silenceDuration ?? parseFloat(process.env['VAD_SILENCE_DURATION'] || '10'), // seconds
    forceVoiceAfter: cliConfig.vad?.forceVoiceAfter ?? parseFloat(process.env['VAD_FORCE_VOICE_AFTER'] || '300'), // 5 minutes
  },
};

async function main() {
  logger.info('=== WebSocket Real-time Transcription Client ===');
  logger.info('Configuration', config);

  const client = new TranscriptionClient(config);

  // Setup event listeners
  client.on('wsConnected', () => {
    logger.info('[Event] WebSocket connected');
  });

  client.on('wsDisconnected', () => {
    logger.info('[Event] WebSocket disconnected');
  });

  client.on('partialResult', (result) => {
    logger.info('[Partial]', { text: result.text });
  });

  client.on('finalResult', (result) => {
    logger.info('[Final]', { text: result.text });
  });

  // VAD events are logged at debug level to reduce noise
  // client.on('voiceDetected', (info) => {
  //   logger.info('[VAD] Voice detected', info);
  // });

  client.on('error', (error) => {
    logger.error('[Error]', { error: error instanceof Error ? error.message : String(error) });
  });

  client.on('permanentError', (error) => {
    logger.error('[Permanent Error] Configuration issue detected', {
      error: error instanceof Error ? error.message : String(error),
      action: 'Please fix the server URL or endpoint configuration and restart the client.',
    });
    // Exit on permanent error
    process.exit(1);
  });

  // Graceful shutdown
  process.on('SIGINT', async () => {
    logger.info('Shutting down (SIGINT)...');
    await client.stop();
    process.exit(0);
  });

  process.on('SIGTERM', async () => {
    logger.info('Shutting down (SIGTERM)...');
    await client.stop();
    process.exit(0);
  });

  // Start client
  try {
    await client.start();
  } catch (error) {
    logger.error('Failed to start client', {
      error: error instanceof Error ? error.message : String(error),
    });
    process.exit(1);
  }
}

// Run main
if (require.main === module) {
  main().catch((error) => {
    logger.error('Fatal error', {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
    process.exit(1);
  });
}

export { TranscriptionClient, TranscriptionClientConfig };
