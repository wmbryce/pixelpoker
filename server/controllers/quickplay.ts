import type { Poker } from './types';

export interface PublicRoomSummary {
  code: string;
  activePlayers: number;
}

/** Seats that count toward a table's capacity: still in, or busted but able to rebuy. */
export const countSeated = (game: Poker): number =>
  game.players.filter((p) => p.isActive || p.stack > 0).length;

/**
 * Finds the best public room to join: prefers the room with the most
 * active players that still has space. Returns null if no room is available.
 *
 * This used to take the whole room Map and count seats itself. With one Durable
 * Object per room there is no such Map — the Lobby object holds occupancy
 * counts reported by each room, so the selection works from those counts.
 */
export function findQuickRoom(rooms: PublicRoomSummary[], maxPlayers: number): string | null {
  let bestRoom: string | null = null;
  let bestCount = 0;

  for (const { code, activePlayers } of rooms) {
    if (activePlayers < maxPlayers && activePlayers > bestCount) {
      bestRoom = code;
      bestCount = activePlayers;
    }
  }

  return bestRoom;
}
