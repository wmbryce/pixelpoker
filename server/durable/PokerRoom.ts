import { DurableObject } from 'cloudflare:workers';
import {
  decode,
  encode,
  isPublicRoomCode,
  WS_PING,
  WS_PONG,
} from '@pixelpoker/shared/src/protocol';
import type { ChatMessage, GameAction, Poker } from '../controllers/types';
import { SMALL_BLIND, BIG_BLIND } from '../controllers/types';
import { initializeGame, createPlayer, createAIPlayer } from '../controllers/gameplay';
import {
  assignPersona,
  getAIChat,
  makeAIDecision,
  personaForPlayer,
  type AIChat,
  type ChatTrigger,
} from '../controllers/ai';
import { countSeated } from '../controllers/quickplay';
import {
  AUTO_DEAL_DELAY_MS,
  aiChatDelayMs,
  foldAndAdvance,
  handResultChats,
  planTurn,
  prepareNextHand,
  processGameAction,
  resolveActionResult,
  resolveDealtHand,
} from '../controllers/roomLogic';
import { AlarmScheduler, type ScheduledTimer } from './scheduler';
import { LOBBY_SINGLETON } from './Lobby';

const MAX_PLAYERS = 6;
const MAX_AI_PLAYERS = 5;
const MAX_BLIND = 10_000;
const ACTION_COOLDOWN_MS = 300;
const MIN_REBUY = 100;
const MAX_REBUY = 10_000;

/**
 * `turn` and `ai` are the two shapes of the turn clock; `deal` is the pause
 * between hands; `chat` is an AI trash-talk line held back so it does not land
 * in the same instant as the action. All four used to be separate `setTimeout`
 * calls and now share the object's single alarm.
 */
type TimerKind = 'turn' | 'ai' | 'deal' | 'chat';

/** Per-connection state, kept on the socket so it survives hibernation. */
interface SocketState {
  clientId: string;
  playerIndex: number;
  name: string;
  /**
   * Last gameAction *received*, for the anti-spam cooldown — charged before
   * validation, so a rejected action is rate-limited like any other.
   */
  lastActionAt: number;
}

interface ClientRow extends Record<string, SqlStorageValue> {
  client_id: string;
  player_index: number;
  name: string;
}

/**
 * One Durable Object per table — the replacement for
 * `roomManager.rooms: Map<string, Poker>`. This object is the single source of
 * truth for its table: it owns the authoritative game state (in SQLite, not
 * memory), the connected players' sockets, and the alarm that drives the turn
 * clock and auto-deal.
 */
