import { describe, it, expect, beforeEach } from 'vitest';
import { env, runInDurableObject } from 'cloudflare:test';
import { QUICK_ROOM_PREFIX } from '@pixelpoker/shared/src/protocol';
import { LOBBY_SINGLETON, type Lobby } from '../durable/Lobby';

const lobby = () => env.LOBBY.getByName(LOBBY_SINGLETON);

/** Write a directory row directly, so its age can be chosen. */
const seedRoom = (code: string, activePlayers: number, updatedAt: number): Promise<void> =>
  runInDurableObject(lobby(), async (_instance: Lobby, state) => {
    state.storage.sql.exec(
      'INSERT INTO public_rooms (code, active_players, updated_at) VALUES (?, ?, ?)',
      code,
      activePlayers,
      updatedAt,
    );
  });

const codes = (): Promise<string[]> =>
  runInDurableObject(lobby(), async (_instance: Lobby, state) =>
    state.storage.sql
      .exec<{ code: string }>('SELECT code FROM public_rooms ORDER BY code')
      .toArray()
      .map((row) => row.code),
  );

/** The lobby is a singleton, so its directory outlives an individual test. */
const clearLobby = (): Promise<void> =>
  runInDurableObject(lobby(), async (_instance: Lobby, state) => {
    state.storage.sql.exec('DELETE FROM public_rooms');
  });

describe('Lobby', () => {
  beforeEach(clearLobby);

  it('sends quickplay to the fullest table that still has room', async () => {
    await seedRoom(`${QUICK_ROOM_PREFIX}1`, 2, Date.now());
    await seedRoom(`${QUICK_ROOM_PREFIX}2`, 4, Date.now());

    expect((await lobby().findOrCreate()).room).toBe(`${QUICK_ROOM_PREFIX}2`);
  });

  it('reserves a fresh code when no table is joinable', async () => {
    const { room } = await lobby().findOrCreate();

    expect(room.startsWith(QUICK_ROOM_PREFIX)).toBe(true);
    expect(await codes()).toEqual([room]);
  });

  it('forgets a table whose occupancy report went stale, seats or not', async () => {
    const stale = `${QUICK_ROOM_PREFIX}STALE`;
    await seedRoom(stale, 3, Date.now() - 31 * 60_000);

    // A table that stopped reporting is dead — everyone closed their tab and
    // the seats folded away — so quickplay must not keep being sent to it.
    const { room } = await lobby().findOrCreate();

    expect(room).not.toBe(stale);
    expect(await codes()).toEqual([room]);
  });

  it('keeps a table that is still reporting', async () => {
    const live = `${QUICK_ROOM_PREFIX}LIVE`;
    await seedRoom(live, 3, Date.now() - 60_000);

    expect((await lobby().findOrCreate()).room).toBe(live);
  });

  it('removes a table that reports itself empty', async () => {
    const code = `${QUICK_ROOM_PREFIX}EMPTY`;
    await seedRoom(code, 2, Date.now());

    await lobby().reportRoom(code, 0);

    expect(await codes()).toEqual([]);
  });
});
