import { describe, it, expect } from 'bun:test';
import { raise, call, fold, nextPlayer } from '../controllers/actions';
import { initializeGame, createPlayer } from '../controllers/gameplay';

const makeGame = () => {
  const game = initializeGame();
  game.players.push(createPlayer('p0', 'Alice'));
  game.players.push(createPlayer('p1', 'Bob'));
  return game;
};

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

  it('does not mutate the original game', () => {
    const game = makeGame();
    raise(game, 0, 100);
    expect(game.players[0].stack).toBe(1000);
  });
});

describe('call', () => {
  it('matches the current bet', () => {
    const game = makeGame();
    game.currentBet = 100;
    const { result, error } = call(game, 1);
    expect(error).toBeNull();
    expect(result!.players[1].stack).toBe(900);
    expect(result!.pot).toBe(100);
    expect(result!.players[1].lastBet).toBe(100);
  });

  it('sets checked=true when there is no bet to call', () => {
    const game = makeGame();
    game.currentBet = 0;
    const { result } = call(game, 0);
    expect(result!.players[0].checked).toBe(true);
  });
});

describe('fold', () => {
  it('marks the player as inactive', () => {
    const game = makeGame();
    const { result } = fold(game, 0);
    expect(result.players[0].isActive).toBe(false);
    expect(result.players[1].isActive).toBe(true);
  });

  it('does not mutate the original game', () => {
    const game = makeGame();
    fold(game, 0);
    expect(game.players[0].isActive).toBe(true);
  });
});

describe('nextPlayer', () => {
  it('advances to the next active player', () => {
    const game = makeGame();
    expect(nextPlayer(game, 0)).toBe(1);
    expect(nextPlayer(game, 1)).toBe(0);
  });

  it('skips folded players', () => {
    const game = makeGame();
    const { result } = fold(game, 1);
    // Only player 0 is active — next from 0 should stay 0
    expect(nextPlayer(result, 0)).toBe(0);
  });
});
