import type { Poker, GameAction } from './types';
import { advanceGameStage, awardPotDirectly } from './gameplay';
import { raise, call, fold, nextPlayer } from './actions';
import { getAIChat, type AIChat } from './ai';

/**
 * The decision half of the old `roomManager`. It used to interleave game rules
 * with `setTimeout` handles, a socket.io broadcast and a global room Map; those
 * effects now belong to the PokerRoom Durable Object. Everything here is pure,
 * so the rules stay unit-testable without a runtime.
 */

export const TURN_DURATION_MS = 30_000;
export const AUTO_DEAL_DELAY_MS = 4_000;
export const AI_MIN_DELAY_MS = 600;
export const AI_MAX_DELAY_MS = 2_000;
export const AI_CHAT_MIN_DELAY_MS = 300;
export const AI_CHAT_MAX_DELAY_MS = 1_000;

/** Chips an AI seat is topped back up to when it busts, so the table keeps moving. */
const AI_REBUY_STACK = 1000;

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

/** Fold a seat that ran out of time (or walked away) and pass the action on. */
export const foldAndAdvance = (game: Poker, playerIndex: number): Poker => {
  const { result } = fold(game, playerIndex);
  result.actionsRemaining = Math.max(0, result.actionsRemaining - 1);
  result.actionOn = nextPlayer(result, playerIndex);
  return result;
};

// ──────────────────────────────────────────────────────────────────────────────
// What to do after a betting action
// ──────────────────────────────────────────────────────────────────────────────

export type ActionOutcome =
  /** Betting continues — start the next seat's clock. */
  | { kind: 'continue'; game: Poker }
  /** Everyone folded — pot awarded, hand over. */
  | { kind: 'awardDirect'; game: Poker }
  /** Remaining players are all-in — board dealt to showdown, hand over. */
  | { kind: 'runOut'; game: Poker }
  /** Street complete — advanced; showdown if it landed on stage 5. */
  | { kind: 'advance'; game: Poker };

/** All remaining players are all-in — deal out the board to showdown. */
export const runOutBoard = (game: Poker): Poker => {
  let current = game;
  while (current.stage >= 1 && current.stage < 5) {
    current = advanceGameStage(current);
  }
  return current;
};

export const resolveActionResult = (result: Poker): ActionOutcome => {
  const inBettingRound = result.stage >= 1 && result.stage <= 4;
  if (!inBettingRound) return { kind: 'continue', game: result };

  const activePlayers = result.players.filter((p) => p.isActive);
  const playersWhoCanAct = activePlayers.filter((p) => !p.isAllIn);

  if (result.actionsRemaining > 0 && playersWhoCanAct.length > 0) {
    return { kind: 'continue', game: result };
  }

  if (activePlayers.length <= 1) return { kind: 'awardDirect', game: awardPotDirectly(result) };
  if (playersWhoCanAct.length <= 1) return { kind: 'runOut', game: runOutBoard(result) };
  return { kind: 'advance', game: advanceGameStage(result) };
};

// ──────────────────────────────────────────────────────────────────────────────
// Turn clock
// ──────────────────────────────────────────────────────────────────────────────

export type TurnPlan =
  /** Nobody is on the clock. */
  | { kind: 'none' }
  /** An AI seat acts after a human-like pause. */
  | { kind: 'ai'; delayMs: number }
  /** A human seat has `durationMs` to act before an auto-fold. */
  | { kind: 'human'; durationMs: number };

/**
 * Decide what the turn clock should be for the current seat. The Durable Object
 * turns this into an alarm; nothing here touches time or storage.
 */
export const planTurn = (game: Poker): TurnPlan => {
  if (game.stage < 1 || game.stage > 4) return { kind: 'none' };

  const playersWhoCanAct = game.players.filter((p) => p.isActive && !p.isAllIn).length;
  if (playersWhoCanAct === 0) return { kind: 'none' };

  if (game.players[game.actionOn]?.isAI) {
    return { kind: 'ai', delayMs: AI_MIN_DELAY_MS + Math.random() * (AI_MAX_DELAY_MS - AI_MIN_DELAY_MS) };
  }
  return { kind: 'human', durationMs: TURN_DURATION_MS };
};

// ──────────────────────────────────────────────────────────────────────────────
// Between hands
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Reset the finished hand and deal the next one. `paused` means fewer than two
 * seats can play, so the table waits at stage 0 for rebuys.
 */
export const prepareNextHand = (game: Poker): { game: Poker; paused: boolean } => {
  const reset = advanceGameStage(game); // 5 → 0 (resetGame — busted players set inactive)

  // Auto-rebuy busted AI players so the game keeps moving
  for (const player of reset.players) {
    if (player.isAI && player.stack === 0) {
      player.stack = AI_REBUY_STACK;
      player.isActive = true;
    }
  }

  const activePlayers = reset.players.filter((p) => p.isActive);
  if (activePlayers.length < 2) return { game: reset, paused: true };

  return { game: advanceGameStage(reset), paused: false }; // 0 → 1 (deals pre-flop, posts blinds)
};

/** Win/lose trash talk from AI seats once a hand concludes. */
export const handResultChats = (game: Poker): AIChat[] => {
  if (game.winner.length === 0) return [];

  const chats: AIChat[] = [];
  for (let i = 0; i < game.players.length; i++) {
    const player = game.players[i];
    if (!player.isAI) continue;

    let chat: AIChat | null = null;
    if (game.winner.includes(i)) chat = getAIChat(game, i, 'onWin');
    else if (player.isActive) chat = getAIChat(game, i, 'onLose');

    if (chat) chats.push(chat);
  }
  return chats;
};

export const aiChatDelayMs = (): number =>
  AI_CHAT_MIN_DELAY_MS + Math.random() * (AI_CHAT_MAX_DELAY_MS - AI_CHAT_MIN_DELAY_MS);
