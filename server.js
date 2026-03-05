require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const connectDB = require('./config/db');
const socketHandler = require('./socket/socketHandler');

// Route imports
const authRoutes = require('./routes/authRoutes');
const groupRoutes = require('./routes/groupRoutes');
const messageRoutes = require('./routes/messageRoutes');

// ── App Setup ────────────────────────────────────────────────
const app = express();
const server = http.createServer(app);

// ── Socket.io Setup ──────────────────────────────────────────
const io = new Server(server, {
  cors: {
    origin: process.env.CLIENT_URL || 'http://localhost:5173',
    methods: ['GET', 'POST'],
    credentials: true,
  },
});

// Make io accessible in controllers (for emitting from REST endpoints)
app.set('io', io);

// ── Middleware ───────────────────────────────────────────────
app.use(
  cors({
    origin: process.env.CLIENT_URL || 'http://localhost:5173',
    credentials: true,
  })
);
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ── Database ─────────────────────────────────────────────────
connectDB();

// ── Routes ───────────────────────────────────────────────────
app.use('/api/auth', authRoutes);
app.use('/api/group', groupRoutes);
app.use('/api/messages', messageRoutes);

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ message: `Route ${req.originalUrl} not found` });
});

// Global error handler
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ message: err.message || 'Internal server error' });
});

// ── Socket Handler ───────────────────────────────────────────
socketHandler(io);

// ── Start Server ─────────────────────────────────────────────
const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📡 Socket.io ready`);
  console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
});
