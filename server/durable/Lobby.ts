import { DurableObject } from 'cloudflare:workers';
import { QUICK_ROOM_PREFIX } from '@pixelpoker/shared/src/protocol';
import { findQuickRoom, type PublicRoomSummary } from '../controllers/quickplay';

const MAX_PLAYERS = 6;

/**
 * Quickplay matchmaking is inherently one decision point — two players clicking
 * at the same moment must not be sent to different empty tables — so the
 * directory lives in a single object rather than being sharded.
 */
export const LOBBY_SINGLETON = 'global';

/**
 * Rooms reserved but never joined are pruned after this long, so a burst of
 * quickplay clicks that nobody follows through on does not permanently offer
 * empty tables. The old server had the same problem implicitly — its
 * `publicRooms` Set only shed codes once the room Map lost them.
 */
const EMPTY_ROOM_TTL_MS = 10 * 60_000;

interface RoomRow extends Record<string, SqlStorageValue> {
  code: string;
  active_players: number;
  updated_at: number;
}

/**
 * The directory that replaces `roomManager.publicRooms: Set<string>`.
 *
 * Occupancy cannot be derived here — each table's state lives in its own
 * Durable Object — so tables report their seat count when players join or
 * leave, and this object picks the fullest one with space.
 */
export class Lobby extends DurableObject<Env> {
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    ctx.blockConcurrencyWhile(async () => this.migrate());
  }

  private migrate(): void {
    const sql = this.ctx.storage.sql;
    sql.exec(`
      CREATE TABLE IF NOT EXISTS _sql_schema_migrations (
        id INTEGER PRIMARY KEY,
        applied_at TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `);
    const version = sql
      .exec<{ version: number }>(
        'SELECT COALESCE(MAX(id), 0) AS version FROM _sql_schema_migrations',
      )
      .one().version;

    if (version < 1) {
      sql.exec(`
        CREATE TABLE IF NOT EXISTS public_rooms (
          code TEXT PRIMARY KEY,
          active_players INTEGER NOT NULL DEFAULT 0,
          updated_at INTEGER NOT NULL
        );
        INSERT INTO _sql_schema_migrations (id) VALUES (1);
      `);
    }
  }

  /**
   * Pick the fullest public table with room, or reserve a new code. Mirrors the
   * old `GET /rooms-quick`: it returns a code, and the table itself is created
   * when the first player's `joinRoom` reaches the room object.
   */
  findOrCreate(): { room: string } {
    this.prune();

    const rooms = this.ctx.storage.sql
      .exec<RoomRow>('SELECT * FROM public_rooms')
      .toArray()
      .map<PublicRoomSummary>((row) => ({ code: row.code, activePlayers: row.active_players }));

    const existing = findQuickRoom(rooms, MAX_PLAYERS);
    if (existing) return { room: existing };

    const room = QUICK_ROOM_PREFIX + Math.floor(1000 + Math.random() * 9000);
    this.ctx.storage.sql.exec(
      `INSERT INTO public_rooms (code, active_players, updated_at) VALUES (?, 0, ?)
       ON CONFLICT(code) DO UPDATE SET updated_at = excluded.updated_at`,
      room,
      Date.now(),
    );
    return { room };
  }

  /** Called by a public table whenever its occupancy changes. */
  reportRoom(code: string, activePlayers: number): void {
    if (activePlayers <= 0) {
      this.ctx.storage.sql.exec('DELETE FROM public_rooms WHERE code = ?', code);
      return;
    }
    this.ctx.storage.sql.exec(
      `INSERT INTO public_rooms (code, active_players, updated_at) VALUES (?, ?, ?)
       ON CONFLICT(code) DO UPDATE SET active_players = excluded.active_players, updated_at = excluded.updated_at`,
      code,
      activePlayers,
      Date.now(),
    );
  }

  publicRoomCount(): number {
    this.prune();
    return this.ctx.storage.sql
      .exec<{ count: number }>('SELECT COUNT(*) AS count FROM public_rooms')
      .one().count;
  }

  private prune(): void {
    this.ctx.storage.sql.exec(
      'DELETE FROM public_rooms WHERE active_players = 0 AND updated_at < ?',
      Date.now() - EMPTY_ROOM_TTL_MS,
    );
  }
}
