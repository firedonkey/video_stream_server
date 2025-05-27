# Video Stream Server

A FastAPI-based video streaming server that receives video frames from ROS2 nodes and broadcasts them to connected clients.

## Features

- WebSocket-based video streaming
- Real-time video frame processing
- Support for multiple connected clients
- Configurable frame rate and image quality
- ROS2 integration

## Requirements

- Python 3.10+
- FastAPI
- OpenCV
- WebSockets
- ROS2 (for the client side)

## Installation

1. Clone the repository:
```bash
git clone <your-repo-url>
cd video_stream_server
```

2. Create and activate a virtual environment:
```bash
python -m venv backend/venv
source backend/venv/bin/activate
```

3. Install dependencies:
```bash
cd backend
pip install -r requirements.txt
```

## Usage

1. Start the server:
```bash
cd backend
source venv/bin/activate
uvicorn main:app --reload
```

2. Connect to the server:
- WebSocket endpoint: `ws://localhost:8000/ws/video`
- Health check: `http://localhost:8000/health`

## Project Structure

```
video_stream_server/
├── backend/
│   ├── venv/
│   ├── app/
│   │   └── video_stream.py
│   ├── main.py
│   └── requirements.txt
└── README.md
```

## License

[Your chosen license] 