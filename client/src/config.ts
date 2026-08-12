// The client is a static Cloudflare Pages build and the game server is a
// separate Worker, so the server URL is real configuration — there is no
// same-origin fallback to hide behind. A missing VITE_SERVER_URL used to
// silently become '' and produce a build that failed only at connect time;
// now it is surfaced as CONFIG_ERROR and rendered instead of the app.

const raw = (import.meta.env.VITE_SERVER_URL ?? '').trim();

function validate(value: string): string | null {
  if (value === '') {
    return 'VITE_SERVER_URL is not set. This build has no game server to talk to. Set VITE_SERVER_URL to the Worker origin (for example https://pixelpoker-server.<subdomain>.workers.dev) and rebuild.';
  }
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    return `VITE_SERVER_URL is not a valid absolute URL: "${value}".`;
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return `VITE_SERVER_URL must be an http(s) URL, got "${value}".`;
  }
  return null;
}

export const CONFIG_ERROR: string | null = validate(raw);

/** Origin of the game Worker, without a trailing slash. Empty when misconfigured. */
export const SERVER_URL = CONFIG_ERROR ? '' : raw.replace(/\/+$/, '');

/** Build a ws(s):// URL for a Worker WebSocket route. Throws if misconfigured. */
export function wsUrl(path: string, query: Record<string, string> = {}): string {
  if (CONFIG_ERROR) throw new Error(CONFIG_ERROR);
  const url = new URL(SERVER_URL + path);
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
  for (const [key, value] of Object.entries(query)) url.searchParams.set(key, value);
  return url.toString();
}
