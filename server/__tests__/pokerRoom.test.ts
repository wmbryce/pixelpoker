import { describe, it, expect, beforeEach, vi } from 'vitest';
import { env, runInDurableObject, runDurableObjectAlarm, evictDurableObject } from 'cloudflare:test';
import {
  QUICK_ROOM_PREFIX,
  WS_GAME_PATH,
  WS_PING,
  WS_PONG,
} from '@pixelpoker/shared/src/protocol';
import type { ActionType, ChatMessage, Poker } from '../controllers/types';
import { TURN_DURATION_MS, AUTO_DEAL_DELAY_MS } from '../controllers/roomLogic';
import type { PokerRoom } from '../durable/PokerRoom';
import { LOBBY_SINGLETON, type Lobby } from '../durable/Lobby';
import { TestClient } from './helpers/wsClient';

interface RoomJoined {
  playerIndex: number;
  game: Poker;
}

interface TimerRow extends Record<string, SqlStorageValue> {
  kind: string;
  due_at: number;
  seq: number;
}

/** The room enforces a 300ms per-connection cooldown between actions. */
const ACTION_COOLDOWN_MS = 300;

/** Sum of all player stacks + pot. Should be invariant through any hand. */
const totalChips = (game: Poker) => game.players.reduce((sum, p) => sum + p.stack, 0) + game.pot;

let roomCounter = 0;
const nextRoom = () => `TEST-ROOM-${++roomCounter}`;

const stubFor = (room: string) => env.POKER_ROOM.getByName(room);

/** Read the scheduler's rows straight out of the object's storage. */
const timers = (room: string): Promise<TimerRow[]> =>
  runInDurableObject(stubFor(room), async (_instance: PokerRoom, state) =>
    state.storage.sql
      .exec<TimerRow>('SELECT kind, due_at, seq FROM timers ORDER BY due_at')
      .toArray(),
  );

const storedGame = (room: string): Promise<Poker | null> =>
  runInDurableObject(stubFor(room), async (_instance: PokerRoom, state) => {
    const rows = state.storage.sql
      .exec<{ value: string }>("SELECT value FROM meta WHERE key = 'game'")
      .toArray();
    return rows.length > 0 ? (JSON.parse(rows[0].value) as Poker) : null;
  });

/**
 * Rewrite stored state behind the object's back, then evict so the object
 * reloads from storage instead of serving its in-memory cache.
 */
async function writeStoredGame(room: string, mutate: (game: Poker) => void): Promise<void> {
  await runInDurableObject(stubFor(room), async (_instance: PokerRoom, state) => {
    const row = state.storage.sql
      .exec<{ value: string }>("SELECT value FROM meta WHERE key = 'game'")
      .one();
    const game = JSON.parse(row.value) as Poker;
    mutate(game);
    state.storage.sql.exec("UPDATE meta SET value = ? WHERE key = 'game'", JSON.stringify(game));
  });
  await evictDurableObject(stubFor(room), { webSockets: 'hibernate' });
}

interface LobbyRow extends Record<string, SqlStorageValue> {
  code: string;
  active_players: number;
}

/** What the Lobby currently believes about public tables. */
const lobbyRooms = (): Promise<LobbyRow[]> =>
  runInDurableObject(env.LOBBY.getByName(LOBBY_SINGLETON), async (_instance: Lobby, state) =>
    state.storage.sql
      .exec<LobbyRow>('SELECT code, active_players FROM public_rooms ORDER BY code')
      .toArray(),
  );

/** The lobby is a singleton, so its directory outlives an individual test. */
const clearLobby = (): Promise<void> =>
  runInDurableObject(env.LOBBY.getByName(LOBBY_SINGLETON), async (_instance: Lobby, state) => {
    state.storage.sql.exec('DELETE FROM public_rooms');
  });

const alarmAt = (room: string) =>
  runInDurableObject(stubFor(room), async (_instance: PokerRoom, state) => state.storage.getAlarm());

