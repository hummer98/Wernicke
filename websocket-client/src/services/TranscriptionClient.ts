/**
 * Transcription Client
 * Task 10.1: AudioCaptureServiceの適応
 * Task 10.2: VoiceActivityDetectorの統合
 *
 * WebSocketClient + AudioCaptureService + VoiceActivityDetectorの統合
 */

import { EventEmitter } from 'events';
import { WebSocketClient } from './WebSocketClient';
import { AudioCaptureService, AudioCaptureConfig } from './AudioCaptureService';
import { VoiceActivityDetector, VADConfig } from './VoiceActivityDetector';
import { ITranscriptionDisplay } from './CompactDisplay';
import { WebSocketConfig, PartialResultMessage, FinalResultMessage } from '../types/websocket';
import { logger } from './Logger';

/**
 * Transcription Client Configuration
 * 文字起こしクライアント設定
 */
export interface TranscriptionClientConfig {
  websocket: WebSocketConfig;
  audioCapture: AudioCaptureConfig;
  vad: VADConfig;
  display?: ITranscriptionDisplay;
}

/**
 * Transcription Client
 * WebSocket + AudioCapture + VADの統合クライアント
 */
export class TranscriptionClient extends EventEmitter {
  private wsClient: WebSocketClient;
  private audioCaptureService: AudioCaptureService;
  private vad: VoiceActivityDetector;
  private config: TranscriptionClientConfig;
  private display?: ITranscriptionDisplay;
  private running: boolean = false;

  constructor(config: TranscriptionClientConfig) {
    super();
    this.config = config;
    this.display = config.display;

    // Initialize WebSocket client
    this.wsClient = new WebSocketClient(config.websocket);

    // Initialize Audio Capture Service
    this.audioCaptureService = new AudioCaptureService(config.audioCapture);

    // Initialize VAD
    this.vad = new VoiceActivityDetector(config.vad);

    // Setup event handlers
    this.setupEventHandlers();
  }

  /**
   * Setup event handlers for all components
   * すべてのコンポーネントのイベントハンドラーを設定
   */
  private setupEventHandlers(): void {
    // WebSocket events
    this.wsClient.on('connected', () => {
      logger.info('WebSocket connected');
      this.emit('wsConnected');
    });

    this.wsClient.on('disconnected', () => {
      logger.info('WebSocket disconnected');
      this.emit('wsDisconnected');
    });

    this.wsClient.on('partialResult', (result: PartialResultMessage) => {
      this.emit('partialResult', result);
      // Display partial result if display service is available
      this.display?.displayPartialResult(result);
    });

    this.wsClient.on('finalResult', (result: FinalResultMessage) => {
      this.emit('finalResult', result);
      // Display final result if display service is available
      this.display?.displayFinalResult(result);
    });

    this.wsClient.on('error', (error: Error) => {
      logger.error('WebSocket error', { error: error.message });
      this.emit('error', error);
    });

    this.wsClient.on('permanentError', (error: Error) => {
      logger.error('Permanent WebSocket error', { error: error.message });
      this.emit('permanentError', error);
    });

    // Audio Capture events
    this.audioCaptureService.on('data', async (chunk: Buffer) => {
      await this.handleAudioChunk(chunk);
    });

    this.audioCaptureService.on('error', (error: Error) => {
      logger.error('Audio capture error', { error: error.message });
      this.emit('error', error);
    });
  }

  /**
   * Handle audio chunk from AudioCaptureService
   * AudioCaptureServiceからの音声チャンクを処理
   *
   * Task 10.1 & 10.2: VAD統合 + WebSocket送信
   */
  private async handleAudioChunk(chunk: Buffer): Promise<void> {
    try {
      // Run VAD on audio chunk
      const vadResult = this.vad.analyze(chunk);

      // Only send to server if voice is detected
      if (vadResult.isVoiceDetected) {
        // Send audio chunk to WebSocket server
        if (this.wsClient.isConnected()) {
          await this.wsClient.sendAudioChunk(chunk);
        }

        // Emit VAD result
        this.emit('voiceDetected', {
          averageLevel: vadResult.averageLevel,
          silenceDuration: vadResult.silenceDuration,
        });
      } else {
        this.emit('silenceDetected', {
          averageLevel: vadResult.averageLevel,
          silenceDuration: vadResult.silenceDuration,
        });
      }
    } catch (error) {
      logger.error('Failed to handle audio chunk', {
        error: error instanceof Error ? error.message : String(error),
      });
      this.emit('error', error);
    }
  }

  /**
   * Start transcription client
   * 文字起こしクライアントを開始
   */
  public async start(): Promise<void> {
    if (this.running) {
      throw new Error('Transcription client is already running');
    }

    logger.info('Starting transcription client...');

    try {
      // Start WebSocket connection
      await this.wsClient.connect();
      logger.info('WebSocket connected');

      // Start audio capture
      await this.audioCaptureService.start();
      logger.info('Audio capture started');

      this.running = true;
      this.emit('started');
      logger.info('Transcription client started');
    } catch (error) {
      logger.error('Failed to start transcription client', {
        error: error instanceof Error ? error.message : String(error),
      });
      await this.stop();
      throw error;
    }
  }

  /**
   * Stop transcription client
   * 文字起こしクライアントを停止
   */
  public async stop(): Promise<void> {
    if (!this.running) {
      return;
    }

    logger.info('Stopping transcription client...');

    // Stop audio capture
    await this.audioCaptureService.stop();
    logger.info('Audio capture stopped');

    // Disconnect WebSocket
    await this.wsClient.disconnect();
    logger.info('WebSocket disconnected');

    this.running = false;
    this.emit('stopped');
    logger.info('Transcription client stopped');
  }

  /**
   * Check if running
   * 実行中かどうかをチェック
   */
  public isRunning(): boolean {
    return this.running;
  }

  /**
   * Get WebSocket client
   * WebSocketクライアントを取得
   */
  public getWebSocketClient(): WebSocketClient {
    return this.wsClient;
  }

  /**
   * Get Audio Capture Service
   * 音声キャプチャサービスを取得
   */
  public getAudioCaptureService(): AudioCaptureService {
    return this.audioCaptureService;
  }

  /**
   * Get VAD
   * VADを取得
   */
  public getVAD(): VoiceActivityDetector {
    return this.vad;
  }

  /**
   * Get configuration
   * 設定を取得
   */
  public getConfig(): TranscriptionClientConfig {
    return this.config;
  }

  /**
   * Get statistics
   * 統計情報を取得
   */
  public getStatistics() {
    return {
      websocket: this.wsClient.getStatistics(),
      audioCapture: this.audioCaptureService.getStatistics(),
      vad: this.vad.getStatistics(),
    };
  }
}
