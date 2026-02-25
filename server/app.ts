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
import { initializeGame, createPlayer, createAIPlayer, advanceGameStage, awardPotDirectly } from './controllers/gameplay';
import { SMALL_BLIND, BIG_BLIND } from './controllers/types';
import { raise, call, fold, nextPlayer } from './controllers/actions';

const PORT = 8000;
const CORS_ORIGIN = 'http://localhost:3000';
const TURN_DURATION_MS = 30_000;
const AUTO_DEAL_DELAY_MS = 4_000;
const MAX_AI_PLAYERS = 5;

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
// AI decision logic
// ──────────────────────────────────────────────────────────────────────────────

const makeAIDecision = (game: Poker, playerIndex: number): GameAction => {
  const player = game.players[playerIndex];
  const amountToCall = game.currentBet - player.lastBet;
  const rand = Math.random();

  if (amountToCall === 0) {
    // Nothing to call — check or occasionally raise
    if (rand < 0.25 && player.stack >= game.bigBlind * 2) {
      const bet = Math.min(
        game.bigBlind * (1 + Math.floor(Math.random() * 3)),
        player.stack,
      );
      return { type: 'raise', playerIndex, bet };
    }
    return { type: 'call', playerIndex }; // check
  }

  if (rand < 0.20) return { type: 'fold', playerIndex };
  if (rand < 0.85) return { type: 'call', playerIndex };

  // Raise
  const raiseBet = Math.min(game.currentBet * 2, player.stack);
  if (raiseBet <= amountToCall) return { type: 'call', playerIndex };
  return { type: 'raise', playerIndex, bet: raiseBet };
};

// ──────────────────────────────────────────────────────────────────────────────
// Turn timer
// ──────────────────────────────────────────────────────────────────────────────

const clearTurnTimer = (room: string) => {
  const t = timers.get(room);
  if (t) {
    clearTimeout(t);
    timers.delete(room);
  }
};

// Forward declaration — defined after handleActionResult
let startTurnTimer: (room: string) => void;

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
// Broadcast — personalized per player (hides opponents' cards until showdown)
// ──────────────────────────────────────────────────────────────────────────────

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

// ──────────────────────────────────────────────────────────────────────────────
// Action processing
// ──────────────────────────────────────────────────────────────────────────────

const processGameAction = (game: Poker, action: GameAction): Poker | null => {
  const { type, playerIndex, bet } = action;

  if (type === 'advance') {
    // Only allow manual advance at stage 0 (start first hand) or stage 5+
    if (game.stage > 0 && game.stage < 5) return null;
    return advanceGameStage(game);
  }

  let result: Poker | null = null;

  if (type === 'raise' && bet !== undefined) {
    ({ result } = raise(game, playerIndex, bet));
    if (result) {
      // Everyone except the raiser must act again
      const numActive = result.players.filter((p) => p.isActive).length;
      result.actionsRemaining = numActive - 1;
    }
  } else if (type === 'call') {
    ({ result } = call(game, playerIndex));
    if (result) {
      result.actionsRemaining = Math.max(0, result.actionsRemaining - 1);
    }
  } else if (type === 'fold') {
    ({ result } = fold(game, playerIndex));
    if (result) {
      result.actionsRemaining = Math.max(0, result.actionsRemaining - 1);
    }
  }

  if (result) {
    result.actionOn = nextPlayer(result, playerIndex);
  }

  return result;
};

// After any betting action, decide whether to auto-advance the street or
// start the next player's timer.
const handleActionResult = (room: string, result: Poker) => {
  const inBettingRound = result.stage >= 1 && result.stage <= 4;

  if (!inBettingRound) {
    // Stage 0 advance (deal pre-flop): just start timer & broadcast
    rooms.set(room, result);
    startTurnTimer(room);
    broadcastGame(room);
    return;
  }

  const activePlayers = result.players.filter((p) => p.isActive);

  if (result.actionsRemaining <= 0) {
    if (activePlayers.length <= 1) {
      // Everyone else folded — award pot directly (no pokersolver needed)
      const final = awardPotDirectly(result);
      rooms.set(room, final);
      broadcastGame(room);
      scheduleAutoDeal(room);
    } else {
      // Advance to next street (or showdown)
      const advanced = advanceGameStage(result);
      rooms.set(room, advanced);
      if (advanced.stage === 5) {
        broadcastGame(room);
        scheduleAutoDeal(room);
      } else {
        startTurnTimer(room);
        broadcastGame(room);
      }
    }
  } else {
    rooms.set(room, result);
    startTurnTimer(room);
    broadcastGame(room);
  }
};

// ──────────────────────────────────────────────────────────────────────────────
// Turn timer (defined after handleActionResult so it can reference it)
// ──────────────────────────────────────────────────────────────────────────────

startTurnTimer = (room: string) => {
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

  const currentPlayer = game.players[game.actionOn];

  if (currentPlayer?.isAI) {
    // AI acts automatically after a short human-like delay (0.6–2s)
    game.timerDeadline = null;
    const delay = 600 + Math.random() * 1400;

    const t = setTimeout(() => {
      timers.delete(room);

      const g = rooms.get(room);
      if (!g || g.stage < 1 || g.stage > 4) return;
      if (!g.players[g.actionOn]?.isAI) return;

      const action = makeAIDecision(g, g.actionOn);
      const actionResult = processGameAction(g, action);
      if (!actionResult) return;

      console.log(
        chalk.magenta(`  AI player ${g.actionOn} → ${action.type}${action.bet ? ` $${action.bet}` : ''} in "${room}"`),
      );

      handleActionResult(room, actionResult);
    }, delay);

    timers.set(room, t);
  } else {
    // Human player — 30-second countdown
    game.timerDeadline = Date.now() + TURN_DURATION_MS;

    const t = setTimeout(() => {
      timers.delete(room);

      const g = rooms.get(room);
      if (!g || g.stage < 1 || g.stage > 4) return;

      const pi = g.actionOn;
      if (!g.players[pi]?.isActive) return;

      console.log(chalk.yellow(`  auto-folded player ${pi} in room "${room}" (timeout)`));

      const { result } = fold(g, pi);
      result.actionsRemaining = Math.max(0, result.actionsRemaining - 1);
      result.actionOn = nextPlayer(result, pi);

      handleActionResult(room, result);
    }, TURN_DURATION_MS);

    timers.set(room, t);
  }
};

// ──────────────────────────────────────────────────────────────────────────────
// Socket.IO event handlers
// ──────────────────────────────────────────────────────────────────────────────

io.on('connection', (socket) => {
  console.log(chalk.green(`+ connected: ${socket.id}`));

  socket.on('joinRoom', ({ username, room, smallBlind, bigBlind, aiCount }) => {
    socket.join(room);

    if (!rooms.has(room)) {
      rooms.set(room, initializeGame(smallBlind ?? SMALL_BLIND, bigBlind ?? BIG_BLIND));
    }

    const game = rooms.get(room)!;
    const playerIndex = game.players.length;
    game.players.push(createPlayer(socket.id, username));
    sessions.set(socket.id, { room, playerIndex, name: username });

    // Add AI players (only when the room is first created, i.e. this is player 0)
    if (playerIndex === 0 && aiCount && aiCount > 0) {
      const count = Math.min(aiCount, MAX_AI_PLAYERS);
      for (let i = 0; i < count; i++) {
        game.players.push(createAIPlayer(game.players.length));
      }
      console.log(chalk.magenta(`  added ${count} AI player(s) to room "${room}"`));
    }

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
      handleActionResult(session.room, updated);
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
