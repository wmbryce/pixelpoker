# Pixel Poker

A real-time multiplayer Texas Hold'em poker game with pixel-art styling, private rooms, quickplay, chat, AI seats, and a training mode.

## Tech Stack

| Layer | Technology |
|---|---|
| Package manager | [Bun](https://bun.sh) |
| Frontend | React 19, TypeScript 6, Vite |
| Styling | Tailwind CSS |
| Client state | Zustand |
| Real-time communication | Raw WebSockets |
| Backend | Cloudflare Workers + Durable Objects |
| Hosting | Cloudflare Pages (client), Workers (server) |
| Tests | Vitest on `@cloudflare/vitest-pool-workers` |

## Project Structure

```
pixelpoker/
├── shared/          # Shared TypeScript types: poker, socket, training
├── client/          # React/Vite frontend
│   └── src/
│       ├── Components/          # Table, player, cards, chat, welcome screens
│       ├── Components/training/ # Lesson + debrief training UI
│       ├── store/               # Zustand game state store
│       ├── socket.ts            # Typed WebSocket singletons (game + training)
│       └── lib/miniSocket.ts    # Raw-WebSocket client with reconnect
└── server/          # Cloudflare Worker + Durable Objects
    ├── worker.ts                 # Worker entry: routing, REST, WebSocket upgrades
    ├── wrangler.jsonc            # Bindings + Durable Object migrations
    ├── durable/                  # PokerRoom, TrainingRoom, Lobby, alarm scheduler
    ├── controllers/              # Pure game logic: gameplay, actions, deck, AI, training
    └── __tests__/                # Vitest suites, run inside workerd
```

The server is the single source of truth for all game state. **Each table is one
Durable Object**, addressed by room code, which owns that table's authoritative
state in SQLite storage. Clients send actions (raise, call, fold, advance stage)
over a raw WebSocket and receive updated state back; the envelope is a small
`{ e, d }` JSON frame defined in `shared/src/protocol.ts`. Training runs in its
own per-player Durable Object using the same transport.

Timers are Durable Object **alarms**, not `setTimeout` — an object can be evicted
between requests, so the 30-second turn clock and the 4-second auto-deal are
persisted rows drained by a single alarm (`server/durable/scheduler.ts`). This
also lets the object hibernate between actions while players stay connected.

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
# Terminal 1 — start the Worker (wrangler dev on port 8000, hot-reloads on save)
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

Training mode runs guided poker lessons over the same WebSocket transport, in a per-player Durable Object. The client renders lesson intro, table, street score, HUD, completion, and debrief screens; the server owns lesson lifecycle, phase routing, scoring, and AI/table state.

## Running Tests

```bash
bun run test
```

Tests run inside workerd via `@cloudflare/vitest-pool-workers`, so the Durable
Object suites exercise real storage, alarms and eviction rather than mocks. They
cover deck generation, all five game stages (pre-flop through showdown), player
actions (raise, call, fold), quickplay matchmaking, the turn-clock and auto-deal
alarm paths, reconnection, hibernation survival, and the training flow.

## Building for Production

```bash
bun run build      # Vite build → client/dist/ (what Pages publishes)
bun run deploy     # wrangler deploy → the Worker + Durable Objects
```

The client is a static build served by Cloudflare Pages; the server is a Worker.
They are separate origins, so the client needs `VITE_SERVER_URL` set at build
time — a build without it renders an explicit "misconfigured build" screen
rather than failing silently at connect time.

See **[docs/cloudflare-deploy.md](docs/cloudflare-deploy.md)** for the full
deploy runbook, the Pages settings, CI secrets, and the cost model.
