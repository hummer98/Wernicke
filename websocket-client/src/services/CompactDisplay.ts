/**
 * Compact Display Service
 * コンソールベースのCompact表示サービス
 */

import { PartialResultMessage, FinalResultMessage } from '../types/websocket';
import { WriteStream } from 'tty';

/**
 * Interface for transcription display services
 * 文字起こし表示サービスのインターフェース
 */
export interface ITranscriptionDisplay {
  displayPartialResult(message: PartialResultMessage): void;
  displayFinalResult(message: FinalResultMessage): void;
}

/**
 * Compact Display Service
 * リアルタイム音声文字起こしのCompact表示（コンソール出力）
 */
export class CompactDisplay implements ITranscriptionDisplay {
  private hasPartialLine: boolean = false;
  private readonly stdout: WriteStream;

  constructor(stdout?: WriteStream) {
    this.stdout = (stdout || process.stdout) as WriteStream;
  }

  /**
   * Display partial result
   * Partialメッセージを表示（逐次更新）
   */
  displayPartialResult(message: PartialResultMessage): void {
    const speaker = this.extractSpeaker(message.segments[0]?.speaker);
    const formattedSpeaker = this.formatSpeaker(speaker);
    const text = message.text;

    let output: string;
    if (text === '') {
      output = '[Now]';
    } else if (formattedSpeaker) {
      output = `[Now]${formattedSpeaker} ${text}`;
    } else {
      output = `[Now] ${text}`;
    }

    // Use \r for in-place update if partial line already exists
    if (this.hasPartialLine) {
      this.stdout.write(`\r${output}`);
    } else {
      this.stdout.write(output);
    }

    this.hasPartialLine = true;
  }

  /**
   * Display final result
   * Finalメッセージを表示（確定表示）
   */
  displayFinalResult(message: FinalResultMessage): void {
    const speaker = this.extractSpeaker(message.segments[0]?.speaker);
    const formattedSpeaker = this.formatSpeaker(speaker);
    const timestamp = this.formatTimestamp();
    const text = message.text;

    let output: string;
    if (formattedSpeaker) {
      output = `[${timestamp}]${formattedSpeaker} ${text}`;
    } else {
      output = `[${timestamp}] ${text}`;
    }

    // Clear current line if partial exists, then write final result
    if (this.hasPartialLine) {
      this.stdout.write(`\r\x1b[K${output}\n`);
    } else {
      this.stdout.write(`${output}\n`);
    }

    // Display new [Now] placeholder
    this.stdout.write('[Now]');
    this.hasPartialLine = true;
  }

  /**
   * Extract speaker from speaker string
   * 話者文字列から話者を抽出（Speaker_00 -> 0）
   */
  private extractSpeaker(speaker: string | undefined): number | null {
    if (!speaker) {
      return null;
    }

    const match = speaker.match(/Speaker_(\d+)/);
    if (match && match[1]) {
      return parseInt(match[1], 10);
    }

    return null;
  }

  /**
   * Format speaker for display
   * 話者情報をフォーマット（0 -> [Speaker 1]）
   */
  private formatSpeaker(speaker: number | null): string {
    if (speaker === null) {
      return '';
    }
    return `[Speaker ${speaker + 1}]`;
  }

  /**
   * Format current timestamp
   * 現在時刻をフォーマット（HH:MM:SS）
   */
  private formatTimestamp(): string {
    const now = new Date();
    const hours = now.getHours().toString().padStart(2, '0');
    const minutes = now.getMinutes().toString().padStart(2, '0');
    const seconds = now.getSeconds().toString().padStart(2, '0');
    return `${hours}:${minutes}:${seconds}`;
  }
}
