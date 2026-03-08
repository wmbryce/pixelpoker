import { Server } from 'socket.io';
import chalk from 'chalk';
import type { Poker, ServerToClientEvents, ClientToServerEvents, GameAction } from './types';
import { advanceGameStage, awardPotDirectly } from './gameplay';
import { raise, call, fold, nextPlayer } from './actions';
import { makeAIDecision } from './ai';

const TURN_DURATION_MS = 30_000;
const AUTO_DEAL_DELAY_MS = 4_000;

// ──────────────────────────────────────────────────────────────────────────────
// Shared state
// ──────────────────────────────────────────────────────────────────────────────

export const rooms = new Map<string, Poker>();
export const publicRooms = new Set<string>();

const timers = new Map<string, ReturnType<typeof setTimeout>>();
const autoDealTimers = new Map<string, ReturnType<typeof setTimeout>>();

export interface PlayerSession {
  room: string;
  playerIndex: number;
  name: string;
  clientId: string;
}

export interface ClientRecord {
  room: string;
  playerIndex: number;
  name: string;
  socketId: string | null;
}

export const sessions = new Map<string, PlayerSession>();
export const clientRecords = new Map<string, ClientRecord>();

// ──────────────────────────────────────────────────────────────────────────────
// IO reference — set once at startup via init()
// ──────────────────────────────────────────────────────────────────────────────

let io: Server<ClientToServerEvents, ServerToClientEvents>;

export function init(server: Server<ClientToServerEvents, ServerToClientEvents>) {
  io = server;
}

// ──────────────────────────────────────────────────────────────────────────────
// Broadcast — personalized per player (hides opponents' cards until showdown)
// ──────────────────────────────────────────────────────────────────────────────

export const broadcastGame = (room: string) => {
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
// Turn timer
// ──────────────────────────────────────────────────────────────────────────────

export const clearTurnTimer = (room: string) => {
  const t = timers.get(room);
  if (t) {
    clearTimeout(t);
    timers.delete(room);
  }
};

export const startTurnTimer = (room: string) => {
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
// Auto-deal helper
// ──────────────────────────────────────────────────────────────────────────────

export const clearAutoDeal = (room: string) => {
  const t = autoDealTimers.get(room);
  if (t) {
    clearTimeout(t);
    autoDealTimers.delete(room);
  }
};

export const scheduleAutoDeal = (room: string) => {
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
// Action processing
// ──────────────────────────────────────────────────────────────────────────────

export const processGameAction = (game: Poker, action: GameAction): Poker | null => {
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
export const handleActionResult = (room: string, result: Poker) => {
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
