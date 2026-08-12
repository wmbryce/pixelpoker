import { describe, it, expect } from 'vitest';
import { initializeGame, createPlayer, createAIPlayer, advanceGameStage } from '../controllers/gameplay';
import {
  planTurn,
  prepareNextHand,
  resolveActionResult,
  runOutBoard,
  foldAndAdvance,
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
