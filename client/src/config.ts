// In production the client is served from the same origin as the server,
// so an empty string tells socket.io to connect to the current page's host.
// The VITE_SERVER_URL env var is set in .env for local development.
export const SERVER_URL = import.meta.env.VITE_SERVER_URL ?? '';
