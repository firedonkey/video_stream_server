class VideoStreamViewer {
    constructor() {
        this.imgElement = document.createElement('img');
        this.imgElement.id = 'videoStream';
        this.imgElement.style.width = '100%';
        this.imgElement.style.height = 'auto';
        document.getElementById('videoContainer').appendChild(this.imgElement);

        this.recordButton = document.getElementById('recordButton');
        this.statusElement = document.getElementById('status');
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

        this.initializeWebSocket();
        this.setupEventListeners();

        document.addEventListener('visibilitychange', () => {
            if (document.hidden) {
                this.closeConnection();
            } else {
                this.initializeWebSocket();
            }
        });
    }

    closeConnection() {
        if (this.ws) {
            this.ws.close();
            this.ws = null;
            this.isConnected = false;
        }
    }

    initializeWebSocket() {
        this.closeConnection();

        const wsUrl = process.env.VITE_WS_URL || 'ws://localhost:8000/ws/video';
        
        this.ws = new WebSocket(wsUrl);

        this.ws.onopen = () => {
            this.isConnected = true;
            this.statusElement.textContent = 'Connected to server';
            this.statusElement.style.color = '#28a745';
            this.reconnectAttempts = 0;
            this.reconnectDelay = 1000;
        };

        this.ws.onclose = (event) => {
            this.isConnected = false;
            this.statusElement.textContent = 'Disconnected from server';
            this.statusElement.style.color = '#dc3545';
            
            if (this.reconnectAttempts < this.maxReconnectAttempts) {
                this.reconnectAttempts++;
                this.reconnectDelay = Math.min(30000, this.reconnectDelay * 2);
                setTimeout(() => this.initializeWebSocket(), this.reconnectDelay);
            } else {
                this.statusElement.textContent = 'Failed to connect to server. Please refresh the page.';
            }
        };

        this.ws.onerror = (error) => {
            this.statusElement.textContent = 'Connection error';
            this.statusElement.style.color = '#dc3545';
        };

        this.ws.onmessage = async (event) => {
            if (!this.isConnected) return;

            if (event.data === 'ping') {
                this.ws.send('pong');
                return;
            }

            if (event.data instanceof Blob) {
                const blob = event.data;
                
                const now = performance.now();
                this.frameCount++;
                if (now - this.lastFrameTime >= 1000) {
                    this.fps = this.frameCount;
                    this.frameCount = 0;
                    this.lastFrameTime = now;
                }

                const imageUrl = URL.createObjectURL(blob);
                this.imgElement.src = imageUrl;
                
                if (this.isRecording) {
                    this.recordedChunks.push(blob);
                }
                return;
            }

            try {
                const text = await event.data.text();
                try {
                    const metadata = JSON.parse(text);
                } catch (e) {
                    console.log('Received text message:', text);
                }
            } catch (e) {
                console.error('Error processing message:', e);
            }
        };
    }

    setupEventListeners() {
        this.recordButton.addEventListener('click', () => this.toggleRecording());
    }

    toggleRecording() {
        if (!this.isRecording) {
            this.isRecording = true;
            this.recordedChunks = [];
            this.recordButton.textContent = 'Stop Recording';
            this.recordButton.classList.add('recording');
            this.statusElement.textContent = 'Recording...';
        } else {
            this.isRecording = false;
            this.recordButton.textContent = 'Record';
            this.recordButton.classList.remove('recording');
            this.statusElement.textContent = 'Processing recording...';
            
            const blob = new Blob(this.recordedChunks, { type: 'video/mp4' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `recording-${new Date().toISOString()}.mp4`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            
            this.statusElement.textContent = 'Recording saved';
        }
    }
}

window.addEventListener('load', () => {
    new VideoStreamViewer();
}); 