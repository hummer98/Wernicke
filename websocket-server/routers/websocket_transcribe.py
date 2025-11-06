"""
WebSocket Transcription Endpoint
Task 1.1: FastAPI WebSocket Endpoint Setup
Task 4.2: Partial Results WebSocket Transmission
Task 8.2: Final Results WebSocket Transmission
Requirements: R1.1, R3.1, R5.1, R3.2, R5.2
"""

import uuid
import asyncio
from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from typing import Dict, Any
import logging
from services.transcription_session import TranscriptionSession
from utils.audio_validator import validate_audio_chunk

# Logging configuration
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

router = APIRouter()

# GPU Pipeline will be initialized on server startup
# For now, we'll create a placeholder for it
gpu_pipeline = None

# Active WebSocket sessions tracking (Task 14.1)
active_sessions: Dict[str, WebSocket] = {}


def set_gpu_pipeline(pipeline):
    """Set GPU pipeline instance (called from main.py on startup)"""
    global gpu_pipeline
    gpu_pipeline = pipeline


def get_active_sessions_count() -> int:
    """Get the number of active WebSocket sessions (Task 14.1)"""
    return len(active_sessions)


async def process_and_send_final_result(
    websocket: WebSocket,
    gpu_pipeline,
    audio_data: bytes,
    buffer_id: str,
    buffer_start_time: float
):
    """
    Process final result in background and send to client

    Task 8.2: Final Results WebSocket Transmission

    Args:
        websocket: WebSocket connection
        gpu_pipeline: GPU pipeline instance
        audio_data: Raw audio bytes
        buffer_id: Buffer identifier
        buffer_start_time: Buffer start timestamp
    """
    try:
        # Process final result (full pipeline: Whisper → Alignment → Diarization → LLM)
        final_result = await gpu_pipeline.process_final(
            audio_data=audio_data,
            buffer_id=buffer_id,
            buffer_start_time=buffer_start_time
        )

        # Send final result to client
        await websocket.send_json(final_result)
        logger.info(f"Final result sent: buffer_id={buffer_id}")

    except Exception as e:
        logger.error(f"Final processing error: {str(e)}", exc_info=True)
        try:
            await websocket.send_json({
                "type": "error",
                "code": 500,
                "message": f"Final processing error: {str(e)}"
            })
        except Exception as send_error:
            logger.error(f"Failed to send error message: {str(send_error)}")


@router.websocket("/transcribe")
async def websocket_endpoint(websocket: WebSocket):
    """
    WebSocket transcription endpoint

    Connection flow:
    1. Accept WebSocket connection
    2. Generate session ID and create TranscriptionSession
    3. Send connection established message
    4. Audio data receive loop with buffering
    5. Process partial results when buffer should flush
    6. Cleanup on disconnect
    """
    # Generate session ID
    session_id = str(uuid.uuid4())

    # Create transcription session
    session = TranscriptionSession()

    try:
        # Accept WebSocket connection
        await websocket.accept()
        logger.info(f"WebSocket connection established: session_id={session_id}")

        # Track active session (Task 14.1)
        active_sessions[session_id] = websocket

        # Handshake: Send connection established message
        await websocket.send_json({
            "type": "connection_established",
            "message": "WebSocket connection established",
            "session_id": session_id
        })

        # Audio data receive loop
        while True:
            try:
                # Receive message (binary or text)
                message = await websocket.receive()

                # Determine message type
                if "bytes" in message:
                    # Binary data (audio chunk) received
                    audio_data = message["bytes"]
                    logger.debug(f"Audio data received: {len(audio_data)} bytes")

                    # Task 18.1: Validate audio format and size
                    is_valid, error_response = validate_audio_chunk(audio_data)
                    if not is_valid:
                        # Send validation error to client
                        await websocket.send_json(error_response)
                        logger.warning(f"Audio validation failed: {error_response['message']}")
                        continue

                    # Add audio chunk to session buffer
                    session.add_audio_chunk(audio_data)

                    # Send acknowledgment
                    await websocket.send_json({
                        "type": "audio_received",
                        "bytes_received": len(audio_data)
                    })

                    # Check if buffer should be flushed
                    if session.should_flush():
                        logger.info("Buffer flush triggered")

                        # Get buffer data
                        buffer_audio, buffer_id = await session.flush()
                        buffer_start_time = session.get_buffer_start_time()

                        # Process partial results (if GPU pipeline is available)
                        if gpu_pipeline:
                            try:
                                # Process and send partial result
                                partial_result = await gpu_pipeline.process_partial(
                                    audio_data=buffer_audio,
                                    buffer_id=buffer_id,
                                    buffer_start_time=buffer_start_time
                                )

                                # Send partial result to client
                                await websocket.send_json(partial_result)
                                logger.info(f"Partial result sent: buffer_id={buffer_id}")

                                # Start final processing in background (Task 8.2)
                                asyncio.create_task(
                                    process_and_send_final_result(
                                        websocket=websocket,
                                        gpu_pipeline=gpu_pipeline,
                                        audio_data=buffer_audio,
                                        buffer_id=buffer_id,
                                        buffer_start_time=buffer_start_time
                                    )
                                )
                                logger.info(f"Final processing started in background: buffer_id={buffer_id}")

                            except Exception as e:
                                logger.error(f"Partial processing error: {str(e)}", exc_info=True)
                                await websocket.send_json({
                                    "type": "error",
                                    "code": 500,
                                    "message": f"Transcription error: {str(e)}"
                                })
                        else:
                            logger.warning("GPU pipeline not available, skipping transcription")

                elif "text" in message:
                    # Text message received (invalid data format)
                    logger.warning(f"Invalid message format: text={message['text']}")

                    # Send error message
                    await websocket.send_json({
                        "type": "error",
                        "code": 400,
                        "message": "Invalid message format. Expected binary audio data."
                    })

            except WebSocketDisconnect:
                # Client disconnected normally
                logger.info(f"WebSocket disconnected: session_id={session_id}")
                break

            except Exception as e:
                # Server internal error
                logger.error(f"Server error: {str(e)}", exc_info=True)

                # Send error message
                await websocket.send_json({
                    "type": "error",
                    "code": 500,
                    "message": f"Internal server error: {str(e)}"
                })
                break

    except Exception as e:
        # Error before connection established
        logger.error(f"Connection error: {str(e)}", exc_info=True)

    finally:
        # Cleanup
        logger.info(f"Cleanup executed: session_id={session_id}")

        # Remove session from active sessions (Task 14.1)
        if session_id in active_sessions:
            del active_sessions[session_id]

        # Session buffer is automatically cleaned up when session goes out of scope
