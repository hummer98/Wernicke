/**
 * WebSocket Client
 * Task 9.1: WebSocket接続管理の実装
 * Task 9.2: 自動再接続機能の実装
 * Task 9.3: 音声チャンク送信機能の実装
 * Task 9.4: 結果受信とイベントハンドリング
 */

import { EventEmitter } from 'events';
import WS from 'ws';
import {
  ConnectionState,
  WebSocketConfig,
  TranscriptionMessage,
  WebSocketStatistics,
} from '../types/websocket';
import { logger } from './Logger';

/**
 * WebSocket Client for real-time transcription
 * リアルタイム文字起こし用WebSocketクライアント
 */
export class WebSocketClient extends EventEmitter {
  private config: WebSocketConfig;
  private ws: WS | null = null;
  private connectionState: ConnectionState = ConnectionState.DISCONNECTED;
  private reconnectAttempts: number = 0;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private permanentError: boolean = false; // Track permanent errors
  private statistics: WebSocketStatistics = {
    bytesSent: 0,
    reconnectCount: 0,
  };

  constructor(config: WebSocketConfig) {
    super();
    this.config = {
      maxReconnectAttempts: 10,
      reconnectBackoffBase: 1000,
      reconnectBackoffMax: 16000,
      ...config,
    };
  }

  /**
   * Get current configuration
   * 現在の設定を取得
   */
  public getConfig(): WebSocketConfig {
    return { ...this.config };
  }

  /**
   * Get current connection state
   * 現在の接続状態を取得
   */
  public getConnectionState(): ConnectionState {
    return this.connectionState;
  }

  /**
   * Check if connected
   * 接続中かどうかをチェック
   */
  public isConnected(): boolean {
    return this.connectionState === ConnectionState.CONNECTED;
  }

  /**
   * Connect to WebSocket server
   * WebSocketサーバーに接続
   *
   * Task 9.1: WebSocket接続管理の実装
   */
  public async connect(): Promise<void> {
    if (this.connectionState !== ConnectionState.DISCONNECTED) {
      throw new Error('Already connected or connecting');
    }

    this.connectionState = ConnectionState.CONNECTING;
    this.emit('connecting');

    return new Promise((resolve, reject) => {
      try {
        // Create WebSocket connection
        this.ws = new WS(this.config.serverUrl);

        // Connection opened
        this.ws.on('open', () => {
          this.connectionState = ConnectionState.CONNECTED;
          this.reconnectAttempts = 0;
          this.emit('connected');
          logger.info('WebSocket connected', { serverUrl: this.config.serverUrl });
          resolve();
        });

        // Connection error
        this.ws.on('error', (error: Error) => {
          // Check if this is a permanent error
          if (this.isPermanentError(error)) {
            this.permanentError = true;
            logger.error('Permanent WebSocket error detected', {
              error: error.message,
              errorType: 'PERMANENT',
              recommendation:
                'Please check the server URL and ensure the WebSocket endpoint is correctly configured.',
            });
            this.emit('permanentError', error);

            if (this.connectionState === ConnectionState.CONNECTING) {
              this.connectionState = ConnectionState.DISCONNECTED;
              reject(error);
            }
            return;
          }

          // Temporary error - log and continue
          logger.error('WebSocket error', { error: error.message, stack: error.stack });
          this.emit('error', error);

          if (this.connectionState === ConnectionState.CONNECTING) {
            this.connectionState = ConnectionState.DISCONNECTED;
            reject(error);
          }
        });

        // Connection closed
        this.ws.on('close', (code: number, reason: Buffer) => {
          logger.info('WebSocket closed', { code, reason: reason.toString() });
          this.handleDisconnect();
        });

        // Message received
        this.ws.on('message', (data: WS.Data) => {
          this.handleMessage(data);
        });
      } catch (error) {
        this.connectionState = ConnectionState.DISCONNECTED;
        reject(error);
      }
    });
  }

  /**
   * Disconnect from WebSocket server
   * WebSocketサーバーから切断
   *
   * Task 9.1: WebSocket接続管理の実装
   */
  public async disconnect(): Promise<void> {
    // Clear reconnect timer
    if (this.reconnectTimer !== null) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    if (this.ws !== null) {
      this.ws.removeAllListeners();
      this.ws.close();
      this.ws = null;
    }

    if (this.connectionState !== ConnectionState.DISCONNECTED) {
      this.connectionState = ConnectionState.DISCONNECTED;
      this.emit('disconnected');
      logger.info('WebSocket disconnected');
    }
  }

  /**
   * Check if error is permanent (4xx errors that won't resolve with retry)
   * エラーが永続的かどうかをチェック（再試行しても解決しない4xxエラー）
   */
  private isPermanentError(error: Error): boolean {
    const errorMessage = error.message;

    // HTTP 4xx errors are permanent (client errors)
    const permanentErrorPatterns = [
      /unexpected server response: 400/i, // Bad Request
      /unexpected server response: 401/i, // Unauthorized
      /unexpected server response: 403/i, // Forbidden
      /unexpected server response: 404/i, // Not Found
      /unexpected server response: 405/i, // Method Not Allowed
      /unexpected server response: 410/i, // Gone
    ];

    return permanentErrorPatterns.some((pattern) => pattern.test(errorMessage));
  }

