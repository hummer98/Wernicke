"""
WebSocket Communication Handler
Handles WebSocket message transmission and reception logic
"""

import asyncio
import logging
from typing import Dict, Any, Optional
from fastapi import WebSocket

logger = logging.getLogger(__name__)


class WebSocketHandler:
    """
    WebSocket communication handler for transcription sessions

    Responsibilities:
    - Send/receive messages via WebSocket
    - Handle connection lifecycle
    - Format and log messages
    """

    def __init__(self, websocket: WebSocket, session_id: str):
        """
        Initialize WebSocket handler

        Args:
            websocket: FastAPI WebSocket connection
            session_id: Unique session identifier
        """
        self.websocket = websocket
        self.session_id = session_id
        self.is_connected = False

    async def accept(self) -> None:
        """Accept WebSocket connection"""
        await self.websocket.accept()
        self.is_connected = True
        logger.info(f"WebSocket connection established: session_id={self.session_id}")

    async def send_connection_established(self) -> None:
        """Send connection established handshake message"""
        await self.send_json({
            "type": "connection_established",
            "message": "WebSocket connection established",
            "session_id": self.session_id
        })

    async def send_json(self, data: Dict[str, Any]) -> None:
        """
        Send JSON message to client

        Args:
            data: Dictionary to send as JSON
        """
        if not self.is_connected:
            logger.warning(f"Attempted to send message on closed connection: session_id={self.session_id}")
            return

        try:
            await self.websocket.send_json(data)
        except Exception as e:
            logger.error(f"Failed to send JSON message: {str(e)}", exc_info=True)
            self.is_connected = False
            raise

    async def send_audio_received_ack(self, bytes_received: int) -> None:
        """
        Send audio received acknowledgment

        Args:
            bytes_received: Number of bytes received
        """
        await self.send_json({
            "type": "audio_received",
            "bytes_received": bytes_received
        })

    async def send_partial_result(self, result: Dict[str, Any]) -> None:
        """
        Send partial transcription result to client

        Args:
            result: Partial result dictionary from GPU pipeline
        """
        await self.send_json(result)

        # Log text sent to client (first 100 chars)
        text = result.get('text', '')
        buffer_id = result.get('buffer_id', 'unknown')
        logger.info(f"Partial result sent: buffer_id={buffer_id}, text='{text[:100]}...'")

    async def send_final_result(self, result: Dict[str, Any]) -> None:
        """
        Send final transcription result to client

        Args:
            result: Final result dictionary from GPU pipeline
        """
        await self.send_json(result)

        # Log text sent to client (first 100 chars)
        text = result.get('text', '')
        buffer_id = result.get('buffer_id', 'unknown')
        logger.info(f"Final result sent: buffer_id={buffer_id}, text='{text[:100]}...'")

    async def send_error(self, code: int, message: str) -> None:
        """
        Send error message to client

        Args:
            code: Error code
            message: Error message
        """
        try:
            await self.send_json({
                "type": "error",
                "code": code,
                "message": message
            })
        except Exception as e:
            logger.error(f"Failed to send error message: {str(e)}")

    async def send_validation_error(self, error_response: Dict[str, Any]) -> None:
        """
        Send validation error to client

        Args:
            error_response: Error response dictionary from validator
        """
        await self.send_json(error_response)
        logger.warning(f"Audio validation failed: {error_response['message']}")

    async def receive_message(self) -> Dict[str, Any]:
        """
        Receive message from client

        Returns:
            Message dictionary with 'bytes' or 'text' or 'type' key

        Raises:
            WebSocketDisconnect: If client disconnects
        """
        message = await self.websocket.receive()
        return message

    def close(self) -> None:
        """Mark connection as closed"""
        self.is_connected = False
        logger.info(f"WebSocket connection closed: session_id={self.session_id}")


async def process_and_send_final_result(
    handler: WebSocketHandler,
    gpu_pipeline,
    audio_data: bytes,
    buffer_id: str,
    buffer_start_time: float
):
    """
    Process final result in background and send to client

    Args:
        handler: WebSocketHandler instance
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
        await handler.send_final_result(final_result)

    except Exception as e:
        logger.error(f"Final processing error: {str(e)}", exc_info=True)
        await handler.send_error(500, f"Final processing error: {str(e)}")
