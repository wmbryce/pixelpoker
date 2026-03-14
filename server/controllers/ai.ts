import type { Poker, GameAction, CardType } from './types';

// pokersolver has no type definitions
// eslint-disable-next-line @typescript-eslint/no-require-imports
const Hand = require('pokersolver').Hand;

// ──────────────────────────────────────────────────────────────────────────────
// Hand strength evaluation
// ──────────────────────────────────────────────────────────────────────────────

const RANK_VALUES: Record<string, number> = {
  '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8,
  '9': 9, 'T': 10, 'J': 11, 'Q': 12, 'K': 13, 'A': 14,
};

/** Pre-flop hand strength (0–1) based on hole cards only */
function preFlopStrength(cards: CardType[]): number {
  if (cards.length < 2) return 0.3;

  const [a, b] = cards;
  const rA = RANK_VALUES[a.value[0]] ?? 7;
  const rB = RANK_VALUES[b.value[0]] ?? 7;
  const high = Math.max(rA, rB);
  const low = Math.min(rA, rB);
  const paired = rA === rB;
  const suited = a.suite === b.suite;
  const gap = high - low;

  // Base score from card ranks (scaled 0–1)
  let score = (high + low) / 28;

  if (paired) {
    // Pairs: 22 ≈ 0.55, AA ≈ 0.95
    score = 0.5 + (high / 14) * 0.45;
  } else {
    // Suited bonus
    if (suited) score += 0.06;
    // Connectedness bonus
    if (gap === 1) score += 0.04;
    else if (gap === 2) score += 0.02;
    // Big card bonus (both 10+)
    if (low >= 10) score += 0.08;
    // Penalty for wide gaps
    if (gap >= 5) score -= 0.05;
  }

  return Math.max(0, Math.min(1, score));
}

/** Post-flop hand strength using pokersolver rank (1–9) normalized to 0–1 */
function postFlopStrength(holeCards: CardType[], tableCards: CardType[]): number {
  const all = [...holeCards, ...tableCards].map((c) => c.value);
  const solved = Hand.solve(all);
  // rank: 1=high card, 2=pair, 3=two pair, 4=trips, 5=straight, 6=flush,
  //        7=full house, 8=quads, 9=straight flush
  const rank: number = solved.rank;

  // Map ranks to a 0–1 scale with finer granularity
  const BASE: Record<number, number> = {
    1: 0.10, // high card
    2: 0.30, // pair
    3: 0.50, // two pair
    4: 0.65, // trips
    5: 0.72, // straight
    6: 0.78, // flush
    7: 0.85, // full house
    8: 0.92, // quads
    9: 0.97, // straight flush
  };

  let strength = BASE[rank] ?? 0.1;

  // Bonus for using hole cards in the made hand (vs playing the board)
  if (rank >= 2) {
    const holeValues = holeCards.map((c) => c.value);
    const handCards: string[] = solved.cards.map(
      (c: { value: string; suit: string }) => c.value + c.suit,
    );
    const usesHole = holeValues.some((v) => handCards.includes(v));
    if (usesHole) strength += 0.05;
  }

  // For pairs, adjust by pair rank (pair of aces >> pair of 2s)
  if (rank === 2) {
    const pairCard = solved.cards[0];
    const pairRank = RANK_VALUES[pairCard.value] ?? 7;
    strength += (pairRank - 7) * 0.015;
  }

  return Math.max(0, Math.min(1, strength));
}

// ──────────────────────────────────────────────────────────────────────────────
// Decision logic
// ──────────────────────────────────────────────────────────────────────────────

/** Add some noise to make the AI less predictable */
function jitter(value: number, amount = 0.08): number {
  return value + (Math.random() - 0.5) * 2 * amount;
}

export const makeAIDecision = (game: Poker, playerIndex: number): GameAction => {
  const player = game.players[playerIndex];
  const amountToCall = game.currentBet - player.lastBet;
  const potOdds = amountToCall > 0 ? amountToCall / (game.pot + amountToCall) : 0;

  // Evaluate hand strength
  const isPreFlop = game.tableCards.length === 0;
  const rawStrength = isPreFlop
    ? preFlopStrength(player.cards)
    : postFlopStrength(player.cards, game.tableCards);
  const strength = jitter(rawStrength);

  // Count active opponents (for position-based adjustments)
  const activeOpponents = game.players.filter(
    (p, i) => i !== playerIndex && p.isActive && !p.isAllIn,
  ).length;

  // Position advantage: acting later is better
  const positionBonus = activeOpponents <= 1 ? 0.05 : 0;

  const effectiveStrength = strength + positionBonus;

  // ── Nothing to call (check or bet) ──
  if (amountToCall === 0) {
    if (effectiveStrength > 0.7 && player.stack >= game.bigBlind * 2) {
      // Strong hand: bet/raise
      const sizeFactor = effectiveStrength > 0.85 ? 3 : 2;
      const bet = Math.min(
        game.currentBet + game.bigBlind * sizeFactor,
        player.lastBet + player.stack,
      );
      if (bet > game.currentBet) {
        return { type: 'raise', playerIndex, bet };
      }
    }
    // Check
    return { type: 'call', playerIndex };
  }

  // ── Facing a bet ──
  const callFraction = amountToCall / player.stack;

  // Fold weak hands, especially facing large bets
  if (effectiveStrength < 0.25 || (effectiveStrength < 0.4 && potOdds > 0.3)) {
    // Occasional bluff (5% of the time)
    if (Math.random() < 0.05 && player.stack >= amountToCall) {
      return { type: 'call', playerIndex };
    }
    return { type: 'fold', playerIndex };
  }

  // Strong hand: raise
  if (effectiveStrength > 0.65 && callFraction < 0.5) {
    const raiseSize = effectiveStrength > 0.8
      ? Math.min(game.currentBet * 3, player.lastBet + player.stack)
      : Math.min(game.currentBet * 2, player.lastBet + player.stack);

    const minRaise = game.currentBet + game.lastRaiseSize;
    if (raiseSize >= minRaise && raiseSize > game.currentBet) {
      // Very strong hands: occasionally go all-in
      if (effectiveStrength > 0.85 && Math.random() < 0.3) {
        return { type: 'raise', playerIndex, bet: player.lastBet + player.stack };
      }
      return { type: 'raise', playerIndex, bet: raiseSize };
    }
  }

  // Medium hand or can't raise: call if pot odds are favorable
  if (effectiveStrength > potOdds || callFraction < 0.15) {
    return { type: 'call', playerIndex };
  }

  // Pot odds unfavorable: fold
  return { type: 'fold', playerIndex };
};
