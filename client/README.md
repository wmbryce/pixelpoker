# Pixel Poker client

React/Vite frontend for Pixel Poker. Stack and architecture: the root
[README](../README.md).

## What it does

- Join or create poker rooms, talking to the Worker over a raw WebSocket
  (`src/lib/miniSocket.ts`).
- Auto-rejoin a room from the URL + saved client session, including after a
  dropped connection reconnects.
- Render the live table, players, cards, actions, and chat.
- Run the training mode (`TrainingView`) for lesson/debrief flows.

## Development

From the repo root:

```sh
bun install
bun --filter client dev
```

The dev server runs on http://localhost:3000 and expects the Worker on port
8000; `.env.development` points `VITE_SERVER_URL` there.

## Build

```sh
bun --filter client build
```

The build output goes to `client/dist/`, which Cloudflare Pages publishes.
`VITE_SERVER_URL` must be set at build time — without it the app renders a
"misconfigured build" screen. Deploy details: [docs/cloudflare-deploy.md](../docs/cloudflare-deploy.md).
