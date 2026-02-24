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
import { SMALL_BLIND, BIG_BLIND } from './controllers/types';
import { raise, call, fold, nextPlayer } from './controllers/actions';

const PORT = 8000;
const CORS_ORIGIN = 'http://localhost:3000';
const TURN_DURATION_MS = 30_000;
const AUTO_DEAL_DELAY_MS = 4_000;

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

// Room existence check
app.get('/rooms/:code', (req, res) => {
  res.json({ exists: rooms.has(req.params.code) });
});

// ──────────────────────────────────────────────────────────────────────────────
// In-memory state
// ──────────────────────────────────────────────────────────────────────────────

const rooms = new Map<string, Poker>();
const timers = new Map<string, ReturnType<typeof setTimeout>>();
const autoDealTimers = new Map<string, ReturnType<typeof setTimeout>>();

interface PlayerSession {
  room: string;
  playerIndex: number;
  name: string;
}
const sessions = new Map<string, PlayerSession>();

// ──────────────────────────────────────────────────────────────────────────────
// Turn timer helpers
// ──────────────────────────────────────────────────────────────────────────────

const clearTurnTimer = (room: string) => {
  const t = timers.get(room);
  if (t) {
    clearTimeout(t);
    timers.delete(room);
  }
};

const startTurnTimer = (room: string) => {
  clearTurnTimer(room);

  const game = rooms.get(room);
  if (!game || game.stage < 1 || game.stage > 4) {
    if (game) game.timerDeadline = null;
    return;
  }

  const activePlayers = game.players.filter((p) => p.isActive).length;
  if (activePlayers <= 1) {
    game.timerDeadline = null;
    return;
  }

  game.timerDeadline = Date.now() + TURN_DURATION_MS;

  const t = setTimeout(() => {
    timers.delete(room);

    const g = rooms.get(room);
    if (!g || g.stage < 1 || g.stage > 4) return;

    const pi = g.actionOn;
    if (!g.players[pi]?.isActive) return;

    const { result } = fold(g, pi);
    result.actionOn = nextPlayer(result, pi);
    rooms.set(room, result);

    startTurnTimer(room);   // sets timerDeadline on result, starts next timer
    broadcastGame(room);
    console.log(chalk.yellow(`  auto-folded player ${pi} in room "${room}" (timeout)`));
  }, TURN_DURATION_MS);

  timers.set(room, t);
};

// ──────────────────────────────────────────────────────────────────────────────
// Auto-deal helper
// ──────────────────────────────────────────────────────────────────────────────

const clearAutoDeal = (room: string) => {
  const t = autoDealTimers.get(room);
  if (t) {
    clearTimeout(t);
    autoDealTimers.delete(room);
  }
};

const scheduleAutoDeal = (room: string) => {
  clearAutoDeal(room);

  const t = setTimeout(() => {
    autoDealTimers.delete(room);

    const game = rooms.get(room);
    if (!game || game.stage !== 5) return;

    const reset = advanceGameStage(game);  // 5 → 0
    const dealt = advanceGameStage(reset); // 0 → 1 (deals pre-flop, posts blinds)
    rooms.set(room, dealt);

    startTurnTimer(room);
    broadcastGame(room);
    console.log(chalk.blue(`  auto-dealing next hand in room "${room}"`));
  }, AUTO_DEAL_DELAY_MS);

  autoDealTimers.set(room, t);
};

// ──────────────────────────────────────────────────────────────────────────────
// Broadcast helpers
// ──────────────────────────────────────────────────────────────────────────────

// Sends each player a personalized game state: their own cards are visible,
// other players' cards are hidden until showdown (stage 5).
const broadcastGame = (room: string) => {
  const game = rooms.get(room);
  if (!game) return;

  const showAllCards = game.stage === 5;

  for (const [socketId, session] of sessions.entries()) {
    if (session.room !== room) continue;
    const sock = io.sockets.sockets.get(socketId);
    if (!sock) continue;

    const personalizedGame = showAllCards
      ? game
      : {
          ...game,
          players: game.players.map((p, i) =>
            i === session.playerIndex ? p : { ...p, cards: [] }
          ),
        };

    sock.emit('updateGame', personalizedGame);
  }
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

  socket.on('joinRoom', ({ username, room, smallBlind, bigBlind }) => {
    socket.join(room);

    if (!rooms.has(room)) {
      rooms.set(room, initializeGame(smallBlind ?? SMALL_BLIND, bigBlind ?? BIG_BLIND));
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

    clearTurnTimer(session.room);
    clearAutoDeal(session.room);

    const updated = processGameAction(game, action);
    if (updated) {
      rooms.set(session.room, updated);

      if (updated.stage === 5) {
        scheduleAutoDeal(session.room);
      } else {
        startTurnTimer(session.room);
      }

      broadcastGame(session.room);
    }
  });

  socket.on('changeBlinds', ({ smallBlind, bigBlind }) => {
    const session = sessions.get(socket.id);
    if (!session) return;

    const game = rooms.get(session.room);
    if (!game || game.stage !== 0) return;
    if (smallBlind <= 0 || bigBlind <= smallBlind) return;

    game.smallBlind = smallBlind;
    game.bigBlind = bigBlind;
    broadcastGame(session.room);
  });

  socket.on('disconnect', () => {
    const session = sessions.get(socket.id);
    sessions.delete(socket.id);
    if (session) {
      clearTurnTimer(session.room);
      clearAutoDeal(session.room);
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
