import { describe, it, expect } from 'vitest';
import { env, runInDurableObject, runDurableObjectAlarm, evictDurableObject } from 'cloudflare:test';
import { WS_GAME_PATH } from '@pixelpoker/shared/src/protocol';
import type { ActionType, ChatMessage, Poker } from '../controllers/types';
import { TURN_DURATION_MS, AUTO_DEAL_DELAY_MS } from '../controllers/roomLogic';
import type { PokerRoom } from '../durable/PokerRoom';
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

  static async open(names: string[], opts: { aiCount?: number } = {}): Promise<Table> {
    const room = nextRoom();
    const clients: TestClient[] = [];

    for (const [index, username] of names.entries()) {
      const client = await TestClient.connect(WS_GAME_PATH, { room });
      client.emit('joinRoom', {
        username,
        room,
        clientId: `cid-${username}`,
        ...(index === 0 ? opts : {}),
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
