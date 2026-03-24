import path from 'path';
import { fileURLToPath } from 'url';
import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import chalk from 'chalk';
import type { ServerToClientEvents, ClientToServerEvents } from './controllers/types';
import { initializeGame } from './controllers/gameplay';
import { findQuickRoom } from './controllers/quickplay';
import { rooms, publicRooms, init as initRoomManager } from './controllers/roomManager';
import { registerHandlers } from './controllers/socketHandlers';
import { registerTrainingHandlers } from './controllers/trainingSocketHandlers';

const PORT = Number(process.env.PORT) || 8000;
const CORS_ORIGIN = process.env.CLIENT_ORIGIN ?? 'http://localhost:3000';
const IS_PROD = process.env.NODE_ENV === 'production';
const MAX_PLAYERS = 6;

// ──────────────────────────────────────────────────────────────────────────────
// Express + Socket.IO setup
// ──────────────────────────────────────────────────────────────────────────────

const app = express();
const httpServer = createServer(app);
const io = new Server<ClientToServerEvents, ServerToClientEvents>(httpServer, {
  cors: IS_PROD ? undefined : { origin: CORS_ORIGIN },
});

if (!IS_PROD) app.use(cors({ origin: CORS_ORIGIN }));
app.use(express.json());

// ──────────────────────────────────────────────────────────────────────────────
// REST endpoints
// ──────────────────────────────────────────────────────────────────────────────

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', rooms: rooms.size });
});

app.get('/rooms/:code', (req, res) => {
  res.json({ exists: rooms.has(req.params.code) });
});

app.get('/rooms-quick', (_req, res) => {
  let room = findQuickRoom(publicRooms, rooms, MAX_PLAYERS);

  if (!room) {
    room = 'QUICK-' + Math.floor(1000 + Math.random() * 9000);
    rooms.set(room, initializeGame());
    publicRooms.add(room);
  }

  res.json({ room });
});

// In production the Express server also serves the built React client
if (IS_PROD) {
  const clientDist = path.join(path.dirname(fileURLToPath(import.meta.url)), '../client/dist');
  app.use(express.static(clientDist));
  app.get('/{*splat}', (_req, res) => {
    res.sendFile(path.join(clientDist, 'index.html'));
  });
}

// ──────────────────────────────────────────────────────────────────────────────
// Initialize modules & start
// ──────────────────────────────────────────────────────────────────────────────

initRoomManager(io);
registerHandlers(io);
registerTrainingHandlers(io);

httpServer.listen(PORT, () => {
  console.log(chalk.green(`Server listening on :${PORT}`));
});
