import { cloneDeep, isEqual } from 'lodash';
import { generateDeck } from './deck';
import type { CardType, Poker, PlayerType } from './types';

// pokersolver has no type definitions — import with require
// eslint-disable-next-line @typescript-eslint/no-require-imports
const Hand = require('pokersolver').Hand;

// ──────────────────────────────────────────────────────────────────────────────
// Factories
// ──────────────────────────────────────────────────────────────────────────────

export const createPlayer = (id: string, name: string): PlayerType => ({
  id,
  name,
  stack: 1000,
  cards: [],
  lastBet: 0,
  isActive: true,
  checked: false,
});

export const initializeGame = (): Poker => ({
  stage: 0,
  pot: 0,
  tableCards: [],
  deck: generateDeck(),
  players: [],
  winner: [],
  actionOn: 0,
  currentBet: 0,
  dealer: 0,
});

// ──────────────────────────────────────────────────────────────────────────────
// Dealing
// ──────────────────────────────────────────────────────────────────────────────

const dealPreFlop = (game: Poker): Poker => {
  const cardsToDeal = game.players.length * 2;
  let seat = game.dealer + 1 < game.players.length ? game.dealer + 1 : 0;
  const deck = game.deck.slice();

  for (let i = 0; i < cardsToDeal; i++) {
    const card = deck.pop();
    if (card) game.players[seat].cards.push(card);
    seat = seat + 1 < game.players.length ? seat + 1 : 0;
  }

  game.deck = deck;
  return game;
};

const dealCommunityCards = (game: Poker): Poker => {
  const count = game.stage === 1 ? 3 : 1; // flop = 3, turn/river = 1
  const deck = game.deck.slice();
  deck.pop(); // burn card
  for (let i = 0; i < count; i++) {
    const card = deck.pop();
    if (card) game.tableCards.push(card);
  }
  game.deck = deck;
  return game;
};

// ──────────────────────────────────────────────────────────────────────────────
// Showdown
// ──────────────────────────────────────────────────────────────────────────────

const solverCards = (cards: CardType[]): string[] => cards.map((c) => c.value);

const determineWinner = (game: Poker): void => {
  const activePlayers = game.players
    .map((p, i) => ({ player: p, index: i }))
    .filter(({ player }) => player.isActive);

  const hands = activePlayers.map(({ player }) =>
    Hand.solve(solverCards([...game.tableCards, ...player.cards]))
  );

  const winningHands: typeof hands = Hand.winners(hands);
  const winningPool = winningHands[0].cards.map((c: { value: string; suit: string }) => c.value + c.suit);

  const winningIndexes: number[] = [];
  for (let i = 0; i < hands.length; i++) {
    const pool = hands[i].cards.map((c: { value: string; suit: string }) => c.value + c.suit);
    if (isEqual(winningPool, pool)) winningIndexes.push(activePlayers[i].index);
  }

  game.winner = winningIndexes;
};

const distributeWinnings = (game: Poker): void => {
  const n = game.winner.length;
  if (n === 0) return;
  const share = Math.floor(game.pot / n);
  const remainder = game.pot % n;
  for (const idx of game.winner) {
    game.players[idx].stack += share;
  }
  game.pot = remainder;
};

const resetGame = (game: Poker): Poker => {
  game.deck = generateDeck();
  game.tableCards = [];
  game.winner = [];
  game.stage = 0;
  game.currentBet = 0;
  game.dealer = game.dealer + 1 < game.players.length ? game.dealer + 1 : 0;
  for (const player of game.players) {
    player.cards = [];
    player.isActive = true;
    player.lastBet = 0;
    player.checked = false;
  }
  return game;
};

// ──────────────────────────────────────────────────────────────────────────────
// Stage machine
// ──────────────────────────────────────────────────────────────────────────────

export const advanceGameStage = (game: Poker): Poker => {
  const next = cloneDeep(game);

  if (next.stage === 0) {
    dealPreFlop(next);
  } else if (next.stage < 4) {
    dealCommunityCards(next);
  } else if (next.stage === 4) {
    determineWinner(next);
    distributeWinnings(next);
  } else if (next.stage === 5) {
    return resetGame(next);
  }

  next.stage += 1;
  next.currentBet = 0;
  for (const player of next.players) {
    player.lastBet = 0;
    player.checked = false;
  }

  return next;
};
