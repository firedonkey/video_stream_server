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
        this.registerForm = document.getElementById('registerForm');
        this.loginError = document.getElementById('loginError');
        this.registerError = document.getElementById('registerError');
        this.loginContainer = document.getElementById('loginContainer');
        this.videoContainer = document.getElementById('videoContainer');
        
        // Server configuration
        this.localServerUrl = 'http://localhost:8000';
        this.remoteServerUrl = 'https://video-stream-backend-jr2c.onrender.com';
        this.googleClientId = '223100584640-n6138tmmnlch4epi0q9ij0chr7s4emk4.apps.googleusercontent.com';
        
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

        // Initialize forms and event listeners
        this.initializeForms();
        this.checkAuth();
        this.initializeGoogleSignIn();

        document.addEventListener('visibilitychange', () => {
            if (document.hidden) {
                this.closeConnection();
            } else {
                this.checkAuth();
            }
        });
    }

    initializeForms() {
        // Set initial display states
        if (this.loginForm && this.registerForm) {
            this.loginForm.style.display = 'flex';
            this.registerForm.style.display = 'none';
        }

        // Clear any error messages
        if (this.loginError) this.loginError.textContent = '';
        if (this.registerError) this.registerError.textContent = '';

        // Setup form event listeners
        if (this.loginForm) {
            this.loginForm.addEventListener('submit', (e) => this.handleLogin(e));
        }

        if (this.registerForm) {
            this.registerForm.addEventListener('submit', (e) => this.handleRegister(e));
        }

        // Setup navigation links
        const showRegisterLink = document.getElementById('showRegister');
        const showLoginLink = document.getElementById('showLogin');

        if (showRegisterLink) {
            showRegisterLink.addEventListener('click', (e) => {
                e.preventDefault();
                this.showRegisterForm();
            });
        }

        if (showLoginLink) {
            showLoginLink.addEventListener('click', (e) => {
                e.preventDefault();
                this.showLoginForm();
            });
        }

        // Setup record and logout buttons
        if (this.recordButton) {
            this.recordButton.addEventListener('click', () => this.toggleRecording());
        }

        if (this.logoutButton) {
            this.logoutButton.addEventListener('click', () => this.handleLogout());
        }
    }

    getServerUrl() {
        const urlParams = new URLSearchParams(window.location.search);
        const useLocal = urlParams.get('local') === 'true';
        return useLocal ? this.localServerUrl : this.remoteServerUrl;
    }

    getWebSocketUrl() {
        const urlParams = new URLSearchParams(window.location.search);
        const useLocal = urlParams.get('local') === 'true';
        const localUrl = 'ws://localhost:8000/ws/video';
        const remoteUrl = 'wss://video-stream-backend-jr2c.onrender.com/ws/video';
        return useLocal ? localUrl : remoteUrl;
    }

    async handleLogin(e) {
        e.preventDefault();
        if (!this.loginForm) return;

        const username = document.getElementById('username')?.value;
        const password = document.getElementById('password')?.value;

        if (!username || !password) {
            if (this.loginError) {
                this.loginError.textContent = 'Please enter both username and password';
            }
            return;
        }

        try {
            const serverUrl = this.getServerUrl();
            const formData = new URLSearchParams();
            formData.append('username', username);
            formData.append('password', password);

            const response = await fetch(`${serverUrl}/api/login`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                },
                body: formData.toString(),
            });

            const data = await response.json();
            if (response.ok) {
                this.authToken = data.token;
                localStorage.setItem('authToken', this.authToken);
                this.showVideoStream();
            } else {
                if (this.loginError) {
                    this.loginError.textContent = data.detail || 'Login failed';
                }
            }
        } catch (error) {
            console.error('Login error:', error);
            if (this.loginError) {
                this.loginError.textContent = 'Login failed. Please try again.';
            }
        }
    }

    async handleRegister(e) {
        e.preventDefault();
        const email = document.getElementById('reg-email')?.value;
        const password = document.getElementById('reg-password')?.value;
        const registerError = document.getElementById('registerError');

        if (!email || !password) {
            if (registerError) {
                registerError.textContent = 'Please enter both email and password';
            }
            return;
        }

        try {
            const serverUrl = this.getServerUrl();
            const response = await fetch(`${serverUrl}/api/register`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    email,
                    password
                }),
            });

            const data = await response.json();
            if (response.ok) {
                // Registration successful, switch to login form
                if (this.registerForm) this.registerForm.style.display = 'none';
                if (this.loginForm) this.loginForm.style.display = 'flex';
                if (this.loginError) {
                    this.loginError.textContent = 'Registration successful! Please login.';
                    this.loginError.style.color = '#28a745';
                }
            } else {
                if (registerError) {
                    registerError.textContent = data.detail || 'Registration failed';
                }
            }
        } catch (error) {
            console.error('Registration error:', error);
            if (registerError) {
                registerError.textContent = 'Registration failed. Please try again.';
            }
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
        if (!this.loginForm || !this.registerForm) return;
        
        // Hide registration form and show login form
        this.registerForm.style.display = 'none';
        this.loginForm.style.display = 'flex';
        
        // Clear error messages
        if (this.loginError) {
            this.loginError.textContent = '';
            this.loginError.style.color = '#dc3545';
        }
        if (this.registerError) {
            this.registerError.textContent = '';
        }
    }

    showRegisterForm() {
        if (!this.loginForm || !this.registerForm) return;
        
        // Hide login form and show registration form
        this.loginForm.style.display = 'none';
        this.registerForm.style.display = 'flex';
        
        // Clear error messages
        if (this.loginError) {
            this.loginError.textContent = '';
        }
        if (this.registerError) {
            this.registerError.textContent = '';
        }
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

        const wsUrl = this.getWebSocketUrl();
        console.log('Connecting to WebSocket server:', wsUrl);
        this.statusElement.textContent = `Connecting to ${wsUrl.includes('localhost') ? 'local' : 'remote'} server...`;
        
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
        
        // Hide video container and controls
        if (this.videoContainer) {
            this.videoContainer.style.display = 'none';
        }
        const controls = document.querySelector('.controls');
        if (controls) {
            controls.style.display = 'none';
        }
        
        // Hide logout button
        if (this.logoutButton) {
            this.logoutButton.style.display = 'none';
        }
        
        // Show login container
        if (this.loginContainer) {
            this.loginContainer.style.display = 'block';
        }
        
        // Show login form and hide register form
        if (this.loginForm && this.registerForm) {
            this.loginForm.style.display = 'flex';
            this.registerForm.style.display = 'none';
        }
        
        // Clear any error messages
        if (this.loginError) {
            this.loginError.textContent = '';
        }
        if (this.registerError) {
            this.registerError.textContent = '';
        }
        
        // Clear the video stream
        if (this.imgElement) {
            this.imgElement.src = '';
        }
        
        // Update status
        if (this.statusElement) {
            this.statusElement.textContent = 'Logged out';
            this.statusElement.style.display = 'none';
        }
    }

    initializeGoogleSignIn() {
        console.log('Initializing Google Sign-In...');
        
        // Make handleGoogleSignIn available globally
        window.handleGoogleSignIn = async (response) => {
            console.log('Google Sign-In callback triggered');
            console.log('Response:', response);
            
            try {
                const serverUrl = this.getServerUrl();
                console.log('Sending request to:', `${serverUrl}/api/google-login`);
                
                const result = await fetch(`${serverUrl}/api/google-login`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                        credential: response.credential
                    }),
                });

                console.log('Server response status:', result.status);
                const data = await result.json();
                console.log('Server response data:', data);
                
                if (result.ok) {
                    console.log('Login successful, storing token and showing video stream');
                    this.authToken = data.token;
                    localStorage.setItem('authToken', this.authToken);
                    this.showVideoStream();
                } else {
                    console.error('Login failed:', data);
                    if (this.loginError) {
                        this.loginError.textContent = data.detail || 'Google login failed';
                    }
                }
            } catch (error) {
                console.error('Google login error:', error);
                if (this.loginError) {
                    this.loginError.textContent = 'Google login failed. Please try again.';
                }
            }
        };

        // Initialize Google Sign-In
        if (window.google && window.google.accounts) {
            console.log('Google Sign-In API is available');
            window.google.accounts.id.initialize({
                client_id: '223100584640-1tf7vmu45pncnnmv624phep9ess1ledh.apps.googleusercontent.com',
                callback: window.handleGoogleSignIn
            });
        } else {
            console.error('Google Sign-In API is not available');
        }
    }
}

// Password toggle functionality
function togglePassword() {
    const passwordInput = document.getElementById('password');
    const toggleButton = document.querySelector('#loginForm .toggle-password i');
    
    if (passwordInput.type === 'password') {
        passwordInput.type = 'text';
        toggleButton.classList.remove('fa-eye');
        toggleButton.classList.add('fa-eye-slash');
    } else {
        passwordInput.type = 'password';
        toggleButton.classList.remove('fa-eye-slash');
        toggleButton.classList.add('fa-eye');
    }
}

function toggleRegPassword() {
    const passwordInput = document.getElementById('reg-password');
    const toggleButton = document.querySelector('#registerForm .toggle-password i');
    
    if (passwordInput.type === 'password') {
        passwordInput.type = 'text';
        toggleButton.classList.remove('fa-eye');
        toggleButton.classList.add('fa-eye-slash');
    } else {
        passwordInput.type = 'password';
        toggleButton.classList.remove('fa-eye-slash');
        toggleButton.classList.add('fa-eye');
    }
}

window.addEventListener('load', () => {
    new VideoStreamViewer();
}); 