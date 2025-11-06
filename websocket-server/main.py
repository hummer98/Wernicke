"""
WebSocket Real-time Transcription Server
Windows Server (Python/FastAPI)

Task 1.1: FastAPI WebSocket Endpoint Setup
Task 14.1: Health Check Endpoint with GPU VRAM and Session Info
Requirements: R1.1
"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from routers import websocket_transcribe
import logging

# Logging configuration
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Create FastAPI application
app = FastAPI(
    title="Wernicke WebSocket Transcription Server",
    description="WebSocket-based real-time transcription server",
    version="0.1.0"
)

# CORS configuration (for development)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Restrict appropriately in production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Register WebSocket router
app.include_router(websocket_transcribe.router)

# Health check endpoint with GPU VRAM and session info (Task 14.1)
@app.get("/health")
async def health_check():
    """
    Health check endpoint
    Task 14.1: サーバー側ヘルスチェックエンドポイント

    Returns:
        - 200 OK: Service is healthy (GPU available)
        - 503 Service Unavailable: Service is unhealthy (GPU unavailable)

    Response includes:
        - status: "healthy" or "unhealthy"
        - active_sessions: Number of active WebSocket connections
        - gpu_vram_used_mb: GPU VRAM usage in MB (if GPU available)
        - gpu_vram_total_mb: Total GPU VRAM in MB (if GPU available)
        - reason: Reason for unhealthy status (if unhealthy)
    """
    try:
        import torch

        # Check GPU availability
        is_gpu_available = torch.cuda.is_available()

        if not is_gpu_available:
            # GPU unavailable - return 503 Service Unavailable
            return JSONResponse(
                status_code=503,
                content={
                    "status": "unhealthy",
                    "reason": "GPU/CUDA is not available",
                    "active_sessions": websocket_transcribe.get_active_sessions_count(),
                }
            )

        # Get GPU VRAM information
        free_vram_bytes, total_vram_bytes = torch.cuda.mem_get_info()
        used_vram_bytes = total_vram_bytes - free_vram_bytes

        # Convert bytes to MB
        gpu_vram_used_mb = used_vram_bytes / (1024 ** 2)
        gpu_vram_total_mb = total_vram_bytes / (1024 ** 2)

        # Get active sessions count
        active_sessions = websocket_transcribe.get_active_sessions_count()

        # Return 200 OK with full health information
        return {
            "status": "healthy",
            "active_sessions": active_sessions,
            "gpu_vram_used_mb": gpu_vram_used_mb,
            "gpu_vram_total_mb": gpu_vram_total_mb,
        }

    except Exception as e:
        # Unexpected error - return 503 Service Unavailable
        logger.error(f"Health check error: {str(e)}", exc_info=True)
        return JSONResponse(
            status_code=503,
            content={
                "status": "unhealthy",
                "reason": f"Health check error: {str(e)}",
                "active_sessions": websocket_transcribe.get_active_sessions_count(),
            }
        )


if __name__ == "__main__":
    import uvicorn

    logger.info("Starting Wernicke WebSocket Transcription Server...")
    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=8000,
        reload=True,  # Development mode
        log_level="info"
    )
