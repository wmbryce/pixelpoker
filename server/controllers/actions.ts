import { cloneDeep } from 'lodash';
import type { Poker } from './types';

export const raise = (
  game: Poker,
  playerIndex: number,
  bet: number
): { result: Poker | null; error: string | null; isFullRaise: boolean } => {
  const player = game.players[playerIndex];
  const alreadyIn = player.lastBet;
  const additional = bet - alreadyIn;

  if (additional <= 0 || additional > player.stack) {
    return { result: null, error: 'Invalid raise amount', isFullRaise: false };
  }

  // A full raise meets the minimum re-raise size (at least lastRaiseSize above current bet)
  const isAllIn = additional === player.stack;
  const isFullRaise = bet >= game.currentBet + game.lastRaiseSize;

  // Must be a full raise OR an all-in (all-in for less is allowed as a short raise)
  if (!isFullRaise && !isAllIn) {
    return { result: null, error: 'Raise must meet the minimum raise size', isFullRaise: false };
  }

  const next = cloneDeep(game);
  next.players[playerIndex].stack -= additional;
  next.players[playerIndex].lastBet = bet;
  next.players[playerIndex].contributed += additional;
  next.players[playerIndex].isAllIn = next.players[playerIndex].stack === 0;
  next.players[playerIndex].lastAction = isAllIn ? 'ALL IN' : `RAISE $${bet}`;
  next.pot += additional;

  // Only raise currentBet if this bet exceeds it (short all-in does not lower it)
  if (bet > game.currentBet) {
    next.currentBet = bet;
  }

  // Track the new raise increment so future re-raises are sized correctly
  if (isFullRaise) {
    next.lastRaiseSize = bet - game.currentBet;
  }

  return { result: next, error: null, isFullRaise };
};

export const call = (
  game: Poker,
  playerIndex: number
): { result: Poker | null; error: string | null } => {
  const player = game.players[playerIndex];
  const owed = game.currentBet - player.lastBet;
  // Allow all-in calls: pay whatever is left in the stack
  const amount = Math.min(owed, player.stack);
  const isAllIn = amount > 0 && amount === player.stack && amount < owed;

  const next = cloneDeep(game);
  next.players[playerIndex].stack -= amount;
  next.pot += amount;
  next.players[playerIndex].lastBet += amount;
  next.players[playerIndex].contributed += amount;
  next.players[playerIndex].isAllIn = next.players[playerIndex].stack === 0;
  next.players[playerIndex].checked = amount === 0;
  next.players[playerIndex].lastAction = amount === 0 ? 'CHECK' : isAllIn ? 'ALL IN' : 'CALL';
  return { result: next, error: null };
};

export const fold = (
  game: Poker,
  playerIndex: number
): { result: Poker; error: null } => {
  const next = cloneDeep(game);
  next.players[playerIndex].isActive = false;
  next.players[playerIndex].lastAction = 'FOLD';
  return { result: next, error: null };
};

export const nextPlayer = (game: Poker, currentIndex: number): number => {
  const n = game.players.length;
  let next = (currentIndex + 1) % n;
  // Skip folded and all-in players
  while ((!game.players[next].isActive || game.players[next].isAllIn) && next !== currentIndex) {
    next = (next + 1) % n;
  }
  return next;
};
