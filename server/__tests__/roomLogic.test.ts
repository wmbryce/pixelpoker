import { describe, it, expect } from 'vitest';
import { initializeGame, createPlayer, createAIPlayer, advanceGameStage } from '../controllers/gameplay';
import {
  planTurn,
  prepareNextHand,
  resolveActionResult,
  resolveDealtHand,
  runOutBoard,
  foldAndAdvance,
  processGameAction,
  TURN_DURATION_MS,
  AI_MIN_DELAY_MS,
  AI_MAX_DELAY_MS,
} from '../controllers/roomLogic';
import type { Poker } from '../controllers/types';

const makeGame = (numPlayers = 2): Poker => {
  const game = initializeGame(10, 20);
  for (let i = 0; i < numPlayers; i++) {
    game.players.push(createPlayer(`id-${i}`, `Player${i}`));
  }
  return game;
};

/** Two humans, pre-flop dealt and blinds posted. */
const dealtGame = (numPlayers = 2): Poker => advanceGameStage(makeGame(numPlayers));

describe('planTurn', () => {
  it('puts nobody on the clock between hands', () => {
    expect(planTurn(makeGame()).kind).toBe('none');
  });

  it('puts nobody on the clock at showdown', () => {
    const game = dealtGame();
    game.stage = 5;
    expect(planTurn(game).kind).toBe('none');
  });

  it('gives a human seat the full turn duration', () => {
    const plan = planTurn(dealtGame());
    expect(plan).toEqual({ kind: 'human', durationMs: TURN_DURATION_MS });
  });

  it('gives an AI seat a short randomised think delay', () => {
    const game = dealtGame(3);
    game.players[game.actionOn] = { ...createAIPlayer(game.actionOn, 'VINNY') };
    const plan = planTurn(game);

    expect(plan.kind).toBe('ai');
    if (plan.kind === 'ai') {
      expect(plan.delayMs).toBeGreaterThanOrEqual(AI_MIN_DELAY_MS);
      expect(plan.delayMs).toBeLessThanOrEqual(AI_MAX_DELAY_MS);
    }
  });

  it('puts nobody on the clock when every remaining seat is all-in', () => {
    const game = dealtGame();
    for (const player of game.players) player.isAllIn = true;
    expect(planTurn(game).kind).toBe('none');
  });
});

describe('resolveActionResult', () => {
  it('continues while actions remain', () => {
    const game = dealtGame(3);
    game.actionsRemaining = 2;
    expect(resolveActionResult(game).kind).toBe('continue');
  });

  it('awards the pot directly when everyone else folded', () => {
    const game = dealtGame();
    game.actionsRemaining = 0;
    game.players[1].isActive = false;

    const outcome = resolveActionResult(game);
    expect(outcome.kind).toBe('awardDirect');
    expect(outcome.game.stage).toBe(5);
    expect(outcome.game.winner).toEqual([0]);
  });

  it('runs the board out when at most one seat can still act', () => {
    const game = dealtGame();
    game.actionsRemaining = 0;
    for (const player of game.players) player.isAllIn = true;

    const outcome = resolveActionResult(game);
    expect(outcome.kind).toBe('runOut');
    expect(outcome.game.stage).toBe(5);
    expect(outcome.game.tableCards).toHaveLength(5);
  });

  it('advances to the next street when the betting round closes', () => {
    const game = dealtGame(3);
    game.actionsRemaining = 0;

    const outcome = resolveActionResult(game);
    expect(outcome.kind).toBe('advance');
    expect(outcome.game.stage).toBe(2);
    expect(outcome.game.tableCards).toHaveLength(3);
  });

  it('ends the hand the moment one seat is left, even with actions outstanding', () => {
    // Heads-up, the seat on the clock folded: the survivor has the pot, so
    // putting them back on a 30s clock only invites a second timeout — the
    // route by which a table used to end a hand with nobody active at all.
    const game = dealtGame();
    game.players[1].isActive = false;
    game.actionsRemaining = 1;

    const outcome = resolveActionResult(game);
    expect(outcome.kind).toBe('awardDirect');
    expect(outcome.game.stage).toBe(5);
    expect(outcome.game.winner).toEqual([0]);
    expect(outcome.game.pot).toBe(0);
  });

  it('still concludes the hand when no seat is left at all', () => {
    const game = dealtGame();
    for (const player of game.players) player.isActive = false;
    game.actionsRemaining = 0;

    const outcome = resolveActionResult(game);
    expect(outcome.kind).toBe('awardDirect');
    // Stage 5 is what the auto-deal keys off; anything else strands the table.
    expect(outcome.game.stage).toBe(5);
    expect(outcome.game.pot).toBe(0);
    expect(outcome.game.winner).toEqual([]);
  });
});

