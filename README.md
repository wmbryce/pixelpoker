# Pixel Poker

A real-time multiplayer Texas Hold'em poker game with pixel-art styling, private rooms, quickplay, chat, AI seats, and a training mode.

## Tech Stack

| Layer | Technology |
|---|---|
| Runtime & package manager | [Bun](https://bun.sh) |
| Frontend | React 19, TypeScript 6, Vite |
| Styling | Tailwind CSS |
| Client state | Zustand |
| Real-time communication | Socket.IO |
| Backend | Express, Socket.IO server |
| Tests | Bun test runner |

## Project Structure

```
pixelpoker/
├── shared/          # Shared TypeScript types: poker, socket, training
├── client/          # React/Vite frontend
│   └── src/
│       ├── Components/          # Table, player, cards, chat, welcome screens
│       ├── Components/training/ # Lesson + debrief training UI
│       ├── store/               # Zustand game state store
│       └── socket.ts            # Socket.IO client singleton
└── server/          # Bun + Express + Socket.IO backend
    ├── app.ts                    # Server entry point + REST endpoints
    ├── controllers/              # Gameplay, rooms, quickplay, AI, training
    └── __tests__/                # Bun unit/integration tests
```

The server is the single source of truth for all game state. Clients send actions (raise, call, fold, advance stage) and receive updated state via Socket.IO events. Training uses the same socket layer with lesson-specific events and scoring.

## Getting Started

**Prerequisites:** [Bun](https://bun.sh) v1.0+

```bash
# Clone and install all workspace dependencies
git clone https://github.com/wmbryce/pixelpoker.git
cd pixelpoker
bun install
```

## Running in Development

Open two terminal windows:

```bash
# Terminal 1 — start the server (port 8000, hot-reloads on save)
bun run --filter server dev

# Terminal 2 — start the client (port 3000, hot-reloads on save)
bun run --filter client dev
```

Or run both from the root:

```bash
bun run dev
```

Then open http://localhost:3000 in your browser.

## How to Play

1. Enter a username.
2. Create a room, join by code, or use quickplay; each player starts with chips.
3. Click **Deal pre-flop** to start — two cards are dealt to each player.
4. Players take turns acting (raise, check/call, fold); the active seat is highlighted.
5. Advance through flop, turn, river, and showdown.
6. At showdown, the winner is determined automatically and the pot is distributed.
7. The game resets for the next hand.

## Training Mode

Training mode runs guided poker lessons over Socket.IO. The client renders lesson intro, table, street score, HUD, completion, and debrief screens; the server owns lesson lifecycle, phase routing, scoring, and AI/table state.

## Running Tests

```bash
bun test --cwd server
# or
bun run test
```

Tests cover deck generation, all five game stages (pre-flop through showdown), player actions (raise, call, fold), quickplay rooms, and the training socket flow.

## Building for Production

```bash
bun run build
```

This compiles the client (Vite build → `client/dist/`) and server (`server/dist/`). In production, the Express server serves the built client from `client/dist/`.
