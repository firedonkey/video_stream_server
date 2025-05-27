class VideoStreamViewer {
    constructor() {
        this.videoElement = document.getElementById('videoStream');
        this.recordButton = document.getElementById('recordButton');
        this.statusElement = document.getElementById('status');
        this.mediaRecorder = null;
        this.recordedChunks = [];
        this.isRecording = false;
        this.ws = null;
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 5;
        this.reconnectDelay = 1000;
        this.lastFrameTime = 0;
        this.frameCount = 0;
        this.fps = 0;
        this.isConnected = false;
        
        // Frame buffering
        this.frameBuffer = [];
        this.maxBufferSize = 30; // Buffer up to 30 frames
        this.isPlaying = false;
        this.targetFps = 30;
        this.frameInterval = 1000 / this.targetFps;
        this.lastFrameTimestamp = 0;

        // Initialize immediately
        this.initializeWebSocket();
        this.setupEventListeners();
        this.startFramePlayback();

        // Add page visibility handling
        document.addEventListener('visibilitychange', () => {
            if (document.hidden) {
                console.log('Page hidden, closing WebSocket connection');
                this.closeConnection();
                this.isPlaying = false;
            } else {
                console.log('Page visible, reconnecting WebSocket');
                this.initializeWebSocket();
                this.isPlaying = true;
            }
        });
    }

    startFramePlayback() {
        const playFrames = () => {
            if (!this.isPlaying) return;

            const now = performance.now();
            const elapsed = now - this.lastFrameTimestamp;

            if (elapsed >= this.frameInterval && this.frameBuffer.length > 0) {
                const frame = this.frameBuffer.shift();
                this.displayFrame(frame);
                this.lastFrameTimestamp = now;
            }

            requestAnimationFrame(playFrames);
        };

        this.isPlaying = true;
        playFrames();
    }

    displayFrame(frameBlob) {
        // Create object URL for the frame
        const url = URL.createObjectURL(frameBlob);
        
        // Clean up old URL to prevent memory leaks
        if (this.videoElement.src) {
            URL.revokeObjectURL(this.videoElement.src);
        }
        
        // Update the image
        this.videoElement.src = url;
    }

    closeConnection() {
        if (this.ws) {
            this.ws.close();
            this.ws = null;
            this.isConnected = false;
        }
    }

    initializeWebSocket() {
        // Close existing connection if any
        this.closeConnection();

        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const wsUrl = `${protocol}//${window.location.host}/ws/video`;
        
        console.log('Initializing WebSocket connection to:', wsUrl);
        this.ws = new WebSocket(wsUrl);

        this.ws.onopen = () => {
            console.log('WebSocket connection established');
            this.isConnected = true;
            this.statusElement.textContent = 'Connected to server';
            this.statusElement.style.color = '#28a745';
            this.reconnectAttempts = 0;
            this.reconnectDelay = 1000;
            this.isPlaying = true;

            // Send initial connection message
            this.ws.send(JSON.stringify({
                type: 'connection_established',
                timestamp: Date.now()
            }));
        };

        this.ws.onclose = (event) => {
            console.log('WebSocket connection closed:', event);
            this.isConnected = false;
            this.isPlaying = false;
            this.statusElement.textContent = 'Disconnected from server';
            this.statusElement.style.color = '#dc3545';
            
            // Implement exponential backoff for reconnection
            if (this.reconnectAttempts < this.maxReconnectAttempts) {
                this.reconnectAttempts++;
                this.reconnectDelay = Math.min(30000, this.reconnectDelay * 2);
                console.log(`Attempting to reconnect in ${this.reconnectDelay}ms (attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})`);
                setTimeout(() => this.initializeWebSocket(), this.reconnectDelay);
            } else {
                this.statusElement.textContent = 'Failed to connect to server. Please refresh the page.';
            }
        };

        this.ws.onerror = (error) => {
            console.error('WebSocket error:', error);
            this.statusElement.textContent = 'Connection error';
            this.statusElement.style.color = '#dc3545';
        };

        this.ws.onmessage = async (event) => {
            if (!this.isConnected) {
                console.warn('Received message while disconnected');
                return;
            }

            if (event.data === 'ping') {
                console.log('Received ping, sending pong');
                this.ws.send('pong');
                return;
            }

            try {
                // Try to parse as JSON first (metadata)
                const text = await event.data.text();
                try {
                    const metadata = JSON.parse(text);
                    console.log('Received metadata:', metadata);
                    // Wait for the next message which should be the frame data
                    return;
                } catch (e) {
                    // Not JSON, treat as raw frame data
                    console.log('Received non-JSON text:', text);
                }
            } catch (e) {
                // Not text, treat as binary data
                if (event.data instanceof Blob) {
                    const blob = event.data;
                    console.log('Received frame data:', blob.size, 'bytes');
                    
                    // Update FPS calculation
                    const now = performance.now();
                    this.frameCount++;
                    if (now - this.lastFrameTime >= 1000) {
                        this.fps = this.frameCount;
                        this.frameCount = 0;
                        this.lastFrameTime = now;
                        console.log('Current FPS:', this.fps);
                    }

                    // Add frame to buffer
                    if (this.frameBuffer.length >= this.maxBufferSize) {
                        this.frameBuffer.shift(); // Remove oldest frame if buffer is full
                    }
                    this.frameBuffer.push(blob);
                    
                    // If recording, add the frame to the recorded chunks
                    if (this.isRecording) {
                        this.recordedChunks.push(blob);
                    }
                }
            }
        };
    }

    setupEventListeners() {
        this.recordButton.addEventListener('click', () => this.toggleRecording());
    }

    toggleRecording() {
        if (!this.isRecording) {
            // Start recording
            this.isRecording = true;
            this.recordedChunks = [];
            this.recordButton.textContent = 'Stop Recording';
            this.recordButton.classList.add('recording');
            this.statusElement.textContent = 'Recording...';
        } else {
            // Stop recording
            this.isRecording = false;
            this.recordButton.textContent = 'Record';
            this.recordButton.classList.remove('recording');
            this.statusElement.textContent = 'Processing recording...';
            
            // Create and download the video file
            const blob = new Blob(this.recordedChunks, { type: 'video/webm' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `recording-${new Date().toISOString()}.webm`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            
            this.statusElement.textContent = 'Recording saved';
        }
    }
}

// Initialize the viewer when the page loads
window.addEventListener('load', () => {
    console.log('Page loaded, initializing VideoStreamViewer');
    new VideoStreamViewer();
}); 