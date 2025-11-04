"""
Transcription Server - Main Application
文字起こしサーバー - メインアプリケーション
"""

from datetime import datetime
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from routers import transcribe, deployment

# Create FastAPI application
app = FastAPI(
    title="Transcription Server",
    version="0.1.0",
    description="24時間連続音声文字起こしシステム - CUDA Server",
)

# Configure CORS for LAN access
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Allow all origins in LAN
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routers
app.include_router(transcribe.router, tags=["transcription"])
app.include_router(deployment.router, tags=["deployment"])


@app.get("/health")
async def health_check():
    """
    Health check endpoint
    ヘルスチェックエンドポイント
    """
    return {
        "status": "ok",
        "timestamp": datetime.now().isoformat(),
    }