/** Wait for an `updateGame` matching `predicate`, skipping earlier snapshots. */
async function waitForGame(
  client: TestClient,
  predicate: (game: Poker) => boolean,
  timeoutMs = 3_000,
): Promise<Poker> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const game = await client.waitFor<Poker>('updateGame', Math.max(50, deadline - Date.now()));
    if (predicate(game)) return game;
    if (Date.now() > deadline) throw new Error('timed out waiting for a matching updateGame');
  }
}

/** A table with every seat driven by its own WebSocket, as two browsers would. */
class Table {
  private constructor(
    readonly room: string,
    readonly clients: TestClient[],
  ) {}

  static async open(
    names: string[],
    opts: { aiCount?: number; room?: string } = {},
  ): Promise<Table> {
    const { room: fixedRoom, ...joinOpts } = opts;
    const room = fixedRoom ?? nextRoom();
    const clients: TestClient[] = [];

    for (const [index, username] of names.entries()) {
      const client = await TestClient.connect(WS_GAME_PATH, { room });
      client.emit('joinRoom', {
        username,
        room,
        clientId: `cid-${username}`,
        ...(index === 0 ? joinOpts : {}),
      });
      const joined = await client.waitFor<RoomJoined>('roomJoined');
      expect(joined.playerIndex).toBe(index);
      clients.push(client);
    }

    return new Table(room, clients);
  }

  /** Act as the seat that actually holds the action, respecting the cooldown. */
  async act(playerIndex: number, type: ActionType, bet?: number): Promise<void> {
    await TestClient.settle(ACTION_COOLDOWN_MS + 60);
    const client = this.clients[playerIndex] ?? this.clients[0];
    client.emit('gameAction', { type, playerIndex, ...(bet === undefined ? {} : { bet }) });
    await TestClient.settle(150);
  }

  /**
   * Start the first hand. Waits on stored state rather than a socket so the
   * clients' message streams stay intact for the test to assert on.
   */
  async deal(): Promise<Poker> {
    this.clients[0].emit('gameAction', { type: 'advance', playerIndex: 0 });
    return this.waitForStoredStage(1);
  }

  async waitForStoredStage(stage: number, timeoutMs = 3_000): Promise<Poker> {
    const deadline = Date.now() + timeoutMs;
    for (;;) {
      const game = await storedGame(this.room);
      if (game?.stage === stage) return game;
      if (Date.now() > deadline) {
        throw new Error(`timed out waiting for stage ${stage}, saw ${game?.stage ?? 'none'}`);
      }
      await TestClient.settle(25);
    }
  }

  /** Fold the seat on the clock, then let the last player close the round. */
  async foldToShowdown(): Promise<Poker> {
    const dealt = (await this.game())!;
    await this.act(dealt.actionOn, 'fold');
    const afterFold = (await this.game())!;
    if (afterFold.stage === 5) return afterFold;
    await this.act(afterFold.actionOn, 'call');
    return this.waitForStoredStage(5);
  }

  game(): Promise<Poker | null> {
    return storedGame(this.room);
  }
}

beforeEach(clearLobby);

