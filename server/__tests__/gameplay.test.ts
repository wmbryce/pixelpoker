import { describe, it, expect } from 'bun:test';
import { initializeGame, createPlayer, advanceGameStage } from '../controllers/gameplay';

const makeGame = (numPlayers = 2) => {
  const game = initializeGame();
  for (let i = 0; i < numPlayers; i++) {
    game.players.push(createPlayer(`id-${i}`, `Player${i}`));
  }
  return game;
};

describe('initializeGame', () => {
  it('returns an empty game with a full deck', () => {
    const game = initializeGame();
    expect(game.stage).toBe(0);
    expect(game.pot).toBe(0);
    expect(game.players).toHaveLength(0);
    expect(game.deck).toHaveLength(52);
    expect(game.tableCards).toHaveLength(0);
    expect(game.winner).toHaveLength(0);
  });
});

describe('createPlayer', () => {
  it('creates a player with 1000 chips and no cards', () => {
    const p = createPlayer('abc', 'Alice');
    expect(p.id).toBe('abc');
    expect(p.name).toBe('Alice');
    expect(p.stack).toBe(1000);
    expect(p.cards).toHaveLength(0);
    expect(p.isActive).toBe(true);
    expect(p.checked).toBe(false);
  });
});

describe('advanceGameStage (pre-flop)', () => {
  it('deals 2 cards to each player on stage 0 → 1', () => {
    const game = makeGame(3);
    const next = advanceGameStage(game);
    expect(next.stage).toBe(1);
    for (const player of next.players) {
      expect(player.cards).toHaveLength(2);
    }
    // 52 - 6 dealt = 46 remaining
    expect(next.deck).toHaveLength(46);
  });
});

describe('advanceGameStage (flop)', () => {
  it('deals 3 community cards on stage 1 → 2', () => {
    let game = makeGame(2);
    game = advanceGameStage(game); // pre-flop
    const next = advanceGameStage(game);
    expect(next.stage).toBe(2);
    expect(next.tableCards).toHaveLength(3);
  });
});

describe('advanceGameStage (turn)', () => {
  it('deals 1 community card on stage 2 → 3', () => {
    let game = makeGame(2);
    game = advanceGameStage(game); // pre-flop
    game = advanceGameStage(game); // flop
    const next = advanceGameStage(game);
    expect(next.stage).toBe(3);
    expect(next.tableCards).toHaveLength(4);
  });
});

describe('advanceGameStage (river)', () => {
  it('deals 1 community card on stage 3 → 4', () => {
    let game = makeGame(2);
    game = advanceGameStage(game); // pre-flop
    game = advanceGameStage(game); // flop
    game = advanceGameStage(game); // turn
    const next = advanceGameStage(game);
    expect(next.stage).toBe(4);
    expect(next.tableCards).toHaveLength(5);
  });
});

describe('advanceGameStage (showdown)', () => {
  it('determines a winner and distributes the pot', () => {
    let game = makeGame(2);
    // Put 100 chips from each player into the pot properly
    game.players[0].stack -= 100;
    game.players[1].stack -= 100;
    game.pot = 200;
    const initialTotal =
      game.players.reduce((sum, p) => sum + p.stack, 0) + game.pot; // 2000
    game = advanceGameStage(game); // pre-flop
    game = advanceGameStage(game); // flop
    game = advanceGameStage(game); // turn
    game = advanceGameStage(game); // river
    const next = advanceGameStage(game); // showdown
    expect(next.stage).toBe(5);
    expect(next.winner.length).toBeGreaterThan(0);
    // Total chips should be conserved across stacks + any leftover pot
    const totalStack = next.players.reduce((sum, p) => sum + p.stack, 0);
    expect(totalStack + next.pot).toBe(initialTotal);
  });
});
