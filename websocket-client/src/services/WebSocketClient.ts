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
          console.log(`WebSocket connected: ${this.config.serverUrl}`);
          resolve();
        });

        // Connection error
        this.ws.on('error', (error: Error) => {
          console.error('WebSocket error:', error);
          this.emit('error', error);

          if (this.connectionState === ConnectionState.CONNECTING) {
            this.connectionState = ConnectionState.DISCONNECTED;
            reject(error);
          }
        });

        // Connection closed
        this.ws.on('close', (code: number, reason: Buffer) => {
          console.log(`WebSocket closed: code=${code}, reason=${reason.toString()}`);
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
      console.log('WebSocket disconnected');
    }
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

      console.error(errorMessage);
      this.emit('reconnectFailed');
      return;
    }

    // Calculate backoff delay (exponential: 1s, 2s, 4s, 8s, 16s)
    const backoffBase = this.config.reconnectBackoffBase ?? 1000;
    const backoffMax = this.config.reconnectBackoffMax ?? 16000;
    const delay = Math.min(backoffBase * Math.pow(2, this.reconnectAttempts), backoffMax);

    console.log(
      `Scheduling reconnect attempt ${this.reconnectAttempts + 1}/${maxAttempts} in ${delay}ms`
    );

    this.reconnectTimer = setTimeout(async () => {
      this.reconnectAttempts++;
      this.statistics.reconnectCount++;
      this.statistics.lastReconnectTime = new Date();

      try {
        await this.connect();
        console.log('Reconnected successfully');
        this.emit('reconnected');
      } catch (error) {
        console.error('Reconnect failed:', error);
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
        if (error !== undefined) {
          console.error('Failed to send audio chunk:', error);
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
          console.log('Connection established:', message.session_id);
          this.emit('connectionEstablished', message);
          break;

        case 'audio_received':
          // Acknowledgment for audio chunk
          this.emit('audioReceived', message);
          break;

        case 'partial':
          console.log('Partial result received:', message.buffer_id);
          this.emit('partialResult', message);
          break;

        case 'final':
          console.log('Final result received:', message.buffer_id);
          this.emit('finalResult', message);
          break;

        case 'error':
          console.error('Server error:', message.message);
          this.emit('serverError', message);
          break;

        default:
          console.warn('Unknown message type:', message);
      }
    } catch (error) {
      console.error('Failed to parse message:', error);
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
