/**
 * A Durable Object has exactly one alarm, and `setAlarm()` replaces whatever was
 * pending. The Express server ran three independent `setTimeout` clocks per room
 * (turn clock, auto-deal, AI think/chat delays), so they cannot map one-to-one
 * onto alarms.
 *
 * This is the single scheduler they collapse into: due events live in a SQLite
 * table, and the object's one alarm is always parked on `MIN(due_at)`. Firing it
 * drains everything due, then re-parks on whatever is next.
 *
 * Unlike `setTimeout`, a scheduled row survives eviction — which is the whole
 * point, since a pending timeout dies with the object and would leave a player
 * sitting on a turn that never times out.
 */
export interface ScheduledTimer<K extends string = string> {
  id: number;
  kind: K;
  dueAt: number;
  /** Generation the timer was scheduled for; a mismatch means it is stale. */
  seq: number;
  payload: string | null;
}

interface TimerRow extends Record<string, SqlStorageValue> {
  id: number;
  kind: string;
  due_at: number;
  seq: number;
  payload: string | null;
}

export class AlarmScheduler<K extends string = string> {
  constructor(private readonly ctx: DurableObjectState) {}

  /** Called from the owning object's migration step. */
  static schema = `
    CREATE TABLE IF NOT EXISTS timers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      kind TEXT NOT NULL,
      due_at INTEGER NOT NULL,
      seq INTEGER NOT NULL,
      payload TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_timers_due ON timers(due_at);
  `;

  /** Add a timer. Call `sync()` afterwards to re-park the alarm. */
  add(kind: K, dueAt: number, seq: number, payload?: unknown): void {
    this.ctx.storage.sql.exec(
      'INSERT INTO timers (kind, due_at, seq, payload) VALUES (?, ?, ?, ?)',
      kind,
      Math.round(dueAt),
      seq,
      payload === undefined ? null : JSON.stringify(payload),
    );
  }

  clear(...kinds: K[]): void {
    if (kinds.length === 0) return;
    const placeholders = kinds.map(() => '?').join(', ');
    this.ctx.storage.sql.exec(`DELETE FROM timers WHERE kind IN (${placeholders})`, ...kinds);
  }

  clearAll(): void {
    this.ctx.storage.sql.exec('DELETE FROM timers');
  }

  /**
   * Remove and return everything due, earliest first.
   *
   * The threshold is `max(now, earliest)` rather than `now`. The alarm is only
   * ever parked on `MIN(due_at)`, so whenever the handler runs the earliest
   * timer is due by definition — but `Date.now()` inside a Worker is pinned to
   * the last I/O and can read earlier than the alarm's scheduled time. Trusting
   * `now` alone would drain nothing and re-park the same alarm in a loop.
   */
  drainDue(now: number): ScheduledTimer<K>[] {
    const earliest = this.ctx.storage.sql
      .exec<{ due_at: number | null }>('SELECT MIN(due_at) AS due_at FROM timers')
      .one().due_at;
    if (earliest === null) return [];

    const threshold = Math.max(now, earliest);
    const rows = this.ctx.storage.sql
      .exec<TimerRow>('SELECT * FROM timers WHERE due_at <= ? ORDER BY due_at, id', threshold)
      .toArray();
    if (rows.length > 0) {
      this.ctx.storage.sql.exec('DELETE FROM timers WHERE due_at <= ?', threshold);
    }
    return rows.map((row) => ({
      id: row.id,
      kind: row.kind as K,
      dueAt: row.due_at,
      seq: row.seq,
      payload: row.payload,
    }));
  }

  /** Park the object's single alarm on the next due timer, or cancel it. */
  async sync(): Promise<void> {
    const next = this.ctx.storage.sql
      .exec<{ due_at: number | null }>('SELECT MIN(due_at) AS due_at FROM timers')
      .one().due_at;

    if (next === null) {
      await this.ctx.storage.deleteAlarm();
      return;
    }

    const current = await this.ctx.storage.getAlarm();
    if (current !== next) await this.ctx.storage.setAlarm(next);
  }

  static parsePayload<T>(timer: ScheduledTimer): T | null {
    if (timer.payload === null) return null;
    try {
      return JSON.parse(timer.payload) as T;
    } catch {
      return null;
    }
  }
}
