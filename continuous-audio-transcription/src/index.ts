/**
 * Continuous Audio Transcription System
 * 24時間連続音声文字起こしシステム
 */

import { ConfigService } from './services/ConfigService';
import { Logger, LoggerOptions } from './services/Logger';
import { LogLevel } from './types/logger';
import { AudioCaptureService } from './services/AudioCaptureService';
import { TranscriptionProcessor } from './services/TranscriptionProcessor';
import { CUDAServerClient } from './services/CUDAServerClient';
import { TranscriptionWriter } from './services/TranscriptionWriter';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

let isShuttingDown = false;

async function main() {
  // 設定の読み込み
  const config = ConfigService.load();

  // ロガーの初期化
  const loggerOptions: LoggerOptions = {
    level: (config.log.level as LogLevel) || LogLevel.INFO,
    enableConsole: config.log.enableConsole,
    enableFile: config.log.enableFile,
    logDir: config.log.logDir,
  };
  const logger = new Logger('main', loggerOptions);
  logger.info('Starting Continuous Audio Transcription System...');

  // 文字起こしログファイルのパス設定
  const transcriptionLogDir = path.join(os.homedir(), 'transcriptions', 'logs');
  const transcriptionLogPath = path.join(transcriptionLogDir, 'transcriptions.log');

  // ログディレクトリを作成
  if (!fs.existsSync(transcriptionLogDir)) {
    fs.mkdirSync(transcriptionLogDir, { recursive: true });
  }

  // ログファイルを作成（存在しない場合）
  if (!fs.existsSync(transcriptionLogPath)) {
    fs.writeFileSync(transcriptionLogPath, '', 'utf-8');
  }

  try {
    logger.info('Configuration loaded successfully');

    // CUDAサーバーのヘルスチェック
    const cudaClient = new CUDAServerClient({
      serverUrl: config.transcription.serverUrl,
      timeout: config.transcription.timeout,
    });

    const isHealthy = await cudaClient.checkHealth();
    if (!isHealthy) {
      throw new Error(`CUDA server is not healthy: ${config.transcription.serverUrl}`);
    }
    logger.info(`CUDA server is healthy: ${config.transcription.serverUrl}`);

    // サービスの初期化
    const audioCapture = new AudioCaptureService({
      deviceName: config.audio.deviceName,
      sampleRate: config.audio.sampleRate,
      channels: config.audio.channels,
      format: config.audio.format,
    });

    const transcriptionProcessor = new TranscriptionProcessor(
      audioCapture.getBufferManager(),
      cudaClient
    );

    const transcriptionWriter = new TranscriptionWriter({
      baseDir: config.storage.baseDir,
    });

    // 連続失敗時のアラートコールバック設定
    transcriptionProcessor.setAlertCallback((alert) => {
      logger.error(alert.message, new Error(alert.lastError));
    });

    // バッファイベントのリスニング
    audioCapture.on('bufferFlushed', async (filePath: string) => {
      logger.info(`Buffer flushed: ${filePath}`);

      try {
        // CUDAサーバーで文字起こし実行
        const result = await cudaClient.transcribe(filePath);

        if (result && result.segments.length > 0) {
          logger.info(`Transcription completed: ${result.segments.length} segments`);

          // 文字起こし結果を人間が読みやすい形式でファイルに出力
          const now = new Date();
          const hours = String(now.getHours()).padStart(2, '0');
          const minutes = String(now.getMinutes()).padStart(2, '0');

          // セグメントを間隔でグループ化（2秒以上の間隔で区切る）
          const PAUSE_THRESHOLD = 2.0; // seconds
          let currentGroup: typeof result.segments = [];
          let currentSpeaker = '';

          for (let i = 0; i < result.segments.length; i++) {
            const segment = result.segments[i];
            if (!segment) continue; // Skip if segment is undefined

            const nextSegment = result.segments[i + 1];
            const speaker = segment.speaker || 'Speaker_00';

            // 話者が変わった場合、現在のグループを出力
            if (currentSpeaker && currentSpeaker !== speaker && currentGroup.length > 0) {
              const groupedText = currentGroup.map((s) => s.text.trim()).join('');
              const logLine = `${hours}:${minutes} [${currentSpeaker}] ${groupedText}\n`;
              fs.appendFileSync(transcriptionLogPath, logLine, 'utf-8');
              currentGroup = [];
            }

            currentSpeaker = speaker;
            currentGroup.push(segment);

            // 次のセグメントとの間隔を確認
            if (nextSegment) {
              const pause = nextSegment.start - segment.end;
              if (pause >= PAUSE_THRESHOLD) {
                // 間隔が長い場合、句点を付けてグループを出力
                const groupedText = currentGroup.map((s) => s.text.trim()).join('');
                const logLine = `${hours}:${minutes} [${currentSpeaker}] ${groupedText}。\n`;
                fs.appendFileSync(transcriptionLogPath, logLine, 'utf-8');
                currentGroup = [];
                currentSpeaker = '';
              }
            } else {
              // 最後のセグメント
              const groupedText = currentGroup.map((s) => s.text.trim()).join('');
              const logLine = `${hours}:${minutes} [${currentSpeaker}] ${groupedText}\n`;
              fs.appendFileSync(transcriptionLogPath, logLine, 'utf-8');
            }
          }

          // 結果をファイルに保存
          await transcriptionWriter.writeTranscription(result, filePath, now);
          logger.info('Transcription saved successfully');
        }
      } catch (error) {
        logger.error('Transcription processing failed', error as Error);
      }
    });

    audioCapture.on('bufferSkipped', () => {
      logger.info('Buffer skipped due to silence (VAD)');
    });

    audioCapture.on('error', (error: Error) => {
      logger.error('Audio capture error', error);
    });

    // 音声キャプチャ開始
    await audioCapture.start();
    logger.info('Audio capture started successfully');
    logger.info('Listening for audio input...');

    // シグナルハンドラ
    const shutdown = async (signal: string) => {
      if (isShuttingDown) {
        return;
      }
      isShuttingDown = true;

      logger.info(`Received ${signal}, shutting down gracefully...`);

      // サービスの停止
      try {
        await audioCapture.stop();
        logger.info('All services stopped successfully');
        process.exit(0);
      } catch (error) {
        logger.error('Error during shutdown', error as Error);
        process.exit(1);
      }
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));

    logger.info('System is running. Press Ctrl+C to stop.');
  } catch (error) {
    logger.error('Failed to start system', error as Error);
    process.exit(1);
  }
}

// エラーハンドリング
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
  process.exit(1);
});

// メイン実行
main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
