import asyncio
import websockets
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

async def test_connection():
    uri = "ws://localhost:8000/ws/video"
    try:
        logger.info(f"Attempting to connect to {uri}")
        async with websockets.connect(uri) as websocket:
            logger.info("Successfully connected to WebSocket server")
            # Send a test message
            await websocket.send(b"test")
            logger.info("Sent test message")
            
            # Wait for a response
            response = await websocket.recv()
            logger.info(f"Received response: {response}")
            
    except Exception as e:
        logger.error(f"Connection failed: {str(e)}")
        logger.error(f"Error type: {type(e).__name__}")
        import traceback
        logger.error(f"Traceback: {traceback.format_exc()}")

if __name__ == "__main__":
    asyncio.run(test_connection()) 