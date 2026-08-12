import { describe, it, expect } from 'vitest';
import { findQuickRoom, countSeated, type PublicRoomSummary } from '../controllers/quickplay';
import { initializeGame, createPlayer } from '../controllers/gameplay';
import type { Poker } from '../controllers/types';

const MAX_PLAYERS = 6;

const makeRoomWithPlayers = (count: number): Poker => {
  const game = initializeGame();
  for (let i = 0; i < count; i++) {
    game.players.push(createPlayer(`id-${i}`, `Player${i}`));
  }
  return game;
};

/** Rooms as the Lobby stores them: a code and the seat count the table reported. */
const summary = (code: string, activePlayers: number): PublicRoomSummary => ({
  code,
  activePlayers,
});

describe('countSeated', () => {
  it('counts every seated player', () => {
    expect(countSeated(makeRoomWithPlayers(4))).toBe(4);
  });

  it('does not count inactive busted players toward room capacity', () => {
    const game = makeRoomWithPlayers(MAX_PLAYERS);
    // Bust out half the players
    for (let i = 0; i < 3; i++) {
      game.players[i].isActive = false;
      game.players[i].stack = 0;
    }
    expect(countSeated(game)).toBe(3);
  });

  it('still counts busted players who can rebuy', () => {
    const game = makeRoomWithPlayers(2);
    game.players[0].isActive = false;
    game.players[0].stack = 500;
    expect(countSeated(game)).toBe(2);
  });
});

describe('findQuickRoom', () => {
  it('returns null when there are no public rooms', () => {
    expect(findQuickRoom([], MAX_PLAYERS)).toBeNull();
  });

  it('returns the only available room', () => {
    expect(findQuickRoom([summary('QUICK-1', 2)], MAX_PLAYERS)).toBe('QUICK-1');
  });

  it('prefers the room with the most players (to fill tables)', () => {
    const rooms = [summary('QUICK-A', 1), summary('QUICK-B', 4), summary('QUICK-C', 2)];
    expect(findQuickRoom(rooms, MAX_PLAYERS)).toBe('QUICK-B');
  });

  it('skips rooms that are full', () => {
    const rooms = [summary('FULL', MAX_PLAYERS), summary('OPEN', 3)];
    expect(findQuickRoom(rooms, MAX_PLAYERS)).toBe('OPEN');
  });

  it('returns null when all public rooms are full', () => {
    const rooms = [summary('FULL-1', MAX_PLAYERS), summary('FULL-2', MAX_PLAYERS)];
    expect(findQuickRoom(rooms, MAX_PLAYERS)).toBeNull();
  });

  it('returns null when every known room is empty, so a fresh one is created', () => {
    expect(findQuickRoom([summary('RESERVED', 0)], MAX_PLAYERS)).toBeNull();
  });

  it('does not count inactive busted players toward room capacity', () => {
    const game = makeRoomWithPlayers(MAX_PLAYERS);
    for (let i = 0; i < 3; i++) {
      game.players[i].isActive = false;
      game.players[i].stack = 0;
    }
    expect(findQuickRoom([summary('BUSTED', countSeated(game))], MAX_PLAYERS)).toBe('BUSTED');
  });
});
