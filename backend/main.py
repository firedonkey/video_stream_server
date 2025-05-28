from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from app.video_stream import VideoStream, video_manager
from app.auth import router as auth_router
import uvicorn
import logging
import sys
import os

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s',
    stream=sys.stdout
)
logger = logging.getLogger(__name__)

app = FastAPI()

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Allows all origins
    allow_credentials=True,
    allow_methods=["*"],  # Allows all methods
    allow_headers=["*"],  # Allows all headers
)

# Include authentication router
app.include_router(auth_router)

# Initialize video stream handler
video_stream = VideoStream()

# Get the absolute path to the frontend directory
frontend_dir = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), "frontend")
logger.info(f"Frontend directory path: {frontend_dir}")

# Mount static files for both local and remote
app.mount("/static", StaticFiles(directory=frontend_dir), name="static")

@app.get("/")
async def get_index():
    return FileResponse(os.path.join(frontend_dir, "index.html"))

@app.get("/index.html")
async def get_index_html():
    return FileResponse(os.path.join(frontend_dir, "index.html"))

@app.get("/app.js")
async def get_app_js():
    return FileResponse(os.path.join(frontend_dir, "app.js"))

@app.websocket("/ws/video")
async def websocket_endpoint(websocket: WebSocket):
    client_info = f"{websocket.client.host}:{websocket.client.port}"
    logger.info(f"New WebSocket connection request from {client_info}")
    try:
        await video_manager.handle_websocket(websocket)
        logger.info(f"WebSocket connection closed normally for {client_info}")
    except WebSocketDisconnect:
        logger.info(f"WebSocket disconnected for {client_info}")
    except Exception as e:
        logger.error(f"Error in WebSocket endpoint for {client_info}: {str(e)}")
        try:
            await websocket.close()
        except:
            pass

@app.get("/health")
async def health_check():
    return {"status": "healthy"}

if __name__ == "__main__":
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True) 