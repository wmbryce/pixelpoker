import { describe, it, expect } from 'bun:test';
import { findQuickRoom } from '../controllers/quickplay';
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

describe('findQuickRoom', () => {
  it('returns null when there are no public rooms', () => {
    const publicCodes = new Set<string>();
    const allRooms = new Map<string, Poker>();
    expect(findQuickRoom(publicCodes, allRooms, MAX_PLAYERS)).toBeNull();
  });

  it('returns the only available room', () => {
    const allRooms = new Map<string, Poker>();
    allRooms.set('QUICK-1', makeRoomWithPlayers(2));
    const publicCodes = new Set(['QUICK-1']);

    expect(findQuickRoom(publicCodes, allRooms, MAX_PLAYERS)).toBe('QUICK-1');
  });

  it('prefers the room with the most players (to fill tables)', () => {
    const allRooms = new Map<string, Poker>();
    allRooms.set('QUICK-A', makeRoomWithPlayers(1));
    allRooms.set('QUICK-B', makeRoomWithPlayers(4));
    allRooms.set('QUICK-C', makeRoomWithPlayers(2));
    const publicCodes = new Set(['QUICK-A', 'QUICK-B', 'QUICK-C']);

    expect(findQuickRoom(publicCodes, allRooms, MAX_PLAYERS)).toBe('QUICK-B');
  });

  it('skips rooms that are full', () => {
    const allRooms = new Map<string, Poker>();
    allRooms.set('FULL', makeRoomWithPlayers(MAX_PLAYERS));
    allRooms.set('OPEN', makeRoomWithPlayers(3));
    const publicCodes = new Set(['FULL', 'OPEN']);

    expect(findQuickRoom(publicCodes, allRooms, MAX_PLAYERS)).toBe('OPEN');
  });

  it('returns null when all public rooms are full', () => {
    const allRooms = new Map<string, Poker>();
    allRooms.set('FULL-1', makeRoomWithPlayers(MAX_PLAYERS));
    allRooms.set('FULL-2', makeRoomWithPlayers(MAX_PLAYERS));
    const publicCodes = new Set(['FULL-1', 'FULL-2']);

    expect(findQuickRoom(publicCodes, allRooms, MAX_PLAYERS)).toBeNull();
  });

  it('cleans up stale public room codes that no longer exist', () => {
    const allRooms = new Map<string, Poker>();
    allRooms.set('REAL', makeRoomWithPlayers(2));
    const publicCodes = new Set(['GHOST', 'REAL']);

    findQuickRoom(publicCodes, allRooms, MAX_PLAYERS);

    expect(publicCodes.has('GHOST')).toBe(false);
    expect(publicCodes.has('REAL')).toBe(true);
  });

  it('does not count inactive busted players toward room capacity', () => {
    const game = makeRoomWithPlayers(MAX_PLAYERS);
    // Bust out half the players
    for (let i = 0; i < 3; i++) {
      game.players[i].isActive = false;
      game.players[i].stack = 0;
    }
    const allRooms = new Map<string, Poker>();
    allRooms.set('BUSTED', game);
    const publicCodes = new Set(['BUSTED']);

    expect(findQuickRoom(publicCodes, allRooms, MAX_PLAYERS)).toBe('BUSTED');
  });
});
