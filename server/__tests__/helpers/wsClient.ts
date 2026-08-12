import { SELF } from 'cloudflare:test';
import { decode, encode, type Envelope } from '@pixelpoker/shared/src/protocol';

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * A test-side WebSocket speaking the same envelope the browser client speaks,
 * so these tests exercise the real wire protocol rather than calling handlers
 * directly.
 */
export class TestClient {
  private readonly messages: Envelope[] = [];
  private readonly raw: string[] = [];
  private readonly consumed = new Set<number>();

  private constructor(private readonly ws: WebSocket) {}

  static async connect(path: string, query: Record<string, string>): Promise<TestClient> {
    const url = new URL(`https://pixelpoker.test${path}`);
    for (const [key, value] of Object.entries(query)) url.searchParams.set(key, value);

    const response = await SELF.fetch(url.toString(), { headers: { Upgrade: 'websocket' } });
    const ws = response.webSocket;
    if (!ws) throw new Error(`expected a websocket, got HTTP ${response.status}`);

    const client = new TestClient(ws);
    ws.addEventListener('message', (event: MessageEvent) => {
      if (typeof event.data !== 'string') return;
      client.raw.push(event.data);
      const envelope = decode(event.data);
      if (envelope) client.messages.push(envelope);
    });
    ws.accept();
    return client;
  }

  emit(event: string, data?: unknown): void {
    this.ws.send(encode(event, data));
  }

  /** Send a non-envelope frame, as the heartbeat does. */
  emitRaw(frame: string): void {
    this.ws.send(frame);
  }

  /** Resolve once `frame` has arrived verbatim, outside the envelope stream. */
  async waitForRaw(frame: string, timeoutMs = 3_000): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    while (!this.raw.includes(frame)) {
      if (Date.now() > deadline) {
        throw new Error(`timed out waiting for raw frame "${frame}"; received: [${this.raw}]`);
      }
      await sleep(5);
    }
  }

  /** Resolve with the next unconsumed payload for `event`. */
  async waitFor<T>(event: string, timeoutMs = 3_000): Promise<T> {
    const deadline = Date.now() + timeoutMs;
    for (;;) {
      const found = this.take<T>(event);
      if (found !== undefined) return found;
      if (Date.now() > deadline) {
        throw new Error(
          `timed out waiting for "${event}"; received: [${this.messages.map((m) => m.e).join(', ')}]`,
        );
      }
      await sleep(5);
    }
  }

  /** Take the next unconsumed payload for `event`, or undefined if none yet. */
  take<T>(event: string): T | undefined {
    for (let i = 0; i < this.messages.length; i++) {
      if (this.consumed.has(i) || this.messages[i].e !== event) continue;
      this.consumed.add(i);
      return this.messages[i].d as T;
    }
    return undefined;
  }

  /** Every event name seen so far, in order. */
  seen(): string[] {
    return this.messages.map((m) => m.e);
  }

  /** Let queued frames land before asserting on what did (or did not) arrive. */
  static async settle(ms = 60): Promise<void> {
    await sleep(ms);
  }

  close(): void {
    this.ws.close();
  }
}
