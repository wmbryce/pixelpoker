import type { Poker } from './types';

/**
 * Finds the best public room to join: prefers the room with the most
 * active players that still has space. Returns null if no room is available.
 */
export function findQuickRoom(
  publicCodes: Set<string>,
  allRooms: Map<string, Poker>,
  maxPlayers: number,
): string | null {
  let bestRoom: string | null = null;
  let bestCount = 0;

  for (const code of publicCodes) {
    const game = allRooms.get(code);
    if (!game) {
      publicCodes.delete(code);
      continue;
    }
    const activePlayers = game.players.filter((p) => p.isActive || p.stack > 0).length;
    if (activePlayers < maxPlayers && activePlayers > bestCount) {
      bestRoom = code;
      bestCount = activePlayers;
    }
  }

  return bestRoom;
}