export class PokerRoom extends DurableObject<Env> {
  private readonly scheduler: AlarmScheduler<TimerKind>;
  private cachedGame: Poker | null = null;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.scheduler = new AlarmScheduler<TimerKind>(ctx);
    // Answered by the runtime itself, so a heartbeat neither wakes the object
    // nor blocks hibernation.
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
        CREATE TABLE IF NOT EXISTS clients (
          client_id TEXT PRIMARY KEY,
          player_index INTEGER NOT NULL,
          name TEXT NOT NULL
        );
        ${AlarmScheduler.schema}
        INSERT INTO _sql_schema_migrations (id) VALUES (1);
      `);
    }
  }

  // ────────────────────────────────────────────────────────────────────────────
  // Persistence — storage is authoritative, memory is only a cache
  // ────────────────────────────────────────────────────────────────────────────

  private readMeta(key: string): string | null {
    const rows = this.ctx.storage.sql
      .exec<{ value: string }>('SELECT value FROM meta WHERE key = ?', key)
      .toArray();
    return rows.length > 0 ? rows[0].value : null;
  }

  private writeMeta(key: string, value: string): void {
    this.ctx.storage.sql.exec(
      'INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
      key,
      value,
    );
  }

  private loadGame(): Poker | null {
    if (this.cachedGame) return this.cachedGame;
    const raw = this.readMeta('game');
    if (raw === null) return null;
    this.cachedGame = JSON.parse(raw) as Poker;
    return this.cachedGame;
  }

  /** Write through to storage before touching the in-memory cache. */
  private persist(game: Poker): void {
    this.writeMeta('game', JSON.stringify(game));
    this.cachedGame = game;
  }

  private get code(): string | null {
    return this.readMeta('code');
  }

  private turnSeq(): number {
    return Number(this.readMeta('turnSeq') ?? '0');
  }

  /**
   * Bump the turn generation. Timers carry the generation they were scheduled
   * for, so an alarm that fires after the table has already moved on — the
   * player acted a beat before their clock expired — is recognised as stale and
   * dropped instead of auto-folding a seat that already acted.
   */
  private bumpTurnSeq(): number {
    const next = this.turnSeq() + 1;
    this.writeMeta('turnSeq', String(next));
    return next;
  }

  private getClient(clientId: string): ClientRow | null {
    const rows = this.ctx.storage.sql
      .exec<ClientRow>('SELECT * FROM clients WHERE client_id = ?', clientId)
      .toArray();
    return rows.length > 0 ? rows[0] : null;
  }

  // ────────────────────────────────────────────────────────────────────────────
  // RPC
  // ────────────────────────────────────────────────────────────────────────────

  /** Whether this table has ever been created. Read-only, so it stores nothing. */
  exists(): boolean {
    return this.readMeta('game') !== null;
  }

  // ────────────────────────────────────────────────────────────────────────────
  // Connections
  // ────────────────────────────────────────────────────────────────────────────

  async fetch(request: Request): Promise<Response> {
    if (request.headers.get('Upgrade') !== 'websocket') {
      return new Response('expected websocket upgrade', { status: 426 });
    }

    // The room code in the URL is what selected this object, so it — not a
    // client-supplied payload — is this table's identity. Recorded on the first
    // connection and never rewritten, so the code the Lobby is told about is
    // always the code quickplay would route back to.
    const room = new URL(request.url).searchParams.get('room');
    if (!room) return new Response('missing room', { status: 400 });

    const known = this.code;
    if (known === null) this.writeMeta('code', room);
    else if (known !== room) return new Response('room mismatch', { status: 409 });

    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    // acceptWebSocket (not accept) so the table can hibernate between hands
    // while players stay connected.
    this.ctx.acceptWebSocket(server);
    return new Response(null, { status: 101, webSocket: client });
  }

  private state(ws: WebSocket): SocketState | null {
    return (ws.deserializeAttachment() as SocketState | null) ?? null;
  }

  private setState(ws: WebSocket, state: SocketState | null): void {
    ws.serializeAttachment(state);
  }

  private send(ws: WebSocket, event: string, data?: unknown): void {
    try {
      ws.send(encode(event, data));
    } catch {
      // Socket closed between selection and send — the close handler cleans up.
    }
  }

  /** Send to every seated connection, optionally skipping the originator. */
  private broadcast(event: string, data: unknown, exclude?: WebSocket): void {
    for (const ws of this.ctx.getWebSockets()) {
      if (ws === exclude) continue;
      if (!this.state(ws)) continue;
      this.send(ws, event, data);
    }
  }

  /**
   * Personalized per player, hiding opponents' hole cards until showdown —
   * the same rule the socket.io broadcast applied.
   */
  private broadcastGame(): void {
    const game = this.loadGame();
    if (!game) return;

    const showAllCards = game.stage === 5;

    for (const ws of this.ctx.getWebSockets()) {
      const state = this.state(ws);
      if (!state) continue;

      const personalizedGame = showAllCards
        ? game
        : {
            ...game,
            players: game.players.map((p, i) =>
              i === state.playerIndex ? p : { ...p, cards: [] },
            ),
          };

      this.send(ws, 'updateGame', personalizedGame);
    }
  }

  private chat(message: ChatMessage, exclude?: WebSocket): void {
    this.broadcast('message', message, exclude);
  }

  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): Promise<void> {
    if (typeof message !== 'string') return;
    const envelope = decode(message);
    if (!envelope) return;

    switch (envelope.e) {
      case 'joinRoom':
        await this.onJoinRoom(ws, envelope.d as JoinRoomPayload);
        break;
      case 'rejoinRoom':
        this.onRejoinRoom(ws, envelope.d as { clientId: string; room: string });
        break;
      case 'chat':
        this.onChat(ws, envelope.d as string);
        break;
      case 'gameAction':
        await this.onGameAction(ws, envelope.d as GameAction);
        break;
      case 'changeBlinds':
        this.onChangeBlinds(ws, envelope.d as { smallBlind: number; bigBlind: number });
        break;
      case 'rebuy':
        this.onRebuy(ws, envelope.d as { amount: number });
        break;
      case 'leaveRoom':
        await this.onLeaveRoom(ws);
        break;
      default:
        break;
    }
  }

  async webSocketClose(ws: WebSocket): Promise<void> {
    // Deliberately does not cancel the turn alarm: if the disconnected player
    // had the action, the clock must still expire so the hand can continue.
    // The client row is kept so `rejoinRoom` can restore the seat.
    this.setState(ws, null);
  }

  async webSocketError(ws: WebSocket): Promise<void> {
    this.setState(ws, null);
  }

  // ────────────────────────────────────────────────────────────────────────────
  // Event handlers
  // ────────────────────────────────────────────────────────────────────────────

  private async onJoinRoom(ws: WebSocket, data: JoinRoomPayload): Promise<void> {
    if (!data?.clientId || !data.room || !data.username) return;

    // A payload naming a different table than the connection routes to would
    // otherwise seat the player here under someone else's code.
    if (data.room !== this.code) {
      this.send(ws, 'error', { message: 'ROOM_NOT_FOUND' });
      return;
    }

    let game = this.loadGame();
    if (!game) {
      game = initializeGame(data.smallBlind ?? SMALL_BLIND, data.bigBlind ?? BIG_BLIND);
    }

    if (game.players.length >= MAX_PLAYERS) {
      this.send(ws, 'error', { message: 'ROOM_FULL' });
      return;
    }

    const playerIndex = game.players.length;
    game.players.push(createPlayer(data.clientId, data.username));

    // Add AI players (only when the room is first created, i.e. this is player 0)
    if (playerIndex === 0 && data.aiCount && data.aiCount > 0) {
      const count = Math.min(data.aiCount, MAX_AI_PLAYERS);
      const usedNames = new Set<string>();
      for (let i = 0; i < count; i++) {
        const aiPlayer = createAIPlayer(game.players.length);
        const persona = assignPersona(usedNames);
        usedNames.add(persona.name);
        aiPlayer.name = persona.name;
        game.players.push(aiPlayer);
      }
    }

    this.persist(game);
    this.ctx.storage.sql.exec(
      `INSERT INTO clients (client_id, player_index, name) VALUES (?, ?, ?)
       ON CONFLICT(client_id) DO UPDATE SET player_index = excluded.player_index, name = excluded.name`,
      data.clientId,
      playerIndex,
      data.username,
    );

    this.setState(ws, {
      clientId: data.clientId,
      playerIndex,
      name: data.username,
      lastActionAt: 0,
    });

    this.send(ws, 'roomJoined', { playerIndex, game });
    this.chat(
      { userId: data.clientId, username: 'System', text: `${data.username} joined` },
      ws,
    );
    this.broadcastGame();
    await this.reportOccupancy();
  }

  private onRejoinRoom(ws: WebSocket, data: { clientId: string; room: string }): void {
    if (!data?.clientId) return;

    const record = this.getClient(data.clientId);
    if (!record || this.code !== data.room) {
      this.send(ws, 'error', { message: 'SESSION_NOT_FOUND' });
      return;
    }

    const game = this.loadGame();
    if (!game) {
      this.send(ws, 'error', { message: 'ROOM_NOT_FOUND' });
      return;
    }

    this.setState(ws, {
      clientId: data.clientId,
      playerIndex: record.player_index,
      name: record.name,
      lastActionAt: 0,
    });

    this.send(ws, 'roomJoined', { playerIndex: record.player_index, game });
    this.chat(
      { userId: data.clientId, username: 'System', text: `${record.name} reconnected` },
      ws,
    );
    this.broadcastGame();
  }

  private onChat(ws: WebSocket, text: unknown): void {
    const state = this.state(ws);
    if (!state || typeof text !== 'string') return;
    this.chat({ userId: state.clientId, username: state.name, text });
  }

  private async onGameAction(ws: WebSocket, action: GameAction): Promise<void> {
    const state = this.state(ws);
    if (!state || !action) return;

    const now = Date.now();
    if (now - state.lastActionAt < ACTION_COOLDOWN_MS) return;
    this.setState(ws, { ...state, lastActionAt: now });

    const game = this.loadGame();
    if (!game) return;

    // A connection may only act for the seat it occupies. `advance` is a
    // table-level request — the client sends it with playerIndex -1 — so it is
    // the one action not tied to a seat.
    if (action.type !== 'advance' && action.playerIndex !== state.playerIndex) {
      this.send(ws, 'error', { message: 'NOT_YOUR_SEAT' });
      return;
    }

    // Validate before touching a timer, never after. A rejected action leaves
    // the turn clock, its generation and any pending auto-deal exactly as they
    // were, so it can neither strand the table nor push its own deadline out.
    const updated = processGameAction(game, action);
    if (!updated) {
      this.send(ws, 'error', { message: 'ACTION_REJECTED' });
      return;
    }

    await this.handleActionResult(updated);
  }

  private onChangeBlinds(ws: WebSocket, data: { smallBlind: number; bigBlind: number }): void {
    const state = this.state(ws);
    if (!state || !data) return;

    const game = this.loadGame();
    if (!game || game.stage !== 0) return;

    const sb = Math.floor(data.smallBlind);
    const bb = Math.floor(data.bigBlind);
    if (!Number.isFinite(sb) || !Number.isFinite(bb)) return;
    if (sb <= 0 || bb <= sb || sb > MAX_BLIND || bb > MAX_BLIND) return;

    game.smallBlind = sb;
    game.bigBlind = bb;
    this.persist(game);
    this.broadcastGame();
  }

  private onRebuy(ws: WebSocket, data: { amount: number }): void {
    const state = this.state(ws);
    if (!state || !data) return;

    const game = this.loadGame();
    if (!game) return;

    const player = game.players[state.playerIndex];
    if (!player || player.stack > 0) return; // only busted players can rebuy

    const amount = Math.floor(data.amount);
    if (!Number.isFinite(amount)) return;
    player.stack = Math.max(MIN_REBUY, Math.min(MAX_REBUY, amount));
    // If between hands, activate them immediately so they're dealt in next hand
    if (game.stage === 0) player.isActive = true;

    this.persist(game);
    this.broadcastGame();
  }

  private async onLeaveRoom(ws: WebSocket): Promise<void> {
    const state = this.state(ws);
    if (!state) return;

    const game = this.loadGame();
    if (!game) return;

    const pi = state.playerIndex;
    const player = game.players[pi];
    if (!player) return;

    this.ctx.storage.sql.exec('DELETE FROM clients WHERE client_id = ?', state.clientId);
    this.setState(ws, null);

    // If it's their turn mid-hand, fold first so the hand can continue
    if (game.stage >= 1 && game.stage <= 4 && game.actionOn === pi && player.isActive) {
      this.scheduler.clear('turn', 'ai');
      const result = foldAndAdvance(game, pi);
      result.players[pi].hasLeft = true;
      result.players[pi].stack = 0;
      await this.handleActionResult(result);
    } else {
      player.isActive = false;
      player.hasLeft = true;
      player.stack = 0;
      this.persist(game);
      this.broadcastGame();
    }

    await this.reportOccupancy();
  }

  // ────────────────────────────────────────────────────────────────────────────
  // Game flow
  // ────────────────────────────────────────────────────────────────────────────

  private async handleActionResult(result: Poker): Promise<void> {
    const outcome = resolveActionResult(result);

    switch (outcome.kind) {
      case 'continue':
        await this.continuePlay(outcome.game);
        break;
      case 'awardDirect':
      case 'runOut':
        await this.concludeHand(outcome.game);
        break;
      case 'advance':
        if (outcome.game.stage === 5) await this.concludeHand(outcome.game);
        else await this.continuePlay(outcome.game);
        break;
    }
  }

  /** Store state, put the next seat on the clock, broadcast. */
  private async continuePlay(game: Poker): Promise<void> {
    await this.armTurnClock(game);
    this.broadcastGame();
  }

  /**
   * Replaces `startTurnTimer`. The 30s human clock and the AI's think-time
   * pause both become alarm rows rather than `setTimeout` handles, so they
   * survive the object being evicted mid-turn.
   */
  private async armTurnClock(game: Poker): Promise<void> {
    this.scheduler.clear('turn', 'ai');
    const seq = this.bumpTurnSeq();
    const plan = planTurn(game);
    const now = Date.now();

    game.timerDeadline = plan.kind === 'human' ? now + plan.durationMs : null;
    this.persist(game);

    if (plan.kind === 'human') this.scheduler.add('turn', now + plan.durationMs, seq);
    else if (plan.kind === 'ai') this.scheduler.add('ai', now + plan.delayMs, seq);

    await this.scheduler.sync();
  }

  /** Conclude a hand: store state, broadcast, send chat, queue the next deal. */
  private async concludeHand(game: Poker): Promise<void> {
    this.persist(game);
    this.broadcastGame();

    this.scheduler.clear('turn', 'ai', 'deal');
    const seq = this.bumpTurnSeq();
    const now = Date.now();

    for (const chat of handResultChats(game)) {
      this.scheduler.add('chat', now + aiChatDelayMs(), seq, chat);
    }
    this.scheduler.add('deal', now + AUTO_DEAL_DELAY_MS, seq);

    await this.scheduler.sync();
    // Seats bust out during play, not only when someone clicks Leave, so the
    // end of every hand is where the Lobby learns a table has emptied.
    await this.reportOccupancy();
  }

  private queueAIChat(game: Poker, playerIndex: number, trigger: ChatTrigger): void {
    const chat = getAIChat(game, playerIndex, trigger);
    if (!chat) return;
    this.scheduler.add('chat', Date.now() + aiChatDelayMs(), this.turnSeq(), chat);
  }

  // ────────────────────────────────────────────────────────────────────────────
  // Alarm — the one timer this object gets
  // ────────────────────────────────────────────────────────────────────────────

  async alarm(): Promise<void> {
    const due = this.scheduler.drainDue(Date.now());

    for (const timer of due) {
      // Re-read per timer: a handler above may have opened a new generation.
      const currentSeq = this.turnSeq();
      if (timer.kind !== 'chat' && timer.seq !== currentSeq) continue;

      switch (timer.kind) {
        case 'chat':
          this.dispatchChat(timer);
          break;
        case 'turn':
          await this.onTurnExpired();
          break;
        case 'ai':
          await this.onAITurn();
          break;
        case 'deal':
          await this.onAutoDeal();
          break;
      }
    }

    await this.scheduler.sync();
  }

  private dispatchChat(timer: ScheduledTimer<TimerKind>): void {
    const chat = AlarmScheduler.parsePayload<AIChat>(timer);
    if (!chat) return;
    this.chat({ userId: chat.playerId, username: chat.playerName, text: chat.text });
  }

  /** The human on the clock ran out of time — fold them and move on. */
  private async onTurnExpired(): Promise<void> {
    const game = this.loadGame();
    if (!game || game.stage < 1 || game.stage > 4) return;

    const pi = game.actionOn;
    if (!game.players[pi]?.isActive) return;

    await this.handleActionResult(foldAndAdvance(game, pi));
  }

  private async onAITurn(): Promise<void> {
    const game = this.loadGame();
    if (!game || game.stage < 1 || game.stage > 4) return;

    const actingIndex = game.actionOn;
    const player = game.players[actingIndex];
    if (!player?.isAI) return;

    const { action, chatTrigger } = makeAIDecision(game, actingIndex, personaForPlayer(player));
    const result = processGameAction(game, action);
    // A decision the rules turn down cannot simply be dropped: this alarm has
    // already been drained, so returning here would leave the seat on a clock
    // that no longer exists. Treat it as the seat running out of time.
    if (!result) {
      await this.handleActionResult(foldAndAdvance(game, actingIndex));
      return;
    }

    this.queueAIChat(game, actingIndex, chatTrigger);
    await this.handleActionResult(result);
  }

  private async onAutoDeal(): Promise<void> {
    const game = this.loadGame();
    if (!game || game.stage !== 5) return;

    const { game: next, paused } = prepareNextHand(game);

    // Fewer than two seats can play — hold at stage 0 and wait for rebuys.
    if (paused) {
      this.persist(next);
      this.broadcastGame();
      await this.reportOccupancy();
      return;
    }

    // A hand nobody can act on has no clock to arm, and `advance` is refused
    // once a hand is under way, so arming an empty clock would strand the table
    // at stage 1 with the alarm deleted.
    const dealt = resolveDealtHand(next);
    if (dealt.kind === 'runOut') {
      await this.concludeHand(dealt.game);
      return;
    }

    await this.armTurnClock(dealt.game);
    this.broadcastGame();
  }

  // ────────────────────────────────────────────────────────────────────────────
  // Lobby
  // ────────────────────────────────────────────────────────────────────────────

  /** Public tables report their occupancy so quickplay can find the fullest one. */
  private async reportOccupancy(): Promise<void> {
    const code = this.code;
    if (!code || !isPublicRoomCode(code)) return;

    const game = this.loadGame();
    try {
      await this.env.LOBBY.getByName(LOBBY_SINGLETON).reportRoom(
        code,
        game ? countSeated(game) : 0,
      );
    } catch (err) {
      console.error(`[room ${code}] lobby occupancy report failed:`, err);
    }
  }
}

interface JoinRoomPayload {
  username: string;
  room: string;
  clientId: string;
  smallBlind?: number;
  bigBlind?: number;
  aiCount?: number;
}
