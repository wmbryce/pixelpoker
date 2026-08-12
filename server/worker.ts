import { WS_GAME_PATH, WS_TRAINING_PATH } from '@pixelpoker/shared/src/protocol';
import { LOBBY_SINGLETON } from './durable/Lobby';

export { PokerRoom } from './durable/PokerRoom';
export { TrainingRoom } from './durable/TrainingRoom';
export { Lobby } from './durable/Lobby';

/**
 * The Worker is a thin router. It holds no game state: every request is either
 * answered from a Durable Object or is a WebSocket upgrade proxied into one.
 * Requests are validated here rather than in the objects, so malformed traffic
 * never wakes (or bills) a Durable Object.
 */

/** Room codes are player-authored, so this only rejects abusive input. */
const MAX_ROOM_CODE_LENGTH = 128;

function isValidRoomCode(code: string): boolean {
  if (code.length === 0 || code.length > MAX_ROOM_CODE_LENGTH) return false;
  // Codes are built from a player-typed room name, so anything printable is
  // fair game; only control characters are rejected.
  // eslint-disable-next-line no-control-regex
  return !/[\u0000-\u001f\u007f]/.test(code);
}

function allowedOrigins(env: Env): string[] {
  return (env.CLIENT_ORIGIN ?? '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
}

function corsHeaders(request: Request, env: Env): Record<string, string> {
  const origin = request.headers.get('Origin');
  const allowed = allowedOrigins(env);
  if (!origin || !allowed.includes(origin)) return {};
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    Vary: 'Origin',
  };
}

function json(data: unknown, request: Request, env: Env, status = 200): Response {
  return Response.json(data, {
    status,
    headers: corsHeaders(request, env),
  });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders(request, env) });
    }

    if (request.method !== 'GET') {
      return json({ error: 'method not allowed' }, request, env, 405);
    }

    // ── WebSocket upgrades ──

    if (url.pathname === WS_GAME_PATH) {
      if (request.headers.get('Upgrade') !== 'websocket') {
        return new Response('expected Upgrade: websocket', { status: 426 });
      }
      const room = url.searchParams.get('room');
      if (!room || !isValidRoomCode(room)) {
        return new Response('missing or invalid room', { status: 400 });
      }
      return env.POKER_ROOM.getByName(room).fetch(request);
    }

    if (url.pathname === WS_TRAINING_PATH) {
      if (request.headers.get('Upgrade') !== 'websocket') {
        return new Response('expected Upgrade: websocket', { status: 426 });
      }
      const client = url.searchParams.get('client');
      if (!client || !isValidRoomCode(client)) {
        return new Response('missing or invalid client', { status: 400 });
      }
      return env.TRAINING_ROOM.getByName(client).fetch(request);
    }

    // ── REST ──

    if (url.pathname === '/health') {
      const publicRooms = await env.LOBBY.getByName(LOBBY_SINGLETON).publicRoomCount();
      return json({ status: 'ok', publicRooms }, request, env);
    }

    const roomMatch = url.pathname.match(/^\/rooms\/(.+)$/);
    if (roomMatch) {
      const code = decodeURIComponent(roomMatch[1]);
      if (!isValidRoomCode(code)) return json({ exists: false }, request, env);
      const exists = await env.POKER_ROOM.getByName(code).exists();
      return json({ exists }, request, env);
    }

    if (url.pathname === '/rooms-quick') {
      const result = await env.LOBBY.getByName(LOBBY_SINGLETON).findOrCreate();
      return json(result, request, env);
    }

    return json({ error: 'not found' }, request, env, 404);
  },
} satisfies ExportedHandler<Env>;
