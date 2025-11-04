@echo off
call whisperx-env\Scripts\activate.bat
python cuda-server\server.py
pause
