/**
 * WebSocket Real-time Transcription Client
 * Mac Client Entry Point
 */

import { TranscriptionClient, TranscriptionClientConfig } from './services/TranscriptionClient';

// Default configuration
const config: TranscriptionClientConfig = {
  websocket: {
    serverUrl: process.env['WS_SERVER_URL'] || 'ws://localhost:8000/transcribe',
    maxReconnectAttempts: 10,
    reconnectBackoffBase: 1000,
    reconnectBackoffMax: 16000,
  },
  audioCapture: {
    deviceName: process.env['AUDIO_DEVICE'] || 'BlackHole 2ch',
    sampleRate: 48000,
    channels: 2,
    format: 'f32le', // 32-bit float little-endian
  },
  vad: {
    sampleRate: 48000,
    channels: 2,
    silenceThreshold: -85, // dB
    silenceDuration: 10, // seconds
    forceVoiceAfter: 300, // 5 minutes
  },
};

async function main() {
  console.log('=== WebSocket Real-time Transcription Client ===');
  console.log('Configuration:', JSON.stringify(config, null, 2));

  const client = new TranscriptionClient(config);

  // Setup event listeners
  client.on('wsConnected', () => {
    console.log('[Event] WebSocket connected');
  });

  client.on('wsDisconnected', () => {
    console.log('[Event] WebSocket disconnected');
  });

  client.on('partialResult', (result) => {
    console.log('[Partial]', result.text);
  });

  client.on('finalResult', (result) => {
    console.log('[Final]', result.text);
  });

  client.on('voiceDetected', (info) => {
    console.log('[VAD] Voice detected:', info);
  });

  client.on('error', (error) => {
    console.error('[Error]', error);
  });

  // Graceful shutdown
  process.on('SIGINT', async () => {
    console.log('\nShutting down...');
    await client.stop();
    process.exit(0);
  });

  process.on('SIGTERM', async () => {
    console.log('\nShutting down...');
    await client.stop();
    process.exit(0);
  });

  // Start client
  try {
    await client.start();
  } catch (error) {
    console.error('Failed to start client:', error);
    process.exit(1);
  }
}

// Run main
if (require.main === module) {
  main().catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}

export { TranscriptionClient, TranscriptionClientConfig };
