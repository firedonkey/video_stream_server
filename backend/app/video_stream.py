import asyncio
import logging
import time
import sys
from fastapi import WebSocket, WebSocketDisconnect
from starlette.websockets import WebSocketState

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s',
    stream=sys.stdout
)
logger = logging.getLogger(__name__)

class VideoStream:
    def __init__(self):
        self.active_connections = set()
        self.frame_count = 0
        self.start_time = time.time()
        self.last_log_time = self.start_time
        self.ping_interval = 30  # Increase ping interval to reduce overhead
        self.ping_timeout = 40   # Increase timeout accordingly

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.add(websocket)
        logger.info(f"New client connected. Total connections: {len(self.active_connections)}")

    def disconnect(self, websocket: WebSocket):
        if websocket in self.active_connections:
            self.active_connections.remove(websocket)
            logger.info(f"Client disconnected. Total connections: {len(self.active_connections)}")

    async def broadcast_frame(self, frame_data: bytes):
        if not self.active_connections:
            return

        # Log frame statistics less frequently
        self.frame_count += 1
        current_time = time.time()
        if current_time - self.last_log_time >= 5.0:  # Log every 5 seconds
            elapsed_time = current_time - self.start_time
            fps = self.frame_count / elapsed_time
            logger.info(f"Stream Stats - FPS: {fps:.2f}, Total frames: {self.frame_count}, Frame size: {len(frame_data)} bytes")
            self.last_log_time = current_time

        # Broadcast to all connected clients
        disconnected_clients = set()
        for connection in self.active_connections:
            try:
                if connection.client_state == WebSocketState.CONNECTED:
                    await connection.send_bytes(frame_data)
                else:
                    disconnected_clients.add(connection)
            except Exception as e:
                logger.error(f"Error sending frame to client: {str(e)}")
                disconnected_clients.add(connection)

        # Remove disconnected clients
        for client in disconnected_clients:
            self.disconnect(client)

    async def handle_websocket(self, websocket: WebSocket):
        try:
            await self.connect(websocket)
            last_ping = time.time()
            
            while True:
                try:
                    # Set a timeout for receiving messages
                    message = await asyncio.wait_for(
                        websocket.receive(),
                        timeout=self.ping_interval
                    )
                    
                    # Reset ping timer when we receive data
                    last_ping = time.time()
                    
                    # Handle different message types
                    if isinstance(message, dict):
                        if message.get("type") == "websocket.receive.text":
                            if message.get("text") == "pong":
                                logger.debug("Received pong from client")
                                continue
                        elif message.get("type") == "websocket.receive.bytes":
                            # Broadcast the frame to all connected clients
                            await self.broadcast_frame(message["bytes"])
                        elif message.get("type") == "websocket.receive":
                            # Handle raw WebSocket messages
                            if isinstance(message.get("text"), str):
                                if message["text"] == "pong":
                                    logger.debug("Received pong from client")
                                    continue
                            elif isinstance(message.get("bytes"), bytes):
                                await self.broadcast_frame(message["bytes"])
                        else:
                            logger.warning(f"Received unknown message type: {message.get('type')}")
                    else:
                        logger.warning(f"Received unexpected message format: {type(message)}")
                    
                except asyncio.TimeoutError:
                    # Check if we need to send a ping
                    current_time = time.time()
                    if current_time - last_ping >= self.ping_interval:
                        try:
                            if websocket.client_state == WebSocketState.CONNECTED:
                                await websocket.send_text("ping")
                                last_ping = current_time
                        except Exception as e:
                            logger.error(f"Error sending ping: {str(e)}")
                            break
                    
                except WebSocketDisconnect:
                    logger.info("Client disconnected from video stream")
                    self.disconnect(websocket)
                    break
                    
                except Exception as e:
                    logger.error(f"Error processing frame: {str(e)}")
                    self.disconnect(websocket)
                    break
                    
        except Exception as e:
            logger.error(f"Error in WebSocket connection: {str(e)}")
            self.disconnect(websocket)

video_manager = VideoStream() 