/**
 * Wire protocol for the raw-WebSocket transport that replaced Socket.IO.
 *
 * Socket.IO gave us a named-event envelope for free. Workers only speak raw
 * WebSocket frames, so we hand-roll the smallest envelope that preserves the
 * existing event contract: a JSON object with the event name in `e` and the
 * payload in `d`. Event names are unchanged from the Socket.IO version.
 */

export interface Envelope<T = unknown> {
  e: string;
  d?: T;
}

export function encode(event: string, data?: unknown): string {
  return data === undefined ? JSON.stringify({ e: event }) : JSON.stringify({ e: event, d: data });
}

export function decode(raw: string): Envelope | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof parsed !== 'object' || parsed === null) return null;
  const { e, d } = parsed as { e?: unknown; d?: unknown };
  if (typeof e !== 'string' || e.length === 0) return null;
  return { e, d };
}

/**
 * Quickplay room codes. `roomManager` used to keep a `publicRooms` Set beside
 * the room Map; with one Durable Object per room there is no shared Set, so the
 * code prefix is what marks a room as publicly joinable.
 */
export const QUICK_ROOM_PREFIX = 'QUICK-';

export function isPublicRoomCode(code: string): boolean {
  return code.startsWith(QUICK_ROOM_PREFIX);
}

/** Paths the Worker routes WebSocket upgrades on. */
export const WS_GAME_PATH = '/ws';
export const WS_TRAINING_PATH = '/ws/training';

/**
 * Heartbeat frames, replacing Socket.IO's pingInterval/pingTimeout. They are
 * deliberately not envelopes: the Durable Objects answer them through
 * `setWebSocketAutoResponse`, which replies without waking the object, so a
 * silently dropped connection is detected without costing duration or
 * preventing hibernation.
 */
export const WS_PING = 'ping';
export const WS_PONG = 'pong';
