# Pixel Poker client

React/Vite frontend for Pixel Poker.

## What it does

- Join or create poker rooms backed by the Socket.IO server.
- Auto-rejoin a room from the URL + saved client session.
- Render the live table, players, cards, actions, and chat.
- Run the training mode (`TrainingView`) for lesson/debrief flows.

## Stack

- React 19
- TypeScript 6
- Vite
- Tailwind CSS 4
- Zustand
- Socket.IO client

## Development

From the repo root:

```sh
bun install
bun --filter client dev
```

The dev server runs on http://localhost:3000 and expects the server on port 8000.

## Build

```sh
bun --filter client build
```

The build output goes to `client/dist/` and is served by the Bun/Express server in production.