describe('PokerRoom — seating', () => {
  it('seats two players at the same table and shows both to each other', async () => {
    const table = await Table.open(['ALICE', 'BOB']);

    const seen = await waitForGame(table.clients[0], (g) => g.players.length === 2);
    expect(seen.players.map((p) => p.name)).toEqual(['ALICE', 'BOB']);
  });

  it('rejects a seventh player', async () => {
    const table = await Table.open(['P0', 'P1', 'P2', 'P3', 'P4', 'P5']);

    const client = await TestClient.connect(WS_GAME_PATH, { room: table.room });
    client.emit('joinRoom', { username: 'SEVENTH', room: table.room, clientId: 'cid-7' });

    const error = await client.waitFor<{ message: string }>('error');
    expect(error.message).toBe('ROOM_FULL');
  });

  it('hides opponents hole cards until showdown', async () => {
    const table = await Table.open(['ALICE', 'BOB']);
    await table.deal();

    const seenByA = await waitForGame(table.clients[0], (g) => g.stage === 1);
    const dealtToA = seenByA.players.filter((p) => p.cards.length > 0);
    expect(dealtToA.map((p) => p.name)).toEqual(['ALICE']);

    const seenByB = await waitForGame(table.clients[1], (g) => g.stage === 1);
    const dealtToB = seenByB.players.filter((p) => p.cards.length > 0);
    expect(dealtToB.map((p) => p.name)).toEqual(['BOB']);
  });

  it('rejects a joinRoom whose payload names a different table than the URL', async () => {
    const table = await Table.open(['ALICE']);

    const impostor = await TestClient.connect(WS_GAME_PATH, { room: table.room });
    impostor.emit('joinRoom', {
      username: 'MALLORY',
      room: `${QUICK_ROOM_PREFIX}9999`,
      clientId: 'cid-mallory',
    });

    const error = await impostor.waitFor<{ message: string }>('error');
    expect(error.message).toBe('ROOM_NOT_FOUND');

    // No seat taken here, and the asserted code never reaches the lobby.
    expect((await table.game())!.players).toHaveLength(1);
    expect(await lobbyRooms()).toEqual([]);
  });

  it('answers the heartbeat without waking the object', async () => {
    const table = await Table.open(['ALICE']);

    table.clients[0].emitRaw(WS_PING);

    await table.clients[0].waitForRaw(WS_PONG);
  });

  it('relays chat to everyone at the table', async () => {
    const table = await Table.open(['ALICE', 'BOB']);

    table.clients[0].emit('chat', 'nice hand');

    const heardByB = await table.clients[1].waitFor<ChatMessage>('message');
    expect(heardByB).toMatchObject({ username: 'ALICE', text: 'nice hand' });
  });
});

describe('PokerRoom — alarm-driven turn clock', () => {
  it('parks the single alarm on the 30s deadline and publishes it to clients', async () => {
    const table = await Table.open(['ALICE', 'BOB']);
    const game = await table.deal();

    expect(game.stage).toBe(1);
    expect(game.timerDeadline).not.toBeNull();

    const rows = await timers(table.room);
    expect(rows.map((r) => r.kind)).toEqual(['turn']);

    // The object gets exactly one alarm, parked on the earliest due timer.
    expect(await alarmAt(table.room)).toBe(rows[0].due_at);

    const remaining = rows[0].due_at - Date.now();
    expect(remaining).toBeLessThanOrEqual(TURN_DURATION_MS);
    expect(remaining).toBeGreaterThan(TURN_DURATION_MS - 5_000);
  });

  it('auto-folds the seat on the clock when the alarm fires', async () => {
    const table = await Table.open(['ALICE', 'BOB']);
    const dealt = await table.deal();
    const onClock = dealt.actionOn;

    expect(await runDurableObjectAlarm(stubFor(table.room))).toBe(true);
    await TestClient.settle(150);

    const after = await table.game();
    expect(after!.players[onClock].isActive).toBe(false);
    expect(after!.players[onClock].lastAction).toBe('FOLD');
  });

  it('ignores a turn alarm from a generation the table has already left', async () => {
    const table = await Table.open(['ALICE', 'BOB']);
    await table.deal();

    // Stand in for an alarm already in flight when the player acted: a timer
    // stamped with a generation the table has since moved past.
    await runInDurableObject(stubFor(table.room), async (_instance: PokerRoom, state) => {
      state.storage.sql.exec('DELETE FROM timers');
      state.storage.sql.exec(
        'INSERT INTO timers (kind, due_at, seq, payload) VALUES (?, ?, ?, NULL)',
        'turn',
        Date.now() + 60_000,
        -1,
      );
      await state.storage.setAlarm(Date.now() + 60_000);
    });

    expect(await runDurableObjectAlarm(stubFor(table.room))).toBe(true);
    await TestClient.settle(150);

    const after = await table.game();
    expect(after!.players.every((p) => p.isActive)).toBe(true);
    expect(after!.players.every((p) => p.lastAction === null)).toBe(true);
  });

  it('re-arms rather than accumulating clocks as the action moves', async () => {
    const table = await Table.open(['ALICE', 'BOB']);
    const dealt = await table.deal();

    await table.act(dealt.actionOn, 'call');
    const afterFirst = await table.game();
    await table.act(afterFirst!.actionOn, 'call');

    const rows = await timers(table.room);
    expect(rows.filter((r) => r.kind === 'turn' || r.kind === 'ai')).toHaveLength(1);
    expect(await alarmAt(table.room)).toBe(Math.min(...rows.map((r) => r.due_at)));
  });
});

