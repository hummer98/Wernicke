/**
 * Compact Display Tests
 * CompactDisplay実装のテスト（TDD）
 */

import { CompactDisplay } from './CompactDisplay';
import { PartialResultMessage, FinalResultMessage } from '../types/websocket';
import { WriteStream } from 'tty';

describe('CompactDisplay', () => {
  let display: CompactDisplay;
  let mockStdout: jest.Mocked<WriteStream>;
  let writtenOutput: string[];

  beforeEach(() => {
    // Reset output buffer
    writtenOutput = [];

    // Create mock stdout
    mockStdout = {
      write: jest.fn((chunk: string) => {
        writtenOutput.push(chunk);
        return true;
      }),
    } as unknown as jest.Mocked<WriteStream>;

    display = new CompactDisplay(mockStdout);
  });

  describe('Constructor', () => {
    test('should initialize with hasPartialLine = false', () => {
      expect(display['hasPartialLine']).toBe(false);
    });

    test('should use process.stdout when no stream provided', () => {
      const defaultDisplay = new CompactDisplay();
      expect(defaultDisplay).toBeDefined();
    });
  });

  describe('Task 2.2: Partial Message Display', () => {
    test('should display partial result in [Now][Speaker X] format', () => {
      const partial: PartialResultMessage = {
        type: 'partial',
        buffer_id: 'buff_001',
        text: 'こんにちわ',
        segments: [
          {
            start: 0.0,
            end: 1.0,
            text: 'こんにちわ',
            speaker: 'Speaker_00',
          },
        ],
        timestamp_range: { start: 0, end: 1 },
        latency_ms: 100,
      };

      display.displayPartialResult(partial);

      const output = writtenOutput.join('');
      expect(output).toContain('[Now]');
      expect(output).toContain('[Speaker 1]');
      expect(output).toContain('こんにちわ');
    });

    test('should use \\r for in-place update on subsequent partials', () => {
      const partial1: PartialResultMessage = {
        type: 'partial',
        buffer_id: 'buff_001',
        text: 'こんに',
        segments: [{ start: 0, end: 0.5, text: 'こんに', speaker: 'Speaker_00' }],
        timestamp_range: { start: 0, end: 0.5 },
        latency_ms: 50,
      };

      const partial2: PartialResultMessage = {
        type: 'partial',
        buffer_id: 'buff_001',
        text: 'こんにちわ',
        segments: [{ start: 0, end: 1, text: 'こんにちわ', speaker: 'Speaker_00' }],
        timestamp_range: { start: 0, end: 1 },
        latency_ms: 100,
      };

      display.displayPartialResult(partial1);
      writtenOutput = []; // Clear buffer

      display.displayPartialResult(partial2);

      const output = writtenOutput.join('');
      expect(output).toMatch(/^\r/); // Should start with \r for overwrite
    });

    test('should display [Now] only when text is empty', () => {
      const partial: PartialResultMessage = {
        type: 'partial',
        buffer_id: 'buff_001',
        text: '',
        segments: [],
        timestamp_range: { start: 0, end: 0 },
        latency_ms: 0,
      };

      display.displayPartialResult(partial);

      const output = writtenOutput.join('');
      expect(output).toBe('[Now]');
    });

    test('should omit speaker when speaker information is missing', () => {
      const partial: PartialResultMessage = {
        type: 'partial',
        buffer_id: 'buff_001',
        text: 'こんにちわ',
        segments: [{ start: 0, end: 1, text: 'こんにちわ' }],
        timestamp_range: { start: 0, end: 1 },
        latency_ms: 100,
      };

      display.displayPartialResult(partial);

      const output = writtenOutput.join('');
      expect(output).toContain('[Now]');
      expect(output).not.toMatch(/\[Speaker \d+\]/);
      expect(output).toContain('こんにちわ');
    });

    test('should convert Speaker_00 to Speaker 1', () => {
      const partial: PartialResultMessage = {
        type: 'partial',
        buffer_id: 'buff_001',
        text: 'test',
        segments: [{ start: 0, end: 1, text: 'test', speaker: 'Speaker_00' }],
        timestamp_range: { start: 0, end: 1 },
        latency_ms: 100,
      };

      display.displayPartialResult(partial);

      const output = writtenOutput.join('');
      expect(output).toContain('[Speaker 1]');
    });

    test('should convert Speaker_01 to Speaker 2', () => {
      const partial: PartialResultMessage = {
        type: 'partial',
        buffer_id: 'buff_001',
        text: 'test',
        segments: [{ start: 0, end: 1, text: 'test', speaker: 'Speaker_01' }],
        timestamp_range: { start: 0, end: 1 },
        latency_ms: 100,
      };

      display.displayPartialResult(partial);

      const output = writtenOutput.join('');
      expect(output).toContain('[Speaker 2]');
    });
  });

  describe('Task 2.3: Final Message Display', () => {
    test('should clear current line and display final result in [HH:MM:SS][Speaker X] format', () => {
      // Display partial first to establish partial line
      const partial: PartialResultMessage = {
        type: 'partial',
        buffer_id: 'buff_001',
        text: 'こんにちわ',
        segments: [{ start: 0, end: 1, text: 'こんにちわ', speaker: 'Speaker_00' }],
        timestamp_range: { start: 0, end: 1 },
        latency_ms: 100,
      };
      display.displayPartialResult(partial);
      writtenOutput = []; // Clear buffer

      const final: FinalResultMessage = {
        type: 'final',
        buffer_id: 'buff_001',
        text: 'こんにちわ、今何をしていますか？',
        segments: [
          {
            start: 0,
            end: 2,
            text: 'こんにちわ、今何をしていますか？',
            speaker: 'Speaker_00',
          },
        ],
        timestamp_range: { start: 0, end: 2 },
        latency_ms: 200,
      };

      display.displayFinalResult(final);

      const output = writtenOutput.join('');
      expect(output).toMatch(/^\r\x1b\[K/); // Should clear line with \r\x1b[K
      expect(output).toMatch(/\[\d{2}:\d{2}:\d{2}\]/); // Timestamp in HH:MM:SS format
      expect(output).toContain('[Speaker 1]');
      expect(output).toContain('こんにちわ、今何をしていますか？');
      expect(output).toContain('\n'); // Should contain newline
      expect(output).toContain('[Now]'); // Should end with [Now] placeholder
    });

    test('should display new [Now] placeholder after final message', () => {
      const final: FinalResultMessage = {
        type: 'final',
        buffer_id: 'buff_001',
        text: 'テスト',
        segments: [{ start: 0, end: 1, text: 'テスト', speaker: 'Speaker_00' }],
        timestamp_range: { start: 0, end: 1 },
        latency_ms: 100,
      };

      display.displayFinalResult(final);

      const output = writtenOutput.join('');
      const lines = output.split('\n');
      expect(lines[lines.length - 1]).toBe('[Now]'); // Last line should be [Now]
    });

    test('should use current time for timestamp', () => {
      const before = new Date();
      const final: FinalResultMessage = {
        type: 'final',
        buffer_id: 'buff_001',
        text: 'test',
        segments: [{ start: 0, end: 1, text: 'test' }],
        timestamp_range: { start: 0, end: 1 },
        latency_ms: 100,
      };

      display.displayFinalResult(final);
      const after = new Date();

      const output = writtenOutput.join('');
      const match = output.match(/\[(\d{2}):(\d{2}):(\d{2})\]/);
      expect(match).toBeTruthy();

      if (match) {
        const hours = parseInt(match[1]!, 10);
        const minutes = parseInt(match[2]!, 10);
        const seconds = parseInt(match[3]!, 10);

        expect(hours).toBeGreaterThanOrEqual(before.getHours());
        expect(hours).toBeLessThanOrEqual(after.getHours());
        expect(minutes).toBeGreaterThanOrEqual(0);
        expect(minutes).toBeLessThan(60);
        expect(seconds).toBeGreaterThanOrEqual(0);
        expect(seconds).toBeLessThan(60);
      }
    });

    test('should not clear line if no partial line exists', () => {
      const final: FinalResultMessage = {
        type: 'final',
        buffer_id: 'buff_001',
        text: 'test',
        segments: [{ start: 0, end: 1, text: 'test', speaker: 'Speaker_00' }],
        timestamp_range: { start: 0, end: 1 },
        latency_ms: 100,
      };

      // No partial displayed before
      display.displayFinalResult(final);

      const output = writtenOutput.join('');
      expect(output).not.toMatch(/^\r\x1b\[K/); // Should not start with clear sequence
      expect(output).toMatch(/^\[\d{2}:\d{2}:\d{2}\]/); // Should start with timestamp directly
    });
  });

  describe('Task 2.4: State Management', () => {
    test('should set hasPartialLine to true after displaying partial', () => {
      const partial: PartialResultMessage = {
        type: 'partial',
        buffer_id: 'buff_001',
        text: 'test',
        segments: [{ start: 0, end: 1, text: 'test' }],
        timestamp_range: { start: 0, end: 1 },
        latency_ms: 100,
      };

      display.displayPartialResult(partial);
      expect(display['hasPartialLine']).toBe(true);
    });

    test('should transition hasPartialLine: false -> true -> false -> true on Partial -> Final sequence', () => {
      const partial: PartialResultMessage = {
        type: 'partial',
        buffer_id: 'buff_001',
        text: 'test',
        segments: [{ start: 0, end: 1, text: 'test' }],
        timestamp_range: { start: 0, end: 1 },
        latency_ms: 100,
      };

      const final: FinalResultMessage = {
        type: 'final',
        buffer_id: 'buff_001',
        text: 'test final',
        segments: [{ start: 0, end: 1, text: 'test final' }],
        timestamp_range: { start: 0, end: 1 },
        latency_ms: 200,
      };

      expect(display['hasPartialLine']).toBe(false);

      display.displayPartialResult(partial);
      expect(display['hasPartialLine']).toBe(true);

      display.displayFinalResult(final);
      expect(display['hasPartialLine']).toBe(true); // Back to true after [Now] placeholder
    });
  });

  describe('Task 5.2: Cursor Control Verification', () => {
    test('should use \\r for partial updates', () => {
      const partial1: PartialResultMessage = {
        type: 'partial',
        buffer_id: 'buff_001',
        text: 'test1',
        segments: [{ start: 0, end: 1, text: 'test1' }],
        timestamp_range: { start: 0, end: 1 },
        latency_ms: 100,
      };

      const partial2: PartialResultMessage = {
        type: 'partial',
        buffer_id: 'buff_001',
        text: 'test2',
        segments: [{ start: 0, end: 1, text: 'test2' }],
        timestamp_range: { start: 0, end: 1 },
        latency_ms: 100,
      };

      display.displayPartialResult(partial1);
      writtenOutput = [];
      display.displayPartialResult(partial2);

      expect(writtenOutput[0]).toMatch(/^\r/);
    });

    test('should use \\r\\x1b[K for final display when partial exists', () => {
      const partial: PartialResultMessage = {
        type: 'partial',
        buffer_id: 'buff_001',
        text: 'partial',
        segments: [{ start: 0, end: 1, text: 'partial' }],
        timestamp_range: { start: 0, end: 1 },
        latency_ms: 100,
      };

      const final: FinalResultMessage = {
        type: 'final',
        buffer_id: 'buff_001',
        text: 'final',
        segments: [{ start: 0, end: 1, text: 'final' }],
        timestamp_range: { start: 0, end: 1 },
        latency_ms: 200,
      };

      display.displayPartialResult(partial);
      writtenOutput = [];
      display.displayFinalResult(final);

      const output = writtenOutput.join('');
      expect(output).toMatch(/^\r\x1b\[K/);
    });

    test('should display [Now] after final', () => {
      const final: FinalResultMessage = {
        type: 'final',
        buffer_id: 'buff_001',
        text: 'final',
        segments: [{ start: 0, end: 1, text: 'final' }],
        timestamp_range: { start: 0, end: 1 },
        latency_ms: 200,
      };

      display.displayFinalResult(final);

      const output = writtenOutput.join('');
      const lines = output.split('\n');
      expect(lines[lines.length - 1]).toBe('[Now]');
    });
  });

  describe('Edge Cases', () => {
    test('should handle very long text without errors', () => {
      const longText = 'あ'.repeat(1000);
      const partial: PartialResultMessage = {
        type: 'partial',
        buffer_id: 'buff_001',
        text: longText,
        segments: [{ start: 0, end: 10, text: longText }],
        timestamp_range: { start: 0, end: 10 },
        latency_ms: 100,
      };

      expect(() => display.displayPartialResult(partial)).not.toThrow();
      const output = writtenOutput.join('');
      expect(output).toContain(longText);
    });

    test('should handle missing segments array', () => {
      const partial: PartialResultMessage = {
        type: 'partial',
        buffer_id: 'buff_001',
        text: 'test',
        segments: [],
        timestamp_range: { start: 0, end: 1 },
        latency_ms: 100,
      };

      expect(() => display.displayPartialResult(partial)).not.toThrow();
      const output = writtenOutput.join('');
      expect(output).toContain('[Now]');
      expect(output).toContain('test');
    });
  });
});
