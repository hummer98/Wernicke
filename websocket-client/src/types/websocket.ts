/**
 * WebSocket Types
 * WebSocket関連の型定義
 */

/**
 * WebSocket connection state
 * WebSocket接続状態
 */
export enum ConnectionState {
  DISCONNECTED = 'DISCONNECTED',
  CONNECTING = 'CONNECTING',
  CONNECTED = 'CONNECTED',
}

/**
 * WebSocket configuration
 * WebSocket設定
 */
export interface WebSocketConfig {
  serverUrl: string;
  maxReconnectAttempts?: number;
  reconnectBackoffBase?: number; // milliseconds
  reconnectBackoffMax?: number; // milliseconds
}

/**
 * Transcription result message types
 * 文字起こし結果メッセージタイプ
 */
export type TranscriptionMessageType = 'connection_established' | 'audio_received' | 'partial' | 'final' | 'error';

/**
 * Connection established message
 * 接続確立メッセージ
 */
export interface ConnectionEstablishedMessage {
  type: 'connection_established';
  message: string;
  session_id: string;
}

/**
 * Audio received acknowledgment
 * 音声受信確認メッセージ
 */
export interface AudioReceivedMessage {
  type: 'audio_received';
  bytes_received: number;
}

/**
 * Transcription segment
 * 文字起こしセグメント
 */
export interface TranscriptionSegment {
  start: number;
  end: number;
  text: string;
  speaker?: string;
  corrected?: boolean;
}

/**
 * Timestamp range
 * タイムスタンプ範囲
 */
export interface TimestampRange {
  start: number;
  end: number;
}

/**
 * Partial transcription result
 * 部分文字起こし結果
 */
export interface PartialResultMessage {
  type: 'partial';
  buffer_id: string;
  text: string;
  segments: TranscriptionSegment[];
  timestamp_range: TimestampRange;
  latency_ms: number;
}

/**
 * Final transcription result
 * 最終文字起こし結果
 */
export interface FinalResultMessage {
  type: 'final';
  buffer_id: string;
  text: string;
  segments: TranscriptionSegment[];
  timestamp_range: TimestampRange;
  latency_ms: number;
}

/**
 * Error message
 * エラーメッセージ
 */
export interface ErrorMessage {
  type: 'error';
  code: number;
  message: string;
}

/**
 * Union type for all transcription messages
 * すべての文字起こしメッセージのユニオン型
 */
export type TranscriptionMessage =
  | ConnectionEstablishedMessage
  | AudioReceivedMessage
  | PartialResultMessage
  | FinalResultMessage
  | ErrorMessage;

/**
 * WebSocket client statistics
 * WebSocketクライアント統計
 */
export interface WebSocketStatistics {
  bytesSent: number;
  reconnectCount: number;
  lastReconnectTime?: Date;
}