describe('PokerRoom — alarm-driven auto-deal', () => {
  it('schedules the next hand and deals it when the alarm fires', async () => {
    const table = await Table.open(['ALICE', 'BOB']);
    await table.deal();

    const concluded = await table.foldToShowdown();
    expect(concluded.stage).toBe(5);
    expect(concluded.winner).toHaveLength(1);

    const rows = await timers(table.room);
    const deal = rows.find((r) => r.kind === 'deal');
    expect(deal).toBeDefined();
    expect(deal!.due_at - Date.now()).toBeLessThanOrEqual(AUTO_DEAL_DELAY_MS);

    expect(await runDurableObjectAlarm(stubFor(table.room))).toBe(true);
    await TestClient.settle(200);

    const next = await table.game();
    expect(next!.stage).toBe(1);
    expect(next!.players.every((p) => p.cards.length === 2)).toBe(true);
    expect(next!.winner).toEqual([]);
  });

  it('holds at stage 0 when fewer than two seats can play', async () => {
    const table = await Table.open(['ALICE', 'BOB']);
    await table.deal();

    expect((await table.foldToShowdown()).stage).toBe(5);

    // Bust both seats before the auto-deal alarm lands.
    await writeStoredGame(table.room, (game) => {
      for (const player of game.players) player.stack = 0;
    });

    expect(await runDurableObjectAlarm(stubFor(table.room))).toBe(true);
    await TestClient.settle(200);

    const paused = await table.game();
    expect(paused!.stage).toBe(0);
  });

  it('plays a hand through to showdown and starts the next one', async () => {
    const table = await Table.open(['ALICE', 'BOB']);
    let game = await table.deal();

    // Check/call the whole way down: pre-flop, flop, turn, river.
    for (let guard = 0; guard < 12 && game.stage >= 1 && game.stage <= 4; guard++) {
      await table.act(game.actionOn, 'call');
      game = (await table.game())!;
    }

    expect(game.stage).toBe(5);
    expect(game.tableCards).toHaveLength(5);
    expect(game.winner.length).toBeGreaterThan(0);
    expect(game.pot).toBe(0);

    // Both clients see all hole cards once the hand is over.
    const showdown = await waitForGame(table.clients[1], (g) => g.stage === 5);
    expect(showdown.players.every((p) => p.cards.length === 2)).toBe(true);

    expect(await runDurableObjectAlarm(stubFor(table.room))).toBe(true);
    await TestClient.settle(200);
    expect((await table.game())!.stage).toBe(1);
  });
});

describe('PokerRoom — AI seats', () => {
  it('acts for an AI seat when its think-time alarm fires', async () => {
    const table = await Table.open(['ALICE'], { aiCount: 1 });
    const dealt = await table.deal();

    expect(dealt.players[1].isAI).toBe(true);
    expect(dealt.players[dealt.actionOn].isAI).toBe(true);

    const rows = await timers(table.room);
    expect(rows.some((r) => r.kind === 'ai')).toBe(true);
    expect(dealt.timerDeadline).toBeNull();

    expect(await runDurableObjectAlarm(stubFor(table.room))).toBe(true);
    await TestClient.settle(200);

    const after = await table.game();
    expect(after!.players[1].lastAction).not.toBeNull();
  });

  it('gives AI seats distinct personas drawn from the roster', async () => {
    const table = await Table.open(['ALICE'], { aiCount: 3 });
    const game = (await table.game())!;

    const aiNames = game.players.filter((p) => p.isAI).map((p) => p.name);
    expect(aiNames).toHaveLength(3);
    expect(new Set(aiNames).size).toBe(3);
  });
});

