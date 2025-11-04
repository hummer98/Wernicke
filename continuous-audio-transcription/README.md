# Continuous Audio Transcription

[日本語](README.ja.md) | **English**

24/7 Continuous Audio Transcription System with BlackHole + WhisperX + Speaker Diarization

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.3-blue.svg)](https://www.typescriptlang.org/)
[![Node.js](https://img.shields.io/badge/Node.js-18%2B-green.svg)](https://nodejs.org/)
[![Test Coverage](https://img.shields.io/badge/coverage-75.43%25-brightgreen.svg)](https://github.com/your-repo/continuous-audio-transcription)

## Overview

A production-ready system for continuous audio transcription that captures audio from Zoom/Discord via BlackHole and transcribes it in real-time using WhisperX. With LadioCast audio routing, both your voice and participants' voices are recorded and transcribed.

### Key Features

- **24/7 Operation**: Memory-efficient design for long-term stable operation
- **Auto-Recovery**: Automatic recovery from audio input interruptions and crashes
- **Speaker Diarization**: Speaker identification using pyannote.audio (optional)
- **Flexible File Management**: Raw data every 30 seconds, hourly and daily aggregations
- **Automatic Rotation**: Auto-deletion and gzip compression based on retention policies
- **Resource Monitoring**: CPU/Memory/Disk monitoring with alerting
- **CLI Interface**: Simple service management commands
- **Comprehensive Testing**: 226 tests with 75.43% code coverage

## System Requirements

### Client (Transcription Service)

- **OS**: macOS 10.15+ / Linux (Ubuntu 20.04+ recommended)
- **Node.js**: 18.0.0 or later
- **FFmpeg**: 4.4 or later (for audio capture)
- **BlackHole**: 2ch (macOS virtual audio device)
- **PM2**: Process management
- **Disk Space**: 10GB+ recommended

### Server (WhisperX CUDA)

- **OS**: Linux (Ubuntu 20.04+ recommended) / Windows 10/11
- **Python**: 3.9 - 3.11
- **CUDA**: 11.8 or later (NVIDIA GPU required)
- **cuDNN**: 8.6 or later
- **VRAM**: 4GB+ (medium model), 8GB+ (large model)

For detailed setup instructions, see [CUDA Server Setup Guide](docs/cuda-server-setup.md).

## Installation

### 1. Install Prerequisites

#### macOS

```bash
# Install via Homebrew
brew install node ffmpeg

# Install BlackHole (virtual audio device)
brew install blackhole-2ch

# Install PM2 globally
npm install -g pm2
```

#### Linux

```bash
# Install Node.js
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# Install FFmpeg
sudo apt-get install -y ffmpeg

# Install PM2 globally
sudo npm install -g pm2
```

### 2. Project Setup

```bash
# Clone the repository
git clone https://github.com/your-username/continuous-audio-transcription.git
cd continuous-audio-transcription

# Install dependencies
npm install

# Build
npm run build
```

### 3. Configuration

Create `config.json` in the project root:

```json
{
  "audio": {
    "deviceName": "BlackHole 2ch",
    "sampleRate": 16000,
    "channels": 1,
    "chunkDurationSeconds": 30
  },
  "transcription": {
    "serverUrl": "http://localhost:8000",
    "language": "en",
    "enableDiarization": false,
    "timeout": 300000,
    "retryAttempts": 3,
    "retryDelay": 5000
  },
  "storage": {
    "baseDir": "~/transcriptions",
    "rawRetentionDays": 7,
    "hourlyRetentionDays": 30,
    "compressionAfterDays": 3
  },
  "monitoring": {
    "cpuThresholdPercent": 80,
    "memoryThresholdMB": 2048,
    "diskThresholdGB": 5,
    "errorThresholdPerHour": 10,
    "webhookUrl": ""
  },
  "logging": {
    "level": "info"
  }
}
```

Or copy from example:

```bash
cp config.example.json config.json
# Edit config.json as needed
```

### 4. CUDA Server Setup

Set up a separate WhisperX CUDA server for transcription processing.

See [CUDA Server Setup Guide](docs/cuda-server-setup.md) for detailed instructions.

**Quick Setup with Claude Code (Windows)**:
See [Windows Setup Prompt](docs/windows-setup-prompt.md) for automated setup.

## Usage

### Start the Service

```bash
# Start service in background
transcribe start
```

Output:
```
Transcription service started successfully
PID: 12345
Status: online
```

### Check Status

```bash
# Display status
transcribe status

# Output as JSON
transcribe status --json
```

Output:
```
=== Transcription Service Status ===
Status: online
PID: 12345
Uptime: 2h 15m
Restarts: 0
CPU: 12.3%
Memory: 156.42 MB

=== Health Metrics ===
Last Check: 2025-01-27T10:30:00.000Z
CPU Usage: 12.3%
Memory Usage: 156.42 MB
Disk Free: 45.67 GB
```

### View Logs

```bash
# Show last 100 lines
transcribe logs

# Show last 50 lines
transcribe logs --lines 50

# Follow logs in real-time (like tail -f)
transcribe logs --follow

# Show only errors
transcribe logs --level error
```

### Stop the Service

```bash
# Stop service
transcribe stop
```

## File Structure

```
~/transcriptions/
├── 2025-01-27/
│   ├── raw/                    # Raw transcriptions (every 30 seconds)
│   │   ├── 12-00-00.jsonl
│   │   ├── 12-00-30.jsonl
│   │   └── ...
│   ├── hourly/                 # Hourly aggregations
│   │   ├── 12.txt
│   │   ├── 13.txt
│   │   └── ...
│   └── daily.txt               # Daily summary
├── 2025-01-28/
│   └── ...
└── logs/                       # PM2 logs
    ├── error.log
    ├── out.log
    └── combined.log
```

### File Formats

#### JSONL Format (raw/*.jsonl)

```jsonl
{"timestamp":"2025-01-27T12:00:00.000Z","text":"Hello world","language":"en","segments":[{"start":0.0,"end":1.5,"text":"Hello world"}],"audioFile":"/path/to/audio.wav"}
```

#### Text Format (hourly/*.txt, daily.txt)

```
[2025-01-27 12:00:00] Hello world
[2025-01-27 12:00:30] How are you?
```

## Architecture

### Component Overview

```
┌─────────────────┐
│  Audio Source   │ (Zoom/Discord/System Audio)
└────────┬────────┘
         │
┌────────▼────────┐
│   BlackHole     │ (Virtual Audio Device)
└────────┬────────┘
         │
┌────────▼────────┐
│ Audio Capture   │ (FFmpeg + Buffer Manager)
│   Service       │
└────────┬────────┘
         │
┌────────▼────────┐
│   WhisperX      │ (CUDA Server)
│  CUDA Server    │
└────────┬────────┘
         │
┌────────▼────────┐
│ Transcription   │ (Writer + Aggregator)
│   Processing    │
└────────┬────────┘
         │
┌────────▼────────┐
│ File Management │ (Rotation + Monitoring)
└─────────────────┘
```

### Key Components

- **AudioCaptureService**: FFmpeg-based audio streaming
- **BufferManager**: 30-second audio buffering with memory management
- **CUDAServerClient**: HTTP client for WhisperX API
- **TranscriptionProcessor**: Orchestrates transcription workflow
- **HourlyAggregator / DailyAggregator**: Text file aggregation
- **FileRotator**: Automatic file deletion and compression
- **HealthChecker**: Service health monitoring
- **ResourceMonitor**: System resource monitoring
- **ProcessManager**: Auto-restart management

## Development

### Running Tests

```bash
# Run all tests
npm test

# Watch mode
npm run test:watch

# Generate coverage report
npm run test:coverage
```

### Code Quality

```bash
# Run linter
npm run lint

# Auto-fix lint issues
npm run lint:fix

# Check formatting
npm run format:check

# Auto-format code
npm run format
```

### Project Structure

```
continuous-audio-transcription/
├── src/
│   ├── cli/              # CLI commands (start/stop/status/logs)
│   ├── services/         # Core services
│   ├── types/            # TypeScript type definitions
│   └── utils/            # Utility functions
├── docs/                 # Documentation
├── .kiro/                # Spec-driven development specs
└── tests/                # Test files (*.test.ts)
```

## Troubleshooting

### Service Won't Start

1. **Check if CUDA server is running**
   ```bash
   curl http://localhost:8000/health
   ```

2. **Check PM2 processes**
   ```bash
   pm2 list
   pm2 logs continuous-transcription
   ```

3. **Verify configuration**
   - Check `config.json` format
   - Verify audio device name is correct

### Audio Not Captured

1. **Check BlackHole device**
   ```bash
   ffmpeg -f avfoundation -list_devices true -i ""
   ```

2. **Verify LadioCast settings**
   - Input: Microphone + System Audio
   - Output: BlackHole 2ch + Speakers

### Memory Usage Increasing

1. **Restart the service**
   ```bash
   transcribe stop
   transcribe start
   ```

2. **Adjust configuration**
   - Reduce `chunkDurationSeconds` (default: 30)
   - Reduce `rawRetentionDays` (default: 7)

### Low Transcription Accuracy

1. **Check audio quality**
   - Sample rate: 16000Hz recommended
   - Consider audio filters for noisy environments

2. **Switch WhisperX model**
   - Use large model on CUDA server (requires 8GB+ VRAM)

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Acknowledgments

- [WhisperX](https://github.com/m-bain/whisperx) - Fast automatic speech recognition
- [pyannote.audio](https://github.com/pyannote/pyannote-audio) - Speaker diarization
- [BlackHole](https://existential.audio/blackhole/) - Virtual audio driver for macOS
- [FFmpeg](https://ffmpeg.org/) - Multimedia framework

## Related Documentation

- [CUDA Server Setup Guide](docs/cuda-server-setup.md) - WhisperX CUDA server setup
- [Windows Setup with Claude Code](docs/windows-setup-prompt.md) - Automated Windows setup
- [Quick Start Guide](SETUP.md) - Quick setup instructions

## Support

For issues and questions:
- Create an [Issue](https://github.com/your-username/continuous-audio-transcription/issues)
- Check existing [Discussions](https://github.com/your-username/continuous-audio-transcription/discussions)

---

🤖 Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude <noreply@anthropic.com>
