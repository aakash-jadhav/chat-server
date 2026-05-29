import './config/env.js';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import express from 'express';
import mongoose from 'mongoose';
import { createServer } from 'node:http';
import { Server } from 'socket.io';
import { connectDB } from './config/db.js';
import apiRoutes from './routes/api.js';
import { registerSocketHandlers } from './socket/index.js';

const PORT = Number(process.env.PORT) || 5000;
const HOST = '0.0.0.0';
const CLIENT_URL = process.env.CLIENT_URL || 'http://localhost:5173';

process.on('uncaughtException', (err) => {
  console.error('Uncaught exception:', err);
});
process.on('unhandledRejection', (reason) => {
  console.error('Unhandled rejection:', reason);
});

function start() {
  if (!process.env.JWT_SECRET) {
    console.error('JWT_SECRET is required. Copy server/.env.example to server/.env');
    process.exit(1);
  }

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

  app.get('/api/test', (_req, res) => {
    res.json({
      ok: true,
      message: 'Server is reachable',
      dbConnected: mongoose.connection.readyState === 1,
      timestamp: new Date().toISOString(),
    });
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

  httpServer.listen(PORT, HOST, () => {
    console.log(`API server listening on ${HOST}:${PORT}`);
    console.log(`Chat app:    ${CLIENT_URL}  ← open this in your browser`);
  });

  connectDB(process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/secure-p2p-chat').catch((err) => {
    console.error('MongoDB connection failed (server still running):', err.message);
  });
}

start();
