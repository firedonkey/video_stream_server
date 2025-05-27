import cv2
import numpy as np
from fastapi import WebSocket
from typing import List
import asyncio
import base64

class VideoStreamManager:
    def __init__(self):
        self.active_connections: List[WebSocket] = []
        self.frame_buffer = None

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.append(websocket)

    def disconnect(self, websocket: WebSocket):
        self.active_connections.remove(websocket)

    async def broadcast_frame(self, frame_data: bytes):
        if self.active_connections:
            # Convert frame to base64 for transmission
            encoded_frame = base64.b64encode(frame_data).decode('utf-8')
            for connection in self.active_connections:
                try:
                    await connection.send_text(encoded_frame)
                except:
                    await self.disconnect(connection)

    def process_frame(self, frame_data: bytes):
        # Convert bytes to numpy array
        nparr = np.frombuffer(frame_data, np.uint8)
        frame = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
        
        # Store the frame in buffer
        self.frame_buffer = frame
        
        # Here you can add any additional processing you need
        # For example: object detection, motion detection, etc.
        
        return frame

video_manager = VideoStreamManager() 