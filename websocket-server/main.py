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
from services.gpu_pipeline import GPUPipeline
import logging
import os
from datetime import datetime

# Create logs directory if it doesn't exist
log_dir = os.path.join(os.path.dirname(__file__), 'logs')
os.makedirs(log_dir, exist_ok=True)

# Create log file with timestamp
log_filename = datetime.now().strftime('server_%Y%m%d_%H%M%S.log')
log_filepath = os.path.join(log_dir, log_filename)

# Logging configuration with file and console handlers
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    datefmt='%Y-%m-%d %H:%M:%S',
    handlers=[
        logging.FileHandler(log_filepath, encoding='utf-8'),
        logging.StreamHandler()
    ]
)
logger = logging.getLogger(__name__)

# Note: uvicorn logging will be configured via log_config parameter in uvicorn.run()
# to avoid duplicate log entries

# Create FastAPI application
app = FastAPI(
    title="Wernicke WebSocket Transcription Server",
    description="WebSocket-based real-time transcription server",
    version="0.1.0"
)

# GPU Pipeline instance (initialized on startup)
gpu_pipeline_instance = None

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


@app.on_event("startup")
async def startup_event():
    """
    Initialize GPU Pipeline on server startup
    """
    global gpu_pipeline_instance

    try:
        logger.info("Initializing GPU Pipeline...")
        gpu_pipeline_instance = GPUPipeline()
        websocket_transcribe.set_gpu_pipeline(gpu_pipeline_instance)
        logger.info("GPU Pipeline initialized successfully")
    except Exception as e:
        logger.error(f"Failed to initialize GPU Pipeline: {str(e)}", exc_info=True)
        logger.warning("Server will continue without GPU Pipeline - transcription will be disabled")


@app.on_event("shutdown")
async def shutdown_event():
    """
    Cleanup GPU Pipeline on server shutdown
    """
    global gpu_pipeline_instance

    if gpu_pipeline_instance:
        try:
            logger.info("Cleaning up GPU Pipeline...")
            gpu_pipeline_instance.cleanup()
            logger.info("GPU Pipeline cleanup complete")
        except Exception as e:
            logger.error(f"Error during GPU Pipeline cleanup: {str(e)}", exc_info=True)

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
            logger.warning("Health check: GPU/CUDA is not available")
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

        # Log health check
        logger.info(f"Health check: status=healthy, active_sessions={active_sessions}, gpu_vram_used={gpu_vram_used_mb:.2f}MB/{gpu_vram_total_mb:.2f}MB")

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
    import copy

    # Log server startup/restart banner
    logger.info("=" * 80)
    logger.info("SERVER STARTUP/RESTART")
    logger.info(f"Timestamp: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    logger.info(f"Log file: {log_filepath}")
    logger.info(f"Working directory: {os.getcwd()}")
    logger.info("=" * 80)

    logger.info("Starting Wernicke WebSocket Transcription Server...")

    # Configure uvicorn logging with timestamps and file output
    log_config = copy.deepcopy(uvicorn.config.LOGGING_CONFIG)

    # Update formatters
    log_config["formatters"]["default"]["fmt"] = "%(asctime)s - %(name)s - %(levelname)s - %(message)s"
    log_config["formatters"]["default"]["datefmt"] = "%Y-%m-%d %H:%M:%S"
    log_config["formatters"]["access"]["fmt"] = "%(asctime)s - %(name)s - %(levelname)s - %(message)s"
    log_config["formatters"]["access"]["datefmt"] = "%Y-%m-%d %H:%M:%S"

    # Add file handlers to uvicorn loggers
    log_config["handlers"]["file"] = {
        "class": "logging.FileHandler",
        "filename": log_filepath,
        "formatter": "default",
        "encoding": "utf-8"
    }
    log_config["handlers"]["access_file"] = {
        "class": "logging.FileHandler",
        "filename": log_filepath,
        "formatter": "access",
        "encoding": "utf-8"
    }

    # Update loggers to use file handlers
    log_config["loggers"]["uvicorn"]["handlers"] = ["default", "file"]
    log_config["loggers"]["uvicorn"]["propagate"] = False
    log_config["loggers"]["uvicorn.error"]["handlers"] = ["default", "file"]
    log_config["loggers"]["uvicorn.error"]["propagate"] = False
    log_config["loggers"]["uvicorn.access"]["handlers"] = ["access", "access_file"]
    log_config["loggers"]["uvicorn.access"]["propagate"] = False

    # Add application loggers (services, routers, main)
    log_config["loggers"]["services"] = {
        "handlers": ["default", "file"],
        "level": "INFO",
        "propagate": False
    }
    log_config["loggers"]["routers"] = {
        "handlers": ["default", "file"],
        "level": "INFO",
        "propagate": False
    }
    log_config["loggers"]["__main__"] = {
        "handlers": ["default", "file"],
        "level": "INFO",
        "propagate": False
    }
    log_config["loggers"]["main"] = {
        "handlers": ["default", "file"],
        "level": "INFO",
        "propagate": False
    }

    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=8000,
        reload=False,  # Disable reload to prevent duplicate logs
        log_level="info",
        log_config=log_config
    )