  /**
   * Handle disconnection and trigger reconnect if needed
   * 切断を処理し、必要に応じて再接続をトリガー
   *
   * Task 9.2: 自動再接続機能の実装
   */
  private handleDisconnect(): void {
    const wasConnected = this.connectionState === ConnectionState.CONNECTED;
    this.connectionState = ConnectionState.DISCONNECTED;
    this.ws = null;

    // Don't reconnect if permanent error occurred
    if (this.permanentError) {
      logger.warn('Permanent error detected, skipping reconnection');
      return;
    }

    if (wasConnected) {
      this.emit('disconnected');
      // Trigger automatic reconnect
      this.scheduleReconnect();
    }
  }

  /**
   * Schedule reconnection with exponential backoff
   * 指数バックオフによる再接続をスケジュール
   *
   * Task 9.2: 自動再接続機能の実装
   */
  private scheduleReconnect(): void {
    const maxAttempts = this.config.maxReconnectAttempts ?? 10;

    if (this.reconnectAttempts >= maxAttempts) {
      const errorMessage =
        `WebSocket connection failed after ${maxAttempts} reconnection attempts.\n\n` +
        `Manual troubleshooting steps:\n` +
        `1. Check if the server at '${this.config.serverUrl}' is running\n` +
        `2. Verify network connectivity and firewall settings\n` +
        `3. Check server logs for any error messages\n` +
        `4. Ensure the WebSocket endpoint is correctly configured\n` +
        `5. Try restarting the client application\n\n` +
        `If the problem persists, please contact support.`;

      logger.error('WebSocket reconnection failed', {
        maxAttempts,
        serverUrl: this.config.serverUrl,
        troubleshooting: errorMessage,
      });
      this.emit('reconnectFailed');
      return;
    }

    // Calculate backoff delay (exponential: 1s, 2s, 4s, 8s, 16s)
    const backoffBase = this.config.reconnectBackoffBase ?? 1000;
    const backoffMax = this.config.reconnectBackoffMax ?? 16000;
    const delay = Math.min(backoffBase * Math.pow(2, this.reconnectAttempts), backoffMax);

    logger.info('Scheduling reconnect', {
      attempt: this.reconnectAttempts + 1,
      maxAttempts,
      delayMs: delay,
    });

    this.reconnectTimer = setTimeout(async () => {
      this.reconnectAttempts++;
      this.statistics.reconnectCount++;
      this.statistics.lastReconnectTime = new Date();

      try {
        await this.connect();
        logger.info('Reconnected successfully', {
          attempt: this.reconnectAttempts,
          serverUrl: this.config.serverUrl,
        });
        this.emit('reconnected');
      } catch (error) {
        logger.warn('Reconnect attempt failed', {
          attempt: this.reconnectAttempts,
          error: error instanceof Error ? error.message : String(error),
        });
        // scheduleReconnect will be called again by handleDisconnect
      }
    }, delay);
  }

  /**
   * Send audio chunk to server
   * 音声チャンクをサーバーに送信
   *
   * Task 9.3: 音声チャンク送信機能の実装
   */
  public async sendAudioChunk(chunk: Buffer): Promise<void> {
    if (!this.isConnected() || this.ws === null) {
      throw new Error('Not connected to server');
    }

    return new Promise((resolve, reject) => {
      if (this.ws === null) {
        reject(new Error('WebSocket is null'));
        return;
      }

      this.ws.send(chunk, (error) => {
        if (error !== undefined && error !== null) {
          logger.error('Failed to send audio chunk', {
            error: error.message,
            chunkSize: chunk.length,
          });
          reject(error);
        } else {
          this.statistics.bytesSent += chunk.length;
          resolve();
        }
      });
    });
  }

  /**
   * Handle incoming message from server
   * サーバーからの受信メッセージを処理
   *
   * Task 9.4: 結果受信とイベントハンドリング
   */
  private handleMessage(data: WS.Data): void {
    try {
      // Parse JSON message
      const message: TranscriptionMessage = JSON.parse(data.toString());

      // Emit event based on message type
      switch (message.type) {
        case 'connection_established':
          logger.info('Connection established', { sessionId: message.session_id });
          this.emit('connectionEstablished', message);
          break;

        case 'audio_received':
          // Acknowledgment for audio chunk
          this.emit('audioReceived', message);
          break;

        case 'partial':
          logger.info('Partial result received', { bufferId: message.buffer_id });
          this.emit('partialResult', message);
          break;

        case 'final':
          logger.info('Final result received', { bufferId: message.buffer_id });
          this.emit('finalResult', message);
          break;

        case 'error':
          logger.error('Server error', {
            code: message.code,
            message: message.message,
            timestamp: message.timestamp,
          });
          this.emit('serverError', message);
          break;

        default:
          logger.warn('Unknown message type', {
            messageType: (message as { type?: string }).type,
            message: JSON.stringify(message).substring(0, 200)
          });
      }
    } catch (error) {
      logger.error('Failed to parse message', {
        error: error instanceof Error ? error.message : String(error),
        data: data.toString().substring(0, 200), // Log first 200 chars
      });
      this.emit('error', error);
    }
  }

  /**
   * Get statistics
   * 統計情報を取得
   */
  public getStatistics(): WebSocketStatistics {
    return { ...this.statistics };
  }
}
