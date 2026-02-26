import { cloneDeep } from 'lodash';
import type { Poker } from './types';

export const raise = (
  game: Poker,
  playerIndex: number,
  bet: number
): { result: Poker | null; error: string | null } => {
  const alreadyIn = game.players[playerIndex].lastBet;
  const additional = bet - alreadyIn;
  const isAllIn = additional === game.players[playerIndex].stack;
  const meetsMinRaise = bet >= game.currentBet + game.bigBlind;
  if (additional <= 0 || additional > game.players[playerIndex].stack || (!meetsMinRaise && !isAllIn)) {
    return { result: null, error: 'Invalid raise amount' };
  }
  const next = cloneDeep(game);
  next.players[playerIndex].stack -= additional;
  next.players[playerIndex].lastBet = bet;
  next.players[playerIndex].lastAction = `RAISE $${bet}`;
  next.currentBet = bet;
  next.pot += additional;
  return { result: next, error: null };
};

export const call = (
  game: Poker,
  playerIndex: number
): { result: Poker | null; error: string | null } => {
  const amount = game.currentBet - game.players[playerIndex].lastBet;
  if (amount > game.players[playerIndex].stack) {
    return { result: null, error: 'Not enough chips to call' };
  }
  const next = cloneDeep(game);
  next.players[playerIndex].stack -= amount;
  next.pot += amount;
  next.players[playerIndex].lastBet = game.currentBet;
  next.players[playerIndex].checked = amount === 0;
  next.players[playerIndex].lastAction = amount === 0 ? 'CHECK' : 'CALL';
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
  // Skip folded players
  while (!game.players[next].isActive && next !== currentIndex) {
    next = (next + 1) % n;
  }
  return next;
};
