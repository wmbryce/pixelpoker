import { cloneDeep } from 'lodash';
import { generateDeck } from './deck';
import type { CardType, Poker, PlayerType } from './types';
import { SMALL_BLIND, BIG_BLIND } from './types';

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
  isAllIn: false,
  contributed: 0,
  checked: false,
  lastAction: null,
});

export const createAIPlayer = (seatIndex: number): PlayerType => ({
  id: `ai-${seatIndex}-${Date.now()}`,
  name: `BOT ${seatIndex + 1}`,
  stack: 1000,
  cards: [],
  lastBet: 0,
  isActive: true,
  isAllIn: false,
  contributed: 0,
  checked: false,
  isAI: true,
  lastAction: null,
});

export const initializeGame = (smallBlind = SMALL_BLIND, bigBlind = BIG_BLIND): Poker => ({
  stage: 0,
  pot: 0,
  tableCards: [],
  deck: generateDeck(),
  players: [],
  winner: [],
  winnerHandName: '',
  winnerCards: [],
  actionOn: 0,
  currentBet: 0,
  dealer: 0,
  smallBlind,
  bigBlind,
  timerDeadline: null,
  actionsRemaining: 0,
  lastRaiseSize: bigBlind,
});

// ──────────────────────────────────────────────────────────────────────────────
// Dealing
// ──────────────────────────────────────────────────────────────────────────────

