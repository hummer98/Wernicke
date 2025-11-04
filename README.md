# Wernicke

[日本語](README.ja.md) | **English**

A comprehensive suite for continuous audio transcription and processing.

## Projects

### 📝 [continuous-audio-transcription](continuous-audio-transcription/)

24/7 Continuous Audio Transcription System with BlackHole + WhisperX + Speaker Diarization

**Key Features:**
- 24/7 audio capture and transcription
- Memory-efficient design for long-term operation
- Auto-recovery from interruptions
- Speaker diarization (optional)
- Automatic file rotation and compression
- Resource monitoring and alerting
- CLI interface for service management

**Tech Stack:** TypeScript, Node.js, FFmpeg, PM2

[Documentation](continuous-audio-transcription/README.md) | [Quick Setup](continuous-audio-transcription/SETUP.md)

### 🖥️ [transcription-server](transcription-server/)

WhisperX CUDA Server for high-performance speech recognition

**Key Features:**
- FastAPI-based REST API
- CUDA-accelerated transcription
- Speaker diarization support
- Multi-language support
- Batch processing

**Tech Stack:** Python, FastAPI, WhisperX, PyTorch, CUDA

[Documentation](transcription-server/README.md)

## Quick Start

### 1. Clone Repository

```bash
git clone https://github.com/your-username/Wernicke.git
cd Wernicke
```

### 2. Setup Transcription Service

```bash
cd continuous-audio-transcription
npm install
npm run build
cp config.example.json config.json
# Edit config.json as needed
```

### 3. Setup CUDA Server

```bash
cd transcription-server
# Follow setup instructions in docs/
```

See individual project READMEs for detailed setup instructions.

## System Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     Wernicke System                          │
├─────────────────────────────────────────────────────────────┤
│                                                               │
│  ┌──────────────────────────┐  ┌──────────────────────────┐ │
│  │ Continuous Audio         │  │ Transcription Server     │ │
│  │ Transcription            │  │ (WhisperX CUDA)          │ │
│  │                          │  │                          │ │
│  │ - Audio Capture          │  │ - FastAPI Server         │ │
│  │ - Buffer Management      │◄─┤ - WhisperX Engine       │ │
│  │ - File Processing        │  │ - Speaker Diarization    │ │
│  │ - CLI Interface          │  │ - Multi-language         │ │
│  │                          │  │                          │ │
│  │ Tech: TypeScript/Node.js │  │ Tech: Python/PyTorch     │ │
│  └──────────────────────────┘  └──────────────────────────┘ │
│                                                               │
└─────────────────────────────────────────────────────────────┘
```

## Features

### Continuous Audio Transcription
- ✅ 24/7 continuous operation
- ✅ Auto-recovery from errors
- ✅ Memory-efficient buffering
- ✅ Automatic file rotation
- ✅ Health monitoring
- ✅ CLI management

### Transcription Server
- ✅ CUDA-accelerated processing
- ✅ RESTful API
- ✅ Speaker diarization
- ✅ Multiple language support
- ✅ Batch processing

## System Requirements

### For Continuous Audio Transcription
- macOS 10.15+ or Linux (Ubuntu 20.04+)
- Node.js 18+
- FFmpeg 4.4+
- BlackHole 2ch (macOS) or equivalent
- 10GB+ disk space

### For Transcription Server
- Linux (Ubuntu 20.04+) or Windows 10/11
- Python 3.9-3.11
- NVIDIA GPU with 4GB+ VRAM
- CUDA 11.8+
- cuDNN 8.6+

## Documentation

- [Continuous Audio Transcription Docs](continuous-audio-transcription/README.md)
- [CUDA Server Setup Guide](continuous-audio-transcription/docs/cuda-server-setup.md)
- [Windows Setup with Claude Code](continuous-audio-transcription/docs/windows-setup-prompt.md)
- [Contributing Guidelines](CONTRIBUTING.md)

## Development

This is a monorepo containing multiple related projects. Each project has its own:
- Documentation
- Tests
- Build configuration
- Dependencies

### Testing

```bash
# Test continuous-audio-transcription
cd continuous-audio-transcription
npm test

# Test transcription-server
cd transcription-server
pytest
```

### Code Quality

```bash
# Lint continuous-audio-transcription
cd continuous-audio-transcription
npm run lint

# Lint transcription-server
cd transcription-server
flake8 .
```

## Contributing

Contributions are welcome! Please see [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Acknowledgments

- [WhisperX](https://github.com/m-bain/whisperx) - Fast automatic speech recognition
- [pyannote.audio](https://github.com/pyannote/pyannote-audio) - Speaker diarization
- [BlackHole](https://existential.audio/blackhole/) - Virtual audio driver
- [FFmpeg](https://ffmpeg.org/) - Multimedia framework

---

🤖 Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude <noreply@anthropic.com>
