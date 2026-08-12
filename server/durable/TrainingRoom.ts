import { DurableObject } from 'cloudflare:workers';
import { decode, encode, WS_PING, WS_PONG } from '@pixelpoker/shared/src/protocol';
import { TrainingSession, loadLessons, type TrainingSnapshot } from '../controllers/training';

/**
 * One Durable Object per player running a lesson — the replacement for the
 * `Map<socket.id, TrainingSession>` in `trainingSocketHandlers`.
 *
 * A lesson is a slow, thinking-time activity, so the object will routinely be
 * hibernated between a player's actions. The session is therefore snapshotted
 * to storage after every step and rebuilt on the next message rather than being
 * held in memory.
 */
export class TrainingRoom extends DurableObject<Env> {
  private readonly lessons = loadLessons();
  private cached: TrainingSession | null = null;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    // A lesson is mostly idle time, which is exactly when a connection gets
    // dropped silently. The runtime answers the heartbeat without waking this
    // object, so hibernation is unaffected.
    ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair(WS_PING, WS_PONG));
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
        CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
        INSERT INTO _sql_schema_migrations (id) VALUES (1);
      `);
    }
  }

  async fetch(request: Request): Promise<Response> {
    if (request.headers.get('Upgrade') !== 'websocket') {
      return new Response('expected websocket upgrade', { status: 426 });
    }

    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    this.ctx.acceptWebSocket(server);
    return new Response(null, { status: 101, webSocket: client });
  }

  // ────────────────────────────────────────────────────────────────────────────
  // Session persistence
  // ────────────────────────────────────────────────────────────────────────────

  private loadSession(): TrainingSession | null {
    if (this.cached) return this.cached;

    const rows = this.ctx.storage.sql
      .exec<{ value: string }>("SELECT value FROM meta WHERE key = 'session'")
      .toArray();
    if (rows.length === 0) return null;

    const snapshot = JSON.parse(rows[0].value) as TrainingSnapshot;
    this.cached = TrainingSession.restore(this.lessons, snapshot);
    return this.cached;
  }

  private saveSession(session: TrainingSession): void {
    this.ctx.storage.sql.exec(
      "INSERT INTO meta (key, value) VALUES ('session', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
      JSON.stringify(session.snapshot()),
    );
    this.cached = session;
  }

  private clearSession(): void {
    this.ctx.storage.sql.exec("DELETE FROM meta WHERE key = 'session'");
    this.cached = null;
  }

  // ────────────────────────────────────────────────────────────────────────────
  // Events
  // ────────────────────────────────────────────────────────────────────────────

  private send(ws: WebSocket, event: string, data?: unknown): void {
    try {
      ws.send(encode(event, data));
    } catch {
      // Socket already closed.
    }
  }

  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): Promise<void> {
    if (typeof message !== 'string') return;
    const envelope = decode(message);
    if (!envelope) return;

    switch (envelope.e) {
      case 'training:start':
        this.onStart(ws, envelope.d as { lessonId: string; scenariosSeen?: string[] });
        break;
      case 'training:action':
        this.onAction(ws, envelope.d as { type: 'fold' | 'check' | 'call' | 'raise'; bet?: number });
        break;
      case 'training:nextHand':
        this.onNextHand(ws);
        break;
      case 'training:exit':
        this.clearSession();
        break;
      default:
        break;
    }
  }

  async webSocketClose(): Promise<void> {
    // Matches the old `disconnect` handler: a dropped connection ends the lesson.
    this.clearSession();
  }

  private onStart(ws: WebSocket, data: { lessonId: string; scenariosSeen?: string[] }): void {
    try {
      const session = new TrainingSession(this.lessons);
      const intro = session.startLesson(data.lessonId, data.scenariosSeen ?? []);
      this.saveSession(session);
      this.send(ws, 'training:lessonIntro', intro);
    } catch (err) {
      this.send(ws, 'training:error', { message: (err as Error).message });
    }
  }

  private onAction(
    ws: WebSocket,
    action: { type: 'fold' | 'check' | 'call' | 'raise'; bet?: number },
  ): void {
    const session = this.loadSession();
    if (!session) {
      this.send(ws, 'training:error', { message: 'No active training session' });
      return;
    }

    const result = session.processAction(action);
    this.saveSession(session);

    if (result.type === 'gameState') this.send(ws, 'training:gameState', result.data);
    else if (result.type === 'debrief') this.send(ws, 'training:debrief', result.data);
  }

  private onNextHand(ws: WebSocket): void {
    const session = this.loadSession();
    if (!session) {
      this.send(ws, 'training:error', { message: 'No active training session' });
      return;
    }

    const result = session.nextHand();

    if (result.type === 'gameState') {
      this.saveSession(session);
      this.send(ws, 'training:gameState', result.data);
    } else if (result.type === 'lessonComplete') {
      this.send(ws, 'training:lessonComplete', result.data);
      this.clearSession();
    }
  }
}
