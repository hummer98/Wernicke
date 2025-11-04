#!/bin/bash
#
# Transcription Server Startup Script
# 文字起こしサーバー起動スクリプト
#

# Set timeout to 70 seconds to handle long transcription requests
uvicorn main:app --host 0.0.0.0 --port 8000 --timeout-keep-alive 70