describe('PokerRoom — persistence and reconnection', () => {
  it('rebuilds the table from storage after eviction', async () => {
    const table = await Table.open(['ALICE', 'BOB']);
    const before = await table.deal();

    // Tear the instance down while keeping sockets connected — what hibernation does.
    await evictDurableObject(stubFor(table.room), { webSockets: 'hibernate' });

    const after = await table.game();
    expect(after).toEqual(before);
  });

  it('still auto-folds on the alarm after the object was evicted mid-turn', async () => {
    const table = await Table.open(['ALICE', 'BOB']);
    const dealt = await table.deal();
    const onClock = dealt.actionOn;

    await evictDurableObject(stubFor(table.room), { webSockets: 'hibernate' });

    expect(await runDurableObjectAlarm(stubFor(table.room))).toBe(true);
    await TestClient.settle(200);

    const after = await table.game();
    expect(after!.players[onClock].isActive).toBe(false);
    expect(after!.players[onClock].lastAction).toBe('FOLD');
  });

  it('keeps serving a hibernated socket after eviction', async () => {
    const table = await Table.open(['ALICE', 'BOB']);
    await table.deal();

    await evictDurableObject(stubFor(table.room), { webSockets: 'hibernate' });

    table.clients[0].emit('chat', 'still here');
    const heard = await table.clients[1].waitFor<ChatMessage>('message');
    expect(heard).toMatchObject({ username: 'ALICE', text: 'still here' });
  });

  it('restores the seat through rejoinRoom after the socket drops', async () => {
    const table = await Table.open(['ALICE', 'BOB']);
    await table.deal();

    table.clients[0].close();
    await TestClient.settle(150);

    const reconnected = await TestClient.connect(WS_GAME_PATH, { room: table.room });
    reconnected.emit('rejoinRoom', { clientId: 'cid-ALICE', room: table.room });

    const rejoined = await reconnected.waitFor<RoomJoined>('roomJoined');
    expect(rejoined.playerIndex).toBe(0);
    expect(rejoined.game.stage).toBe(1);
    expect(rejoined.game.players[0].name).toBe('ALICE');

    // The reconnected socket is wired back into broadcasts.
    table.clients[1].emit('chat', 'wb');
    const heard = await reconnected.waitFor<ChatMessage>('message');
    expect(heard).toMatchObject({ username: 'BOB', text: 'wb' });
  });

  it('rejects a rejoin for an unknown client', async () => {
    const table = await Table.open(['ALICE']);

    const stranger = await TestClient.connect(WS_GAME_PATH, { room: table.room });
    stranger.emit('rejoinRoom', { clientId: 'cid-nobody', room: table.room });

    const error = await stranger.waitFor<{ message: string }>('error');
    expect(error.message).toBe('SESSION_NOT_FOUND');
  });

  it('leaving mid-hand folds the seat so the hand can continue', async () => {
    const table = await Table.open(['ALICE', 'BOB']);
    const dealt = await table.deal();
    const leaverIndex = dealt.actionOn;

    await TestClient.settle(ACTION_COOLDOWN_MS + 60);
    table.clients[leaverIndex].emit('leaveRoom');
    await TestClient.settle(200);

    const after = await table.game();
    expect(after!.players[leaverIndex].hasLeft).toBe(true);
    expect(after!.players[leaverIndex].isActive).toBe(false);
    expect(after!.players[leaverIndex].stack).toBe(0);
  });
});

describe('PokerRoom — lobby occupancy', () => {
  let quickCounter = 0;
  const nextQuickRoom = () => `${QUICK_ROOM_PREFIX}${9000 + ++quickCounter}`;

  it('reports its seat count under the code the connection routes to', async () => {
    const room = nextQuickRoom();
    await Table.open(['ALICE', 'BOB'], { room });

    expect(await lobbyRooms()).toEqual([{ code: room, active_players: 2 }]);
  });

  it('drops the table from the lobby once every seat has busted out', async () => {
    const room = nextQuickRoom();
    const table = await Table.open(['ALICE', 'BOB'], { room });
    await table.deal();
    expect((await table.foldToShowdown()).stage).toBe(5);
    expect(await lobbyRooms()).toEqual([{ code: room, active_players: 2 }]);

    // Nobody leaves — they simply run out of chips, which is the case the
    // join/leave reports alone never saw.
    await writeStoredGame(table.room, (game) => {
      for (const player of game.players) player.stack = 0;
    });

    expect(await runDurableObjectAlarm(stubFor(table.room))).toBe(true);
    await TestClient.settle(200);

    expect(await lobbyRooms()).toEqual([]);
  });

  it('concludes the hand even when the lobby is unreachable', async () => {
    const room = nextQuickRoom();
    const table = await Table.open(['ALICE', 'BOB'], { room });
    await table.deal();

    // Occupancy is advisory — a lobby that rejects must not abort the table.
    await runInDurableObject(stubFor(room), async (instance: PokerRoom) => {
      const patched = instance as unknown as { env: Env };
      patched.env = {
        ...patched.env,
        LOBBY: {
          getByName: () => ({
            reportRoom: () => Promise.reject(new Error('lobby unreachable')),
          }),
        },
      } as unknown as Env;
    });

    const failures = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      expect((await table.foldToShowdown()).stage).toBe(5);
      expect(failures).toHaveBeenCalled();
    } finally {
      failures.mockRestore();
    }

    // The socket survived, so the table is still playable.
    table.clients[0].emit('chat', 'still here');
    const heard = await table.clients[1].waitFor<ChatMessage>('message');
    expect(heard).toMatchObject({ username: 'ALICE', text: 'still here' });
  });
});

