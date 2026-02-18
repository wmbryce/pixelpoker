# Pixel Poker

A real-time multiplayer Texas Hold'em poker game with pixel art cards.

## Tech Stack

| Layer | Technology |
|---|---|
| Runtime & package manager | [Bun](https://bun.sh) |
| Frontend | React 19, TypeScript 5, Vite |
| Styling | Tailwind CSS |
| Client state | Zustand |
| Real-time communication | Socket.IO |
| Backend | Express, Socket.IO server |
| Tests | Bun test runner |

## Project Structure

```
pixelpoker/
├── shared/          # Shared TypeScript types (CardType, Poker, socket events, etc.)
├── client/          # React frontend
│   └── src/
│       ├── Components/   # UI components (Table, Player, Card, Hand, Chat)
│       ├── store/        # Zustand game state store
│       └── socket.ts     # Socket.IO client singleton
└── server/          # Express + Socket.IO backend
    ├── app.ts            # Server entry point
    ├── controllers/      # Game logic (deck, gameplay, actions)
    └── __tests__/        # Bun unit tests
```

The server is the single source of truth for all game state. Clients send actions (raise, call, fold, advance stage) and receive updated state via Socket.IO events.

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

Then open [http://localhost:3000](http://localhost:3000) in your browser.

To play with multiple players, open the app in separate browser tabs. Each tab enters a username and the **same room name** to join the same game.

## Running Tests

```bash
bun test --cwd server
```

Tests cover deck generation, all five game stages (pre-flop through showdown), and player actions (raise, call, fold).

## How to Play

1. Enter a username and room name, then click **Join**
2. Each player who joins the same room name is added to the table with 1000 chips
3. Click **Deal pre-flop** to start — two cards are dealt to each player
4. Players take turns acting (Raise, Check/Call, Fold) — the active seat is highlighted in yellow
5. After all players have acted, click the deal button to advance to the Flop, Turn, and River
6. At showdown, the winner is determined automatically and the pot is distributed
7. The game resets for the next hand

## Building for Production

```bash
bun run build
```

This compiles the client (Vite build → `client/dist/`) and server (`server/dist/`).
