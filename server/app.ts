import path from 'path';
import { fileURLToPath } from 'url';
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

const PORT = Number(process.env.PORT) || 8000;
const CORS_ORIGIN = process.env.CLIENT_ORIGIN ?? 'http://localhost:3000';
const IS_PROD = process.env.NODE_ENV === 'production';
const TURN_DURATION_MS = 30_000;
const AUTO_DEAL_DELAY_MS = 4_000;
const MAX_AI_PLAYERS = 5;

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

// REST health check
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', rooms: rooms.size });
});

// Room existence check
app.get('/rooms/:code', (req, res) => {
  res.json({ exists: rooms.has(req.params.code) });
});

// In production the Express server also serves the built React client
if (IS_PROD) {
  const clientDist = path.join(path.dirname(fileURLToPath(import.meta.url)), '../client/dist');
  app.use(express.static(clientDist));
  app.get('*', (_req, res) => {
    res.sendFile(path.join(clientDist, 'index.html'));
  });
}

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
  clientId: string;
}
// Keyed by socket.id — cleared on disconnect
const sessions = new Map<string, PlayerSession>();

// Keyed by clientId — persistent across reconnects, never cleared on disconnect
interface ClientRecord {
  room: string;
  playerIndex: number;
  name: string;
  socketId: string | null;
}
const clientRecords = new Map<string, ClientRecord>();

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

    const reset = advanceGameStage(game); // 5 → 0 (resetGame — busted players set inactive)

    // Auto-rebuy busted AI players so the game keeps moving
    for (const player of reset.players) {
      if (player.isAI && player.stack === 0) {
        player.stack = 1000;
        player.isActive = true;
      }
    }

    // If fewer than 2 players can act, pause at stage 0 and wait for rebuys
    const activePlayers = reset.players.filter((p) => p.isActive);
    if (activePlayers.length < 2) {
      rooms.set(room, reset);
      broadcastGame(room);
      console.log(chalk.yellow(`  paused at stage 0 in room "${room}" — waiting for rebuys`));
      return;
    }

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
    const raiseResult = raise(game, playerIndex, bet);
    result = raiseResult.result;
    if (result) {
      if (raiseResult.isFullRaise) {
        // Full raise: everyone except the raiser must act again
        const numCanAct = result.players.filter((p) => p.isActive && !p.isAllIn).length;
        const raiserIsAllIn = result.players[playerIndex].isAllIn;
        // If raiser went all-in they can't act again, so don't subtract them from count
        result.actionsRemaining = raiserIsAllIn ? numCanAct : Math.max(0, numCanAct - 1);
      } else {
        // Short all-in: doesn't reopen betting, treat like a call
        result.actionsRemaining = Math.max(0, result.actionsRemaining - 1);
      }
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
  const playersWhoCanAct = result.players.filter((p) => p.isActive && !p.isAllIn);

  if (result.actionsRemaining <= 0 || playersWhoCanAct.length <= 1) {
    if (activePlayers.length <= 1) {
      // Everyone else folded — award pot directly (no pokersolver needed)
      const final = awardPotDirectly(result);
      rooms.set(room, final);
      broadcastGame(room);
      scheduleAutoDeal(room);
    } else if (playersWhoCanAct.length <= 1) {
      // All remaining players are all-in — run out the board to showdown
      let current = result;
      while (current.stage >= 1 && current.stage < 5) {
        current = advanceGameStage(current);
      }
      rooms.set(room, current);
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

  const playersWhoCanAct = game.players.filter((p) => p.isActive && !p.isAllIn).length;
  if (playersWhoCanAct <= 1) {
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

  socket.on('joinRoom', ({ username, room, clientId, smallBlind, bigBlind, aiCount }) => {
    socket.join(room);

    if (!rooms.has(room)) {
      rooms.set(room, initializeGame(smallBlind ?? SMALL_BLIND, bigBlind ?? BIG_BLIND));
    }

    const game = rooms.get(room)!;
    const playerIndex = game.players.length;
    game.players.push(createPlayer(clientId, username));

    const sessionData: PlayerSession = { room, playerIndex, name: username, clientId };
    sessions.set(socket.id, sessionData);
    clientRecords.set(clientId, { room, playerIndex, name: username, socketId: socket.id });

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
    console.log(chalk.blue(`  ${username} joined room "${room}" as player ${playerIndex} [cid: ${clientId.slice(0, 8)}]`));
  });

  socket.on('rejoinRoom', ({ clientId, room }) => {
    const record = clientRecords.get(clientId);

    if (!record || record.room !== room) {
      socket.emit('error', { message: 'SESSION_NOT_FOUND' });
      return;
    }

    const game = rooms.get(room);
    if (!game) {
      socket.emit('error', { message: 'ROOM_NOT_FOUND' });
      return;
    }

    socket.join(room);
    sessions.set(socket.id, { room: record.room, playerIndex: record.playerIndex, name: record.name, clientId });
    clientRecords.set(clientId, { ...record, socketId: socket.id });

    socket.emit('roomJoined', { playerIndex: record.playerIndex, game });

    socket.broadcast
      .to(room)
      .emit('message', { userId: socket.id, username: 'System', text: `${record.name} reconnected` });

    broadcastGame(room);
    console.log(chalk.cyan(`  ${record.name} rejoined room "${room}" as player ${record.playerIndex} [cid: ${clientId.slice(0, 8)}]`));
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

  socket.on('rebuy', ({ amount }) => {
    const session = sessions.get(socket.id);
    if (!session) return;

    const game = rooms.get(session.room);
    if (!game) return;

    const player = game.players[session.playerIndex];
    if (!player || player.stack > 0) return; // only busted players can rebuy

    const validAmount = Math.max(100, Math.min(10_000, Math.floor(amount)));
    player.stack = validAmount;
    // If between hands, activate them immediately so they're dealt in next hand
    if (game.stage === 0) player.isActive = true;

    broadcastGame(session.room);
    console.log(chalk.green(`  ${session.name} rebuys $${validAmount} in room "${session.room}"`));
  });

  socket.on('leaveRoom', () => {
    const session = sessions.get(socket.id);
    if (!session) return;

    const game = rooms.get(session.room);
    if (!game) return;

    const pi = session.playerIndex;
    const player = game.players[pi];
    if (!player) return;

    sessions.delete(socket.id);
    clientRecords.delete(session.clientId);

    // If it's their turn mid-hand, fold first so the hand can continue
    if (game.stage >= 1 && game.stage <= 4 && game.actionOn === pi && player.isActive) {
      clearTurnTimer(session.room);
      const { result } = fold(game, pi);
      result.actionsRemaining = Math.max(0, result.actionsRemaining - 1);
      result.actionOn = nextPlayer(result, pi);
      result.players[pi].hasLeft = true;
      result.players[pi].stack = 0;
      handleActionResult(session.room, result);
    } else {
      player.isActive = false;
      player.hasLeft = true;
      player.stack = 0;
      broadcastGame(session.room);
    }

    console.log(chalk.yellow(`  ${session.name} left room "${session.room}"`));
  });

  socket.on('disconnect', () => {
    const session = sessions.get(socket.id);
    sessions.delete(socket.id);
    if (session) {
      // Mark the persistent record as having no active socket — do NOT delete it
      const record = clientRecords.get(session.clientId);
      if (record) clientRecords.set(session.clientId, { ...record, socketId: null });

      // Do NOT clear the turn timer — let it fire so the game doesn't freeze
      // if the disconnected player had the action. Auto-fold handles it.
      console.log(chalk.red(`- disconnected: ${session.name} (${socket.id}) [cid: ${session.clientId.slice(0, 8)}]`));
    }
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// Start
// ──────────────────────────────────────────────────────────────────────────────

httpServer.listen(PORT, () => {
  console.log(chalk.green(`Server listening on :${PORT}`));
});