const dealPreFlop = (game: Poker): Poker => {
  const n = game.players.length;
  const cardsToDeal = n * 2;
  let seat = (game.dealer + 1) % n;
  const deck = game.deck.slice();

  for (let i = 0; i < cardsToDeal; i++) {
    const card = deck.pop();
    if (card) game.players[seat].cards.push(card);
    seat = (seat + 1) % n;
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
// Blinds
// ──────────────────────────────────────────────────────────────────────────────

const postBlinds = (game: Poker): void => {
  const n = game.players.length;
  if (n < 2) return;

  const sbIndex = (game.dealer + 1) % n;
  const bbIndex = (game.dealer + 2) % n;

  const sbAmount = Math.min(game.smallBlind, game.players[sbIndex].stack);
  game.players[sbIndex].stack -= sbAmount;
  game.players[sbIndex].lastBet = sbAmount;
  game.players[sbIndex].contributed += sbAmount;
  game.players[sbIndex].isAllIn = game.players[sbIndex].stack === 0;
  game.pot += sbAmount;

  const bbAmount = Math.min(game.bigBlind, game.players[bbIndex].stack);
  game.players[bbIndex].stack -= bbAmount;
  game.players[bbIndex].lastBet = bbAmount;
  game.players[bbIndex].contributed += bbAmount;
  game.players[bbIndex].isAllIn = game.players[bbIndex].stack === 0;
  game.pot += bbAmount;

  game.currentBet = game.bigBlind;
  game.actionOn = (game.dealer + 3) % n;

  // All non-all-in players must act pre-flop (including blinds who can raise)
  game.actionsRemaining = game.players.filter((p) => p.isActive && !p.isAllIn).length;
};

// ──────────────────────────────────────────────────────────────────────────────
// Side pots
// ──────────────────────────────────────────────────────────────────────────────

interface SidePot {
  amount: number;
  eligible: number[]; // player indexes who can win this pot
}

const computeSidePots = (players: PlayerType[]): SidePot[] => {
  const totalContributed = players.reduce((s, p) => s + p.contributed, 0);
  if (totalContributed === 0) return []; // no contribution data — caller falls back

  // Unique contribution levels, sorted ascending
  const levels = [...new Set(players.map((p) => p.contributed).filter((c) => c > 0))].sort(
    (a, b) => a - b,
  );

  const pots: SidePot[] = [];
  let prevLevel = 0;

  for (const level of levels) {
    const increment = level - prevLevel;
    const numContributors = players.filter((p) => p.contributed >= level).length;
    const potAmount = increment * numContributors;

    // Active (not folded) players who contributed at least this much are eligible
    const eligible = players
      .map((p, i) => ({ p, i }))
      .filter(({ p }) => p.isActive && p.contributed >= level)
      .map(({ i }) => i);

    if (potAmount > 0 && eligible.length > 0) {
      pots.push({ amount: potAmount, eligible });
    }

    prevLevel = level;
  }

  return pots;
};

// ──────────────────────────────────────────────────────────────────────────────
// Showdown — winner determination + winnings distribution
// ──────────────────────────────────────────────────────────────────────────────

type SolverHand = ReturnType<typeof Hand.solve>;

const solverCards = (cards: CardType[]): string[] => cards.map((c) => c.value);

const determineWinner = (game: Poker): void => {
  const activePlayers = game.players
    .map((p, i) => ({ player: p, index: i }))
    .filter(({ player }) => player.isActive);

  const handByIndex = new Map<number, SolverHand>(
    activePlayers.map(({ player, index }) => [
      index,
      Hand.solve(solverCards([...game.tableCards, ...player.cards])),
    ]),
  );

  const sidePots = computeSidePots(game.players);
  const totalWon = new Map<number, number>();
  const allWinners = new Set<number>();
  let bestHand: SolverHand | null = null;

  const applyPot = (amount: number, eligible: number[]) => {
    const eligibleHands = eligible.map((idx) => handByIndex.get(idx)!);
    const winningHands: SolverHand[] = Hand.winners(eligibleHands);

    // Use reference identity: Hand.winners returns references to the same objects
    // from the input array, so includes() correctly identifies all tied winners.
    const potWinners: number[] = eligible.filter((_, i) => winningHands.includes(eligibleHands[i]));

    const share = Math.floor(amount / potWinners.length);
    const remainder = amount % potWinners.length;
    for (const idx of potWinners) {
      totalWon.set(idx, (totalWon.get(idx) ?? 0) + share);
      allWinners.add(idx);
    }
    if (remainder > 0) {
      totalWon.set(potWinners[0], (totalWon.get(potWinners[0]) ?? 0) + remainder);
    }

    if (!bestHand) bestHand = winningHands[0];
  };

  const allActiveIndexes = activePlayers.map(({ index }) => index);

  if (sidePots.length > 0) {
    // If contributions don't cover the full pot (e.g. pot was set manually in tests,
    // or chips went in before tracking started), distribute the remainder first
    // as a pot that all active players are eligible for.
    const trackedTotal = sidePots.reduce((s, p) => s + p.amount, 0);
    if (trackedTotal < game.pot) {
      applyPot(game.pot - trackedTotal, allActiveIndexes);
    }
    for (const { amount, eligible } of sidePots) {
      applyPot(amount, eligible);
    }
  } else {
    // No contribution tracking data — split full pot among all active players
    applyPot(game.pot, allActiveIndexes);
  }

  for (const [idx, amount] of totalWon.entries()) {
    game.players[idx].stack += amount;
  }
  game.pot = 0;

  game.winner = [...allWinners];
  if (bestHand) {
    const h = bestHand as SolverHand;
    game.winnerHandName =
      h.name === 'Straight Flush' && h.descr === 'Royal Flush' ? 'Royal Flush' : (h.name as string);
    game.winnerCards = h.cards.map(
      (c: { value: string; suit: string }) => c.value + c.suit,
    );
  }
};

// ──────────────────────────────────────────────────────────────────────────────
// Award pot directly (everyone else folded — no pokersolver needed)
// ──────────────────────────────────────────────────────────────────────────────

export const awardPotDirectly = (game: Poker): Poker => {
  const next = cloneDeep(game);
  const active = next.players.map((p, i) => ({ p, i })).filter(({ p }) => p.isActive);
  if (active.length !== 1) return next;

  const { p: winner, i: winnerIndex } = active[0];
  winner.stack += next.pot;
  next.pot = 0;
  next.winner = [winnerIndex];
  next.winnerHandName = '';
  next.winnerCards = [];
  next.stage = 5;
  next.timerDeadline = null;
  next.actionsRemaining = 0;
  return next;
};

// ──────────────────────────────────────────────────────────────────────────────
// Reset
// ──────────────────────────────────────────────────────────────────────────────

const resetGame = (game: Poker): Poker => {
  game.deck = generateDeck();
  game.tableCards = [];
  game.winner = [];
  game.winnerHandName = '';
  game.winnerCards = [];
  game.stage = 0;
  game.currentBet = 0;
  game.timerDeadline = null;
  game.actionsRemaining = 0;
  game.lastRaiseSize = game.bigBlind;
  game.dealer = (game.dealer + 1) % game.players.length;
  for (const player of game.players) {
    player.cards = [];
    player.isActive = true;
    player.isAllIn = false;
    player.contributed = 0;
    player.lastBet = 0;
    player.checked = false;
    player.lastAction = null;
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
  } else if (next.stage === 5) {
    return resetGame(next);
  }

  next.stage += 1;
  next.currentBet = 0;
  next.lastRaiseSize = next.bigBlind; // min raise resets each street
  for (const player of next.players) {
    player.lastBet = 0;
    player.checked = false;
    player.lastAction = null;
  }

  // Post blinds after the pre-flop deal (also sets actionsRemaining and actionOn)
  if (next.stage === 1) {
    postBlinds(next);
  }

  // For flop / turn / river: set first-to-act and actions remaining
  if (next.stage >= 2 && next.stage <= 4) {
    next.actionsRemaining = next.players.filter((p) => p.isActive && !p.isAllIn).length;

    // First active non-all-in player left of the dealer
    const n = next.players.length;
    let firstToAct = (next.dealer + 1) % n;
    for (let i = 0; i < n; i++) {
      if (next.players[firstToAct].isActive && !next.players[firstToAct].isAllIn) break;
      firstToAct = (firstToAct + 1) % n;
    }
    next.actionOn = firstToAct;
  }

  return next;
};