describe('PokerRoom — the table always has a way forward', () => {
  it('still deals the next hand when someone acts during the showdown window', async () => {
    const table = await Table.open(['ALICE', 'BOB']);
    await table.deal();
    expect((await table.foldToShowdown()).stage).toBe(5);

    const dealBefore = (await timers(table.room)).find((r) => r.kind === 'deal');
    expect(dealBefore).toBeDefined();

    // A stray click during the 4-second pause: the action is not legal at
    // showdown, and rejecting it must not take the pending deal with it.
    await table.act(0, 'fold');
    await table.act(1, 'call');

    const dealAfter = (await timers(table.room)).find((r) => r.kind === 'deal');
    expect(dealAfter).toBeDefined();
    expect(dealAfter!.due_at).toBe(dealBefore!.due_at);
    expect(await alarmAt(table.room)).toBe(
      Math.min(...(await timers(table.room)).map((r) => r.due_at)),
    );

    expect(await runDurableObjectAlarm(stubFor(table.room))).toBe(true);
    expect((await table.waitForStoredStage(1)).players.every((p) => p.cards.length === 2)).toBe(
      true,
    );
  });

  it('ends the hand and awards the pot when every seat times out on it', async () => {
    const table = await Table.open(['ALICE', 'BOB']);
    const dealt = await table.deal();
    const chipsBefore = totalChips(dealt);

    // Nobody acts, ever. Run the clock until the hand leaves the betting rounds.
    for (let guard = 0; guard < 6; guard++) {
      const game = (await table.game())!;
      if (game.stage < 1 || game.stage > 4) break;
      expect(await runDurableObjectAlarm(stubFor(table.room))).toBe(true);
      await TestClient.settle(150);
    }

    const concluded = (await table.game())!;
    expect(concluded.stage).toBe(5);
    expect(concluded.pot).toBe(0);
    expect(totalChips(concluded)).toBe(chipsBefore);

    // And the table moves on rather than sitting on a settled pot.
    expect((await timers(table.room)).some((r) => r.kind === 'deal')).toBe(true);
    expect(await runDurableObjectAlarm(stubFor(table.room))).toBe(true);
    await table.waitForStoredStage(1);
  });

  it('moves the table on when the rules turn down an AI seat decision', async () => {
    const table = await Table.open(['ALICE'], { aiCount: 1 });
    const dealt = await table.deal();
    const aiSeat = dealt.actionOn;
    expect(dealt.players[aiSeat].isAI).toBe(true);

    // An AI seat that cannot legally act. Its alarm is drained the moment it
    // fires, so dropping the decision would leave the table with no clock.
    await writeStoredGame(table.room, (game) => {
      game.players[aiSeat].isAllIn = true;
    });

    expect(await runDurableObjectAlarm(stubFor(table.room))).toBe(true);
    await TestClient.settle(200);

    const after = (await table.game())!;
    expect(after.stage).toBe(5);
    expect(await alarmAt(table.room)).not.toBeNull();
    expect((await timers(table.room)).some((r) => r.kind === 'deal')).toBe(true);
  });

  it('leaves the turn clock armed when an action is rejected', async () => {
    const table = await Table.open(['ALICE', 'BOB']);
    const dealt = await table.deal();
    const onClock = dealt.actionOn;
    const clockBefore = (await timers(table.room)).find((r) => r.kind === 'turn');
    expect(clockBefore).toBeDefined();

    // An under-minimum raise from the seat that *is* on the clock. Rejecting it
    // must not disarm the alarm that is about to fold this seat, and must not
    // push the deadline out either — otherwise the clock is resettable at will.
    await table.act(onClock, 'raise', dealt.currentBet + 1);

    const clockAfter = (await timers(table.room)).filter((r) => r.kind === 'turn');
    expect(clockAfter).toHaveLength(1);
    expect(clockAfter[0].due_at).toBe(clockBefore!.due_at);
    expect(clockAfter[0].seq).toBe(clockBefore!.seq);
    expect(await alarmAt(table.room)).toBe(clockBefore!.due_at);

    // The seat still runs out of time.
    expect(await runDurableObjectAlarm(stubFor(table.room))).toBe(true);
    await TestClient.settle(150);
    const after = await table.game();
    expect(after!.players[onClock].lastAction).toBe('FOLD');
  });
});

