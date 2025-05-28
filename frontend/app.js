class VideoStreamViewer {
    constructor() {
        this.imgElement = document.createElement('img');
        this.imgElement.id = 'videoStream';
        this.imgElement.style.width = '100%';
        this.imgElement.style.height = 'auto';
        document.getElementById('videoContainer').appendChild(this.imgElement);

        this.recordButton = document.getElementById('recordButton');
        this.logoutButton = document.getElementById('logoutButton');
        this.statusElement = document.getElementById('status');
        this.loginForm = document.getElementById('loginForm');
        this.loginError = document.getElementById('loginError');
        this.loginContainer = document.getElementById('loginContainer');
        this.videoContainer = document.getElementById('videoContainer');
        
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
        this.authToken = null;

        this.setupEventListeners();
        this.checkAuth();

        document.addEventListener('visibilitychange', () => {
            if (document.hidden) {
                this.closeConnection();
            } else {
                this.checkAuth();
            }
        });
    }

    setupEventListeners() {
        this.recordButton.addEventListener('click', () => this.toggleRecording());
        this.logoutButton.addEventListener('click', () => this.handleLogout());
        this.loginForm.addEventListener('submit', (e) => this.handleLogin(e));
    }

    async handleLogin(e) {
        e.preventDefault();
        const username = document.getElementById('username').value;
        const password = document.getElementById('password').value;

        try {
            const response = await fetch('http://localhost:3000/api/login', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ username, password }),
            });

            const data = await response.json();
            if (response.ok) {
                this.authToken = data.token;
                localStorage.setItem('authToken', this.authToken);
                this.showVideoStream();
            } else {
                this.loginError.textContent = data.message || 'Login failed';
            }
        } catch (error) {
            console.error('Login error:', error);
            this.loginError.textContent = 'Login failed. Please try again.';
        }
    }

    checkAuth() {
        const token = localStorage.getItem('authToken');
        if (token) {
            this.authToken = token;
            this.showVideoStream();
        } else {
            this.showLoginForm();
        }
    }

    showVideoStream() {
        this.loginContainer.style.display = 'none';
        this.videoContainer.style.display = 'block';
        document.querySelector('.controls').style.display = 'flex';
        this.statusElement.style.display = 'block';
        this.logoutButton.style.display = 'block';
        this.initializeWebSocket();
    }

    showLoginForm() {
        this.loginContainer.style.display = 'block';
        this.videoContainer.style.display = 'none';
        document.querySelector('.controls').style.display = 'none';
        this.statusElement.style.display = 'none';
        this.logoutButton.style.display = 'none';
        this.closeConnection();
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

        // Get server type from URL parameter, default to remote
        const urlParams = new URLSearchParams(window.location.search);
        const useLocal = urlParams.get('local') === 'true';
        
        const localUrl = 'ws://localhost:8000/ws/video';
        const remoteUrl = 'wss://video-stream-backend-jr2c.onrender.com/ws/video';
        const wsUrl = useLocal ? localUrl : remoteUrl;
        
        console.log('Connecting to WebSocket server:', wsUrl);
        this.statusElement.textContent = `Connecting to ${useLocal ? 'local' : 'remote'} server...`;
        
        // Add auth token to WebSocket URL
        const wsUrlWithAuth = `${wsUrl}?token=${this.authToken}`;
        this.ws = new WebSocket(wsUrlWithAuth);

        this.ws.onopen = () => {
            console.log('WebSocket connection established');
            this.isConnected = true;
            this.statusElement.textContent = 'Connected to server';
            this.statusElement.style.color = '#28a745';
            this.reconnectAttempts = 0;
            this.reconnectDelay = 1000;
        };

        this.ws.onclose = (event) => {
            console.log('WebSocket connection closed:', event.code, event.reason);
            this.isConnected = false;
            this.statusElement.textContent = 'Disconnected from server';
            this.statusElement.style.color = '#dc3545';
            
            if (event.code === 1008) { // Policy violation (invalid token)
                localStorage.removeItem('authToken');
                this.showLoginForm();
                return;
            }
            
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
                    if (metadata.error === 'unauthorized') {
                        localStorage.removeItem('authToken');
                        this.showLoginForm();
                    }
                } catch (e) {
                    console.log('Received text message:', text);
                }
            } catch (e) {
                console.error('Error processing message:', e);
            }
        };
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

    handleLogout() {
        // Clear the auth token
        localStorage.removeItem('authToken');
        this.authToken = null;
        
        // Close any existing WebSocket connection
        this.closeConnection();
        
        // Show login form
        this.showLoginForm();
        
        // Clear any error messages
        this.loginError.textContent = '';
        
        // Clear the video stream
        this.imgElement.src = '';
    }
}

window.addEventListener('load', () => {
    new VideoStreamViewer();
}); 