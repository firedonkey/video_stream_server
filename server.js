const express = require('express');
const WebSocket = require('ws');
const jwt = require('jsonwebtoken');
const path = require('path');
const http = require('http');
const cors = require('cors');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// Secret key for JWT signing
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';

// In-memory user store (replace with a database in production)
const users = {
    'admin': {
        password: 'admin123', // In production, use hashed passwords
        role: 'admin'
    }
};

// Middleware
app.use(cors());  // Enable CORS for all routes
app.use(express.json());
app.use(express.static(path.join(__dirname, 'frontend')));

// Authentication middleware
const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
        return res.status(401).json({ message: 'No token provided' });
    }

    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) {
            return res.status(403).json({ message: 'Invalid token' });
        }
        req.user = user;
        next();
    });
};

// Routes
app.post('/api/login', (req, res) => {
    const { username, password } = req.body;

    const user = users[username];
    if (!user || user.password !== password) {
        return res.status(401).json({ message: 'Invalid credentials' });
    }

    const token = jwt.sign(
        { username, role: user.role },
        JWT_SECRET,
        { expiresIn: '24h' }
    );

    res.json({ token });
});

// WebSocket connection handling
wss.on('connection', (ws, req) => {
    // Extract token from URL query parameters
    const url = new URL(req.url, 'ws://localhost');
    const token = url.searchParams.get('token');

    if (!token) {
        ws.close(1008, 'No token provided');
        return;
    }

    try {
        const user = jwt.verify(token, JWT_SECRET);
        ws.user = user;
        console.log(`User ${user.username} connected`);
    } catch (err) {
        ws.close(1008, 'Invalid token');
        return;
    }

    ws.on('message', (message) => {
        if (message.toString() === 'ping') {
            ws.send('pong');
        }
    });

    ws.on('close', () => {
        if (ws.user) {
            console.log(`User ${ws.user.username} disconnected`);
        }
    });
});

// Start server
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
}); 