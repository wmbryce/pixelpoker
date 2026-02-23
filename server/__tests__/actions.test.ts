import { describe, it, expect } from 'bun:test';
import { raise, call, fold, nextPlayer } from '../controllers/actions';
import { initializeGame, createPlayer } from '../controllers/gameplay';

const makeGame = () => {
  const game = initializeGame();
  game.players.push(createPlayer('p0', 'Alice'));
  game.players.push(createPlayer('p1', 'Bob'));
  return game;
};

// ──────────────────────────────────────────────────────────────────────────────
// raise
// ──────────────────────────────────────────────────────────────────────────────

describe('raise', () => {
  it('deducts chips from player and adds to pot', () => {
    const game = makeGame();
    const { result, error } = raise(game, 0, 100);
    expect(error).toBeNull();
    expect(result!.players[0].stack).toBe(900);
    expect(result!.pot).toBe(100);
    expect(result!.currentBet).toBe(100);
  });

  it('rejects a bet larger than the player stack', () => {
    const game = makeGame();
    const { result, error } = raise(game, 0, 9999);
    expect(result).toBeNull();
    expect(error).toBeTruthy();
  });

  it('accepts a bet equal to the full stack (all-in)', () => {
    const game = makeGame();
    const { result, error } = raise(game, 0, 1000);
    expect(error).toBeNull();
    expect(result!.players[0].stack).toBe(0);
    expect(result!.pot).toBe(1000);
    expect(result!.currentBet).toBe(1000);
  });

  it('rejects a bet one chip over the stack', () => {
    const game = makeGame();
    const { result, error } = raise(game, 0, 1001);
    expect(result).toBeNull();
    expect(error).toBeTruthy();
  });

  it('rejects a zero bet', () => {
    const game = makeGame();
    const { result, error } = raise(game, 0, 0);
    expect(result).toBeNull();
    expect(error).toBeTruthy();
  });

  it('does not mutate the original game', () => {
    const game = makeGame();
    raise(game, 0, 100);
    expect(game.players[0].stack).toBe(1000);
    expect(game.pot).toBe(0);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// call
// ──────────────────────────────────────────────────────────────────────────────

describe('call', () => {
  it('matches the current bet from zero', () => {
    const game = makeGame();
    game.currentBet = 100;
    const { result, error } = call(game, 1);
    expect(error).toBeNull();
    expect(result!.players[1].stack).toBe(900);
    expect(result!.pot).toBe(100);
    expect(result!.players[1].lastBet).toBe(100);
  });

  it('sets checked=true when there is nothing to call', () => {
    const game = makeGame();
    game.currentBet = 0;
    const { result } = call(game, 0);
    expect(result!.players[0].checked).toBe(true);
    expect(result!.players[0].stack).toBe(1000);
  });

  it('only pays the difference when a partial blind is already posted (SB scenario)', () => {
    // Simulates SB calling a BB: SB already posted 10, currentBet is 20 → pays 10 more
    const game = makeGame();
    game.currentBet = 20;
    game.players[0].stack = 990; // already deducted SB
    game.players[0].lastBet = 10;
    const { result, error } = call(game, 0);
    expect(error).toBeNull();
    expect(result!.players[0].stack).toBe(980); // paid 10 more, not 20
    expect(result!.players[0].lastBet).toBe(20);
    expect(result!.pot).toBe(10);
  });

  it('does not mutate the original game', () => {
    const game = makeGame();
    game.currentBet = 100;
    call(game, 1);
    expect(game.players[1].stack).toBe(1000);
    expect(game.pot).toBe(0);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// fold
// ──────────────────────────────────────────────────────────────────────────────

describe('fold', () => {
  it('marks the player as inactive', () => {
    const game = makeGame();
    const { result } = fold(game, 0);
    expect(result.players[0].isActive).toBe(false);
    expect(result.players[1].isActive).toBe(true);
  });

  it('does not affect the pot or stacks', () => {
    const game = makeGame();
    game.pot = 50;
    const { result } = fold(game, 0);
    expect(result.pot).toBe(50);
    expect(result.players[0].stack).toBe(1000);
  });

  it('does not mutate the original game', () => {
    const game = makeGame();
    fold(game, 0);
    expect(game.players[0].isActive).toBe(true);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// nextPlayer
// ──────────────────────────────────────────────────────────────────────────────

describe('nextPlayer', () => {
  it('advances to the next active player', () => {
    const game = makeGame();
    expect(nextPlayer(game, 0)).toBe(1);
    expect(nextPlayer(game, 1)).toBe(0);
  });

  it('skips folded players', () => {
    const game = makeGame();
    const { result } = fold(game, 1);
    // Bob folded — next from Alice should wrap back to Alice
    expect(nextPlayer(result, 0)).toBe(0);
  });

  it('returns the only remaining active player when all others have folded', () => {
    // 3-player game: players 1 and 2 fold
    const game = initializeGame();
    game.players.push(createPlayer('p0', 'Alice'));
    game.players.push(createPlayer('p1', 'Bob'));
    game.players.push(createPlayer('p2', 'Carol'));
    const { result: r1 } = fold(game, 1);
    const { result: r2 } = fold(r1, 2);
    expect(nextPlayer(r2, 0)).toBe(0);
    expect(nextPlayer(r2, 1)).toBe(0);
    expect(nextPlayer(r2, 2)).toBe(0);
  });
});
