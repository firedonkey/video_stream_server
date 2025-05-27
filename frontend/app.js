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
        this.reconnectDelay = 1000; // Start with 1 second delay

        this.initializeWebSocket();
        this.setupEventListeners();
    }

    initializeWebSocket() {
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const wsUrl = `${protocol}//${window.location.host}/ws/video`;
        
        this.ws = new WebSocket(wsUrl);

        this.ws.onopen = () => {
            this.statusElement.textContent = 'Connected to server';
            this.statusElement.style.color = '#28a745';
            this.reconnectAttempts = 0;
            this.reconnectDelay = 1000;
        };

        this.ws.onclose = (event) => {
            this.statusElement.textContent = 'Disconnected from server';
            this.statusElement.style.color = '#dc3545';
            
            // Implement exponential backoff for reconnection
            if (this.reconnectAttempts < this.maxReconnectAttempts) {
                this.reconnectAttempts++;
                this.reconnectDelay = Math.min(30000, this.reconnectDelay * 2); // Max 30 seconds
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

        this.ws.onmessage = (event) => {
            if (event.data === 'ping') {
                // Respond to ping with pong
                this.ws.send('pong');
                return;
            }

            if (event.data instanceof Blob) {
                const blob = event.data;
                const url = URL.createObjectURL(blob);
                
                // Clean up old URL to prevent memory leaks
                if (this.videoElement.src) {
                    URL.revokeObjectURL(this.videoElement.src);
                }
                
                this.videoElement.src = url;
                
                // If recording, add the frame to the recorded chunks
                if (this.isRecording) {
                    this.recordedChunks.push(blob);
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
    new VideoStreamViewer();
}); 