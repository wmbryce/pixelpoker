import { decode, encode } from '@pixelpoker/shared/src/protocol';
import { wsUrl } from '../config';

type Handler = (payload: never) => void;

const MIN_BACKOFF_MS = 500;
const MAX_BACKOFF_MS = 8_000;

/**
 * A raw-WebSocket client with the slice of the Socket.IO API this app used:
 * `connect` / `disconnect` / `connected` / `emit` / `on` / `off`, plus the
 * synthetic `connect` and `disconnect` events.
 *
 * Socket.IO also gave us automatic reconnection. Workers do not, so it is
 * implemented here: exponential backoff with jitter, and messages emitted
 * while the socket is down are queued and flushed once it opens. Reconnecting
 * only restores the transport — restoring the player's seat is the app's job,
 * which it does by emitting `rejoinRoom` from a `connect` handler.
 */
export class MiniSocket {
  private ws: WebSocket | null = null;
  private handlers = new Map<string, Set<Handler>>();
  private queue: string[] = [];
  private query: Record<string, string> = {};
  private wantOpen = false;
  private attempts = 0;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(private readonly path: string) {}

  get connected(): boolean {
    return this.ws !== null && this.ws.readyState === WebSocket.OPEN;
  }

  connect(query: Record<string, string> = {}): void {
    const live =
      this.ws !== null &&
      (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING);
    // The query selects which Durable Object we land on, so a changed query
    // means a different room — reuse the socket only when it still matches.
    if (live && this.serialize(query) === this.serialize(this.query)) {
      this.wantOpen = true;
      return;
    }
    if (live) this.disconnect();
    this.query = query;
    this.wantOpen = true;
    this.attempts = 0;
    this.open();
  }

  private serialize(query: Record<string, string>): string {
    return Object.keys(query)
      .sort()
      .map((key) => `${key}=${query[key]}`)
      .join('&');
  }

  disconnect(): void {
    this.wantOpen = false;
    this.clearRetry();
    this.queue = [];
    const ws = this.ws;
    this.ws = null;
    ws?.close(1000, 'client disconnect');
  }

  emit(event: string, data?: unknown): void {
    const frame = encode(event, data);
    if (this.connected) this.ws!.send(frame);
    else this.queue.push(frame);
  }

  on(event: string, handler: Handler): void {
    let set = this.handlers.get(event);
    if (!set) {
      set = new Set();
      this.handlers.set(event, set);
    }
    set.add(handler);
  }

  /** Omitting `handler` removes every handler for the event, as Socket.IO does. */
  off(event: string, handler?: Handler): void {
    if (!handler) {
      this.handlers.delete(event);
      return;
    }
    this.handlers.get(event)?.delete(handler);
  }

  private open(): void {
    let socket: WebSocket;
    try {
      socket = new WebSocket(wsUrl(this.path, this.query));
    } catch (err) {
      console.error('[socket] cannot open connection:', err);
      this.wantOpen = false;
      return;
    }
    this.ws = socket;

    socket.onopen = () => {
      if (this.ws !== socket) return;
      this.attempts = 0;
      const queued = this.queue;
      this.queue = [];
      for (const frame of queued) socket.send(frame);
      this.dispatch('connect', undefined);
    };

    socket.onmessage = (event: MessageEvent) => {
      if (typeof event.data !== 'string') return;
      const envelope = decode(event.data);
      if (!envelope) return;
      this.dispatch(envelope.e, envelope.d);
    };

    socket.onclose = () => {
      if (this.ws !== socket) return;
      this.ws = null;
      this.dispatch('disconnect', undefined);
      if (this.wantOpen) this.scheduleRetry();
    };

    // `onerror` is always followed by `onclose`, which owns the retry.
    socket.onerror = () => {};
  }

  private scheduleRetry(): void {
    this.clearRetry();
    const backoff = Math.min(MAX_BACKOFF_MS, MIN_BACKOFF_MS * 2 ** this.attempts);
    this.attempts += 1;
    const delay = backoff / 2 + Math.random() * (backoff / 2);
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null;
      if (this.wantOpen) this.open();
    }, delay);
  }

  private clearRetry(): void {
    if (this.retryTimer !== null) {
      clearTimeout(this.retryTimer);
      this.retryTimer = null;
    }
  }

  private dispatch(event: string, payload: unknown): void {
    const set = this.handlers.get(event);
    if (!set) return;
    for (const handler of [...set]) {
      try {
        (handler as (p: unknown) => void)(payload);
      } catch (err) {
        console.error(`[socket] handler for "${event}" threw:`, err);
      }
    }
  }
}