describe('resolveDealtHand', () => {
  /** Blinds larger than the stacks behind them, so the deal itself puts seats all-in. */
  const dealtOnOversizeBlinds = (stacks: number[]): Poker => {
    const game = makeGame(stacks.length);
    game.smallBlind = 200;
    game.bigBlind = 400;
    game.lastRaiseSize = 400;
    stacks.forEach((stack, i) => {
      game.players[i].stack = stack;
    });
    return advanceGameStage(game); // 0 → 1 (deals pre-flop, posts blinds)
  };

  it('leaves a hand alone while a seat still has a decision to make', () => {
    const outcome = resolveDealtHand(dealtGame(3));

    expect(outcome.kind).toBe('act');
    expect(outcome.game.stage).toBe(1);
    expect(outcome.game.tableCards).toHaveLength(0);
  });

  it('still gives the one seat that can act its turn rather than running out', () => {
    // The short seat is all-in on the blind; the deep seat has a call to make.
    const dealt = dealtOnOversizeBlinds([150, 5000]);
    expect(dealt.players.filter((p) => p.isActive && !p.isAllIn)).toHaveLength(1);

    const outcome = resolveDealtHand(dealt);
    expect(outcome.kind).toBe('act');
    expect(outcome.game.stage).toBe(1);
    expect(outcome.game.tableCards).toHaveLength(0);
    // And it is that seat holding the clock, not the one already all-in.
    expect(outcome.game.players[outcome.game.actionOn].isActive).toBe(true);
    expect(outcome.game.players[outcome.game.actionOn].isAllIn).toBe(false);
  });

  it('runs the board out when the blinds left nobody able to act', () => {
    const dealt = dealtOnOversizeBlinds([100, 150]);
    expect(dealt.players.some((p) => p.isActive && !p.isAllIn)).toBe(false);

    const outcome = resolveDealtHand(dealt);
    // Stage 5 or the auto-deal — which only fires from stage 5 — never runs, and
    // there is no clock to arm and no manual advance once a hand is under way.
    expect(outcome.kind).toBe('runOut');
    expect(outcome.game.stage).toBe(5);
    expect(outcome.game.tableCards).toHaveLength(5);
    expect(outcome.game.pot).toBe(0);
    expect(outcome.game.winner.length).toBeGreaterThan(0);
  });
});

describe('processGameAction', () => {
  const otherSeat = (game: Poker) => (game.actionOn + 1) % game.players.length;

  it('accepts an action from the seat on the clock', () => {
    const game = dealtGame(3);
    expect(processGameAction(game, { type: 'call', playerIndex: game.actionOn })).not.toBeNull();
  });

  it('refuses an action for a seat that is not on the clock', () => {
    const game = dealtGame(3);
    expect(processGameAction(game, { type: 'fold', playerIndex: otherSeat(game) })).toBeNull();
  });

  it('refuses a betting action outside a betting round', () => {
    const game = dealtGame();
    game.stage = 5;
    expect(processGameAction(game, { type: 'fold', playerIndex: game.actionOn })).toBeNull();
  });

  it('refuses an action from a seat that has already folded', () => {
    const game = dealtGame(3);
    game.players[game.actionOn].isActive = false;
    expect(processGameAction(game, { type: 'call', playerIndex: game.actionOn })).toBeNull();
  });

  it('refuses an under-minimum raise', () => {
    const game = dealtGame(3);
    const underMin = game.currentBet + 1; // above the bet, below the min re-raise
    expect(processGameAction(game, { type: 'raise', playerIndex: game.actionOn, bet: underMin }))
      .toBeNull();
  });

  it('deals the first hand on a manual advance between hands', () => {
    const result = processGameAction(makeGame(), { type: 'advance', playerIndex: -1 });
    expect(result?.stage).toBe(1);
  });

  it('refuses a manual advance once the auto-deal owns the transition', () => {
    // Stage 5 is the 4-second showdown pause. The scheduled deal is what moves
    // the table on from there; a manual advance would race it.
    const game = dealtGame();
    game.stage = 5;
    expect(processGameAction(game, { type: 'advance', playerIndex: -1 })).toBeNull();
  });
});

describe('runOutBoard', () => {
  it('deals through to showdown from any street', () => {
    const showdown = runOutBoard(dealtGame());
    expect(showdown.stage).toBe(5);
    expect(showdown.tableCards).toHaveLength(5);
    expect(showdown.winner.length).toBeGreaterThan(0);
  });
});

describe('foldAndAdvance', () => {
  it('folds the seat, decrements the action count and passes the turn on', () => {
    const game = dealtGame(3);
    const pi = game.actionOn;
    const before = game.actionsRemaining;

    const result = foldAndAdvance(game, pi);

    expect(result.players[pi].isActive).toBe(false);
    expect(result.players[pi].lastAction).toBe('FOLD');
    expect(result.actionsRemaining).toBe(before - 1);
    expect(result.actionOn).not.toBe(pi);
  });
});

describe('prepareNextHand', () => {
  it('deals the next hand when two seats can play', () => {
    const showdown = runOutBoard(dealtGame());
    const { game, paused } = prepareNextHand(showdown);

    expect(paused).toBe(false);
    expect(game.stage).toBe(1);
    expect(game.players.every((p) => p.cards.length === 2)).toBe(true);
  });

  it('tops AI seats back up so the table keeps moving', () => {
    const showdown = runOutBoard(dealtGame());
    showdown.players[1] = { ...createAIPlayer(1, 'VINNY'), stack: 0 };
    showdown.players[0].stack = 2000;

    const { game, paused } = prepareNextHand(showdown);

    expect(paused).toBe(false);
    expect(game.players[1].stack).toBeGreaterThan(0);
  });

  it('pauses at stage 0 when fewer than two seats can play', () => {
    const showdown = runOutBoard(dealtGame());
    showdown.players[0].stack = 0;
    showdown.players[1].stack = 0;

    const { game, paused } = prepareNextHand(showdown);

    expect(paused).toBe(true);
    expect(game.stage).toBe(0);
  });
});
