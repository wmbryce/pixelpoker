import { cloneDeep } from 'lodash';
import type { Poker } from './types';

export const raise = (
  game: Poker,
  playerIndex: number,
  bet: number
): { result: Poker | null; error: string | null } => {
  if (bet <= 0 || bet > game.players[playerIndex].stack) {
    return { result: null, error: 'Invalid bet amount' };
  }
  const next = cloneDeep(game);
  next.players[playerIndex].stack -= bet;
  next.players[playerIndex].lastBet = bet;
  next.currentBet = bet;
  next.pot += bet;
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
  return { result: next, error: null };
};

export const fold = (
  game: Poker,
  playerIndex: number
): { result: Poker; error: null } => {
  const next = cloneDeep(game);
  next.players[playerIndex].isActive = false;
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
