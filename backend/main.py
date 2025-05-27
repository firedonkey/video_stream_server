from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from app.video_stream import video_manager
import asyncio
import logging
import time
import sys

# Configure logging to show timestamps and log level
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s',
    stream=sys.stdout
)
logger = logging.getLogger(__name__)

app = FastAPI(title="Video Stream Server API")

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # In production, replace with specific origins
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/")
async def root():
    return {"message": "Welcome to Video Stream Server API"}

@app.get("/health")
async def health_check():
    return {"status": "healthy"}

@app.websocket("/ws/video")
async def websocket_video_endpoint(websocket: WebSocket):
    await video_manager.connect(websocket)
    logger.info("New client connected to video stream")
    
    frame_count = 0
    start_time = time.time()
    last_log_time = start_time
    
    try:
        while True:
            # Receive video frame data
            frame_data = await websocket.receive_bytes()
            frame_count += 1
            
            # Log every second
            current_time = time.time()
            if current_time - last_log_time >= 1.0:
                elapsed_time = current_time - start_time
                fps = frame_count / elapsed_time
                logger.info(f"Stream Stats - FPS: {fps:.2f}, Total frames: {frame_count}, Frame size: {len(frame_data)} bytes")
                last_log_time = current_time
            
            # Process the frame
            processed_frame = video_manager.process_frame(frame_data)
            
            # Broadcast the frame to all connected clients
            await video_manager.broadcast_frame(frame_data)
            
    except WebSocketDisconnect:
        logger.info("Client disconnected from video stream")
        video_manager.disconnect(websocket)
    except Exception as e:
        logger.error(f"Error in video stream: {str(e)}")
        video_manager.disconnect(websocket) 