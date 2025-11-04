# Quick Setup with Claude Code

## For Windows Users

After cloning this repository, follow these steps:

### 1. Open Claude Code

Open Claude Code in the project directory:

```powershell
cd continuous-audio-transcription
code .
```

### 2. Run Automated Setup

In Claude Code, paste this prompt:

```
Please read and execute the setup instructions in docs/windows-setup-prompt.md to set up the WhisperX CUDA server on my Windows machine. Execute all tasks automatically, but ask for my confirmation at key checkpoints. Show clear progress for each step.
```

### 3. What the Setup Does

Claude Code will automatically:
- ✅ Verify prerequisites (Python, CUDA, Git)
- ✅ Create Python virtual environment
- ✅ Install PyTorch with CUDA support
- ✅ Install WhisperX and dependencies
- ✅ Install FastAPI server
- ✅ Optionally install pyannote.audio for speaker diarization
- ✅ Create server configuration file
- ✅ Generate FastAPI server code
- ✅ Create startup scripts (.ps1 and .bat)
- ✅ Configure Windows Firewall
- ✅ Run setup tests
- ✅ Generate documentation

### 4. Expected Time

- Initial setup: 10-20 minutes
- Model download (first run): 5-15 minutes

### 5. After Setup

Start the server:
```powershell
.\cuda-server\start-server.ps1
```

Or double-click: `cuda-server\start-server.bat`

Test the server:
```powershell
curl http://localhost:8000/health
```

---

## For macOS/Linux Users

### Quick Setup

```bash
# Install prerequisites
brew install node ffmpeg  # macOS
# or
sudo apt-get install nodejs ffmpeg  # Linux

# Install BlackHole (macOS only)
brew install blackhole-2ch

# Install PM2
npm install -g pm2

# Install Node.js dependencies
npm install
npm run build

# Create config.json (see README.md for details)
cp config.example.json config.json

# Start the service
transcribe start
```

### CUDA Server Setup

For the CUDA server setup on Linux, use Claude Code with:

```
Please help me set up the WhisperX CUDA server on Linux following docs/cuda-server-setup.md. Guide me through each step with clear instructions.
```

---

## Troubleshooting

If you encounter issues during setup:

1. **Check Prerequisites**
   ```powershell
   python --version    # Should be 3.9-3.11
   nvidia-smi          # Should show GPU info
   git --version       # Should show Git version
   ```

2. **CUDA Issues**
   - Ensure NVIDIA drivers are up to date
   - Verify CUDA Toolkit is installed
   - Check `nvidia-smi` output

3. **Python Issues**
   - Use Python 3.9-3.11 (not 3.12)
   - Ensure virtual environment is activated
   - Try: `pip install --upgrade pip setuptools wheel`

4. **Network Issues**
   - Check firewall settings
   - Verify port 8000 is not in use
   - Test with: `netstat -an | findstr 8000`

5. **Ask Claude Code**
   Simply describe the error to Claude Code and it will help troubleshoot.

---

## Manual Setup

If you prefer manual setup, follow:
- **Windows CUDA Server**: [docs/cuda-server-setup.md](docs/cuda-server-setup.md)
- **Client Setup**: [README.md](README.md)

---

## Support

For issues or questions:
1. Check [README.md](README.md) for general documentation
2. Check [docs/cuda-server-setup.md](docs/cuda-server-setup.md) for CUDA setup
3. Review error messages in setup logs
4. Use Claude Code for interactive troubleshooting