describe('PokerRoom — an action must come from the seat that sent it', () => {
  it("refuses an action carrying another player's seat index", async () => {
    const table = await Table.open(['ALICE', 'BOB']);
    const dealt = await table.deal();
    const onClock = dealt.actionOn;
    const impostor = (onClock + 1) % 2;

    await TestClient.settle(ACTION_COOLDOWN_MS + 60);
    table.clients[impostor].emit('gameAction', { type: 'fold', playerIndex: onClock });
    await TestClient.settle(150);

    const error = await table.clients[impostor].waitFor<{ message: string }>('error');
    expect(error.message).toBe('NOT_YOUR_SEAT');

    const after = await table.game();
    expect(after!.players[onClock].isActive).toBe(true);
    expect(after!.players[onClock].lastAction).toBeNull();
    expect(after!.actionOn).toBe(onClock);
  });

  it('refuses an action from a seat that is not on the clock', async () => {
    const table = await Table.open(['ALICE', 'BOB']);
    const dealt = await table.deal();
    const offClock = (dealt.actionOn + 1) % 2;

    // Own seat, wrong turn — the rules reject it, and the clock is untouched.
    const clockBefore = (await timers(table.room)).find((r) => r.kind === 'turn');
    await table.act(offClock, 'fold');

    const after = await table.game();
    expect(after!.players[offClock].isActive).toBe(true);
    expect(after!.actionOn).toBe(dealt.actionOn);
    expect((await timers(table.room)).find((r) => r.kind === 'turn')!.due_at).toBe(
      clockBefore!.due_at,
    );
  });
});

describe('PokerRoom — rejected input', () => {
  it('ignores blind changes once a hand is under way', async () => {
    const table = await Table.open(['ALICE', 'BOB']);
    const dealt = await table.deal();

    table.clients[0].emit('changeBlinds', { smallBlind: 50, bigBlind: 100 });
    await TestClient.settle(150);

    const after = await table.game();
    expect(after!.smallBlind).toBe(dealt.smallBlind);
    expect(after!.bigBlind).toBe(dealt.bigBlind);
  });

  it('accepts blind changes between hands', async () => {
    const table = await Table.open(['ALICE', 'BOB']);

    table.clients[0].emit('changeBlinds', { smallBlind: 50, bigBlind: 100 });
    await TestClient.settle(150);

    const after = await table.game();
    expect(after!.smallBlind).toBe(50);
    expect(after!.bigBlind).toBe(100);
  });

  it('only lets busted players rebuy', async () => {
    const table = await Table.open(['ALICE', 'BOB']);

    table.clients[0].emit('rebuy', { amount: 5_000 });
    await TestClient.settle(150);
    expect((await table.game())!.players[0].stack).toBe(1000);

    await writeStoredGame(table.room, (game) => {
      game.players[0].stack = 0;
    });

    table.clients[0].emit('rebuy', { amount: 5_000 });
    await TestClient.settle(150);
    expect((await table.game())!.players[0].stack).toBe(5_000);
  });
});
