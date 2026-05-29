import './config/env.js';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import express from 'express';
import { createServer } from 'node:http';
import { Server } from 'socket.io';
import { connectDB } from './config/db.js';
import apiRoutes from './routes/api.js';
import { registerSocketHandlers } from './socket/index.js';

const PORT = process.env.PORT || 5000;
const CLIENT_URL = process.env.CLIENT_URL || 'http://localhost:5173';

async function start() {
  if (!process.env.JWT_SECRET) {
    console.error('JWT_SECRET is required. Copy server/.env.example to server/.env');
    process.exit(1);
  }

  await connectDB(process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/secure-p2p-chat');

  const app = express();
  const httpServer = createServer(app);

  const io = new Server(httpServer, {
    cors: {
      origin: true,
      credentials: true,
    },
  });

  app.use(
    cors({
      origin: true,
      credentials: true,
    })
  );
  app.use(express.json());
  app.use(cookieParser());

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true });
  });

  app.get('/', (_req, res) => {
    res.redirect(302, CLIENT_URL);
  });

  app.use('/api', apiRoutes);

  app.use((_req, res) => {
    res.status(404).json({
      error: 'Not found',
      hint: `This is the API server. Open the chat app at ${CLIENT_URL}`,
    });
  });

  registerSocketHandlers(io);

  httpServer.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.error(`Port ${PORT} is already in use. Stop the other server (Ctrl+C) and try again.`);
      process.exit(1);
    }
    throw err;
  });

  httpServer.listen(PORT, () => {
    console.log(`API server:  http://localhost:${PORT}`);
    console.log(`Chat app:    ${CLIENT_URL}  ← open this in your browser`);
  });
}
start().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
