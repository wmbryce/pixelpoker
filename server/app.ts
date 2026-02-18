import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import chalk from 'chalk';
import type {
  Poker,
  ServerToClientEvents,
  ClientToServerEvents,
  GameAction,
} from './controllers/types';
import { initializeGame, createPlayer, advanceGameStage } from './controllers/gameplay';
import { raise, call, fold, nextPlayer } from './controllers/actions';

const PORT = 8000;
const CORS_ORIGIN = 'http://localhost:3000';

// ──────────────────────────────────────────────────────────────────────────────
// Express + Socket.IO setup
// ──────────────────────────────────────────────────────────────────────────────

const app = express();
const httpServer = createServer(app);
const io = new Server<ClientToServerEvents, ServerToClientEvents>(httpServer, {
  cors: { origin: CORS_ORIGIN },
});

app.use(cors({ origin: CORS_ORIGIN }));
app.use(express.json());

// REST health check
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', rooms: rooms.size });
});

// ──────────────────────────────────────────────────────────────────────────────
// In-memory state
// ──────────────────────────────────────────────────────────────────────────────

const rooms = new Map<string, Poker>();

interface PlayerSession {
  room: string;
  playerIndex: number;
  name: string;
}
const sessions = new Map<string, PlayerSession>();

// ──────────────────────────────────────────────────────────────────────────────
// Helper
// ──────────────────────────────────────────────────────────────────────────────

const broadcastGame = (room: string) => {
  const game = rooms.get(room);
  if (game) io.to(room).emit('updateGame', game);
};

const processGameAction = (game: Poker, action: GameAction): Poker | null => {
  const { type, playerIndex, bet } = action;

  if (type === 'advance') {
    return advanceGameStage(game);
  }

  let result: Poker | null = null;

  if (type === 'raise' && bet !== undefined) {
    ({ result } = raise(game, playerIndex, bet));
  } else if (type === 'call') {
    ({ result } = call(game, playerIndex));
  } else if (type === 'fold') {
    ({ result } = fold(game, playerIndex));
  }

  if (result) {
    result.actionOn = nextPlayer(result, playerIndex);
  }

  return result;
};

// ──────────────────────────────────────────────────────────────────────────────
// Socket.IO event handlers
// ──────────────────────────────────────────────────────────────────────────────

io.on('connection', (socket) => {
  console.log(chalk.green(`+ connected: ${socket.id}`));

  socket.on('joinRoom', ({ username, room }) => {
    socket.join(room);

    if (!rooms.has(room)) {
      rooms.set(room, initializeGame());
    }

    const game = rooms.get(room)!;
    const playerIndex = game.players.length;
    game.players.push(createPlayer(socket.id, username));
    sessions.set(socket.id, { room, playerIndex, name: username });

    // Tell this socket which player index they are
    socket.emit('roomJoined', { playerIndex, game });

    socket.broadcast
      .to(room)
      .emit('message', { userId: socket.id, username: 'System', text: `${username} joined` });

    broadcastGame(room);
    console.log(chalk.blue(`  ${username} joined room "${room}" as player ${playerIndex}`));
  });

  socket.on('chat', (text) => {
    const session = sessions.get(socket.id);
    if (!session) return;
    io.to(session.room).emit('message', { userId: socket.id, username: session.name, text });
  });

  socket.on('gameAction', (action) => {
    const session = sessions.get(socket.id);
    if (!session) return;

    const game = rooms.get(session.room);
    if (!game) return;

    const updated = processGameAction(game, action);
    if (updated) {
      rooms.set(session.room, updated);
      broadcastGame(session.room);
    }
  });

  socket.on('disconnect', () => {
    const session = sessions.get(socket.id);
    sessions.delete(socket.id);
    if (session) {
      console.log(chalk.red(`- disconnected: ${session.name} (${socket.id})`));
    }
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// Start
// ──────────────────────────────────────────────────────────────────────────────

httpServer.listen(PORT, () => {
  console.log(chalk.green(`Server listening on :${PORT}`));
});
