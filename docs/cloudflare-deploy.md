# Deploying Pixel Poker to Cloudflare

Pixel Poker runs as two Cloudflare deployments:

| Piece | Where | What it is |
|---|---|---|
| Game server | Workers + Durable Objects (`pixelpoker-server`) | One Durable Object per table, plus a training object per player and one lobby object |
| Client | Cloudflare Pages (`pixelpoker`) | Static Vite/React build that talks to the Worker over WebSocket |

There is no EC2 box, no pm2 and no long-running process. `scripts/deploy.sh`,
`ecosystem.config.cjs` and the SSH deploy workflow were deleted with this change.

## Prerequisites

- A Cloudflare account on the **Workers Paid plan** ($5/month minimum). Durable
  Objects with the SQLite backend are available on the Free plan too, but the
  paid plan is what the cost estimate below assumes.
- `wrangler` authenticated: `bunx wrangler login`.
- Nothing else. **The game needs no secrets** — the AI opponents are local logic
  (see [AI opponents](#ai-opponents-need-no-secret)).

## 1. Deploy the Worker first

The Pages build needs the Worker's URL, so the Worker goes first.

```bash
bun install
cd server
bunx wrangler deploy
```

Note the URL it prints, e.g. `https://pixelpoker-server.<subdomain>.workers.dev`.

The first deploy also creates the three Durable Object namespaces declared in
`server/wrangler.jsonc` (`migrations` tag `v1`, `new_sqlite_classes`). No manual
namespace creation is needed.

Verify:

```bash
curl https://pixelpoker-server.<subdomain>.workers.dev/health
# {"status":"ok","publicRooms":0}
```

## 2. Create the Pages project

In the Cloudflare dashboard: **Workers & Pages → Create → Pages → Connect to Git**,
pick `wmbryce/pixelpoker`, then set:

| Setting | Value |
|---|---|
| Production branch | `master` |
| Framework preset | None |
| Build command | `bun install && bun run build` |
| Build output directory | `client/dist` |
| Root directory | *(repo root — leave blank)* |

Environment variables (**Settings → Environment variables**, add to both
*Production* and *Preview*):

| Name | Value | Why |
|---|---|---|
| `VITE_SERVER_URL` | `https://pixelpoker-server.<subdomain>.workers.dev` | The Worker origin. A build without it renders a "MISCONFIGURED BUILD" screen instead of the game — see `client/src/config.ts`. |

These are *build-time* variables: Vite inlines them, so changing one needs a
redeploy, not just a restart.

Note the Pages URL it gives you, e.g. `https://pixelpoker.pages.dev`.

## 3. Point the Worker's CORS at Pages

The Worker only accepts requests from origins listed in `CLIENT_ORIGIN`. It ships
configured for local development, so production must override it:

```bash
cd server
bunx wrangler deploy --var CLIENT_ORIGIN:"https://pixelpoker.pages.dev"
```

`CLIENT_ORIGIN` accepts a comma-separated list if you also serve a custom domain:

```bash
bunx wrangler deploy --var CLIENT_ORIGIN:"https://pixelpoker.pages.dev,https://poker.example.com"
```

To avoid having to remember the flag, edit `vars.CLIENT_ORIGIN` in
`server/wrangler.jsonc` instead and deploy normally. A plain `wrangler deploy`
uses whatever is in that file, so a deploy that forgets the flag will silently
put the dev origin back and break the browser's CORS preflight.

## 4. CI

`.github/workflows/ci.yml` runs lint, typecheck and tests on every push and PR.

`.github/workflows/deploy.yml` deploys the Worker on pushes to `master`. It needs
two repository settings:

| Kind | Name | Value / where it comes from |
|---|---|---|
| Secret | `CLOUDFLARE_API_TOKEN` | Cloudflare dashboard → My Profile → API Tokens → Create Token → **Edit Cloudflare Workers** template. Scope it to the one account. |
| Secret | `CLOUDFLARE_ACCOUNT_ID` | Cloudflare dashboard → Workers & Pages → Account ID in the right-hand sidebar |
| Variable | `CLIENT_ORIGIN` | The Pages URL from step 2, e.g. `https://pixelpoker.pages.dev` |

Set with `gh`:

```bash
gh secret set CLOUDFLARE_API_TOKEN
gh secret set CLOUDFLARE_ACCOUNT_ID
gh variable set CLIENT_ORIGIN --body "https://pixelpoker.pages.dev"
```

Pages builds itself from the Git integration, so it is not in the workflow.

## 5. Smoke test

1. Open the Pages URL in two browsers.
2. One creates a room, the other joins with the code.
3. Deal; check the turn timer counts down and auto-folds after 30s if ignored.
4. Reload one tab mid-hand — it should silently reclaim its seat.

## Local development

```bash
bun install
bun run dev     # wrangler dev on :8000 + vite on :3000
```

`server/wrangler.jsonc` pins `dev.port` to 8000 to match
`client/.env.development`, which sets `VITE_SERVER_URL=http://localhost:8000`.

Durable Object state persists locally under `server/.wrangler/state`. Delete that
directory to reset all tables.

---

## Cost

### What this costs on Cloudflare

Durable Objects bill on **requests**, **compute duration** and **SQLite storage**.
Two scenarios, both assuming a table is a 4-player game lasting ~40 minutes with
roughly 60 hands, and each player sending ~4 messages per hand.

| | Small: 30 tables/day | Busier: 300 tables/day |
|---|---|---|
| WebSocket connections | 5.4k/mo | 54k/mo |
| Incoming WS messages | 1.1M/mo → **54k** billed (20:1 ratio) | 11M/mo → 540k billed |
| Alarm invocations | ~60k/mo | ~600k/mo |
| **Billable requests** | ~120k (of 1M included) → **$0** | ~1.2M → ~200k over → **$0.03** |
| **Compute duration** | ~450 GB-s (of 400,000 included) → **$0** | ~4,500 GB-s → **$0** |
| **Rows written** | ~5.4M (of 50M included) → **$0** | ~54M → ~4M over → **~$4** |
| Workers Paid minimum | $5 | $5 |
| **Total** | **~$5/month** | **~$9/month** |

Pages static hosting is free and unmetered on both plans.

The headline: at anything resembling this game's real traffic, the bill is the
**$5/month plan minimum**. Usage charges only start to matter well past the
scale this app is at, and when they do it is *row writes* — not compute — that
lead, because the whole table state is persisted on every action.

### What the EC2 box presumably costs

The repo does not record the instance type, so this cannot be read from the code
— it needs an eye on the AWS bill. For the shape of workload `ecosystem.config.cjs`
described (one always-on Node/Bun process), the usual candidates are:

| Instance | On-demand (us-east-1, 730h) | + 20 GB gp3 EBS | Typical total |
|---|---|---|---|
| `t3.micro` | ~$7.50 | ~$1.60 | **~$9/month** |
| `t3.small` | ~$15.00 | ~$1.60 | **~$17/month** |
| `t3.medium` | ~$30.00 | ~$1.60 | **~$32/month** |

Plus data transfer out, and an Elastic IP if one is attached but idle.

**So the swap is roughly $9–32/month of EC2 for ~$5/month of Cloudflare**, and the
Cloudflare figure is mostly a plan floor rather than usage. The saving is real but
modest in absolute terms; the bigger wins are that the game gets a public address,
survives process restarts (state is in SQLite, not a `Map`), and stops needing a
box to patch.

### WebSocket hibernation — and why it matters here

**It fits, and the design depends on it.** A Durable Object hibernates — leaves
memory entirely while its clients stay connected — once it has been idle for 10
seconds and *all* of these hold:

- no `setTimeout` / `setInterval` pending
- no in-flight awaited `fetch()`
- the standard WebSocket API is not in use
- no request or event is still being processed
- no outbound TCP/WebSocket connection

Duration is not billed while an object is idle-and-hibernatable, even before the
runtime actually hibernates it. So the two central choices in this port are
directly what makes it cheap:

- `ctx.acceptWebSocket()` instead of `ws.accept()`. Calling `accept()` bills
  duration for the *entire time the socket is connected* — a 40-minute table
  would be billed for 40 minutes of wall-clock.
- Alarms instead of `setTimeout`. A pending `setTimeout` blocks hibernation
  outright; a pending **storage alarm does not** — it is absent from the list
  above, and firing simply wakes the object and re-runs its constructor.

The difference is not small. At 300 tables/day, billing wall-clock for connected
sockets instead of executed milliseconds is ~2.8M GB-s/month against an included
400k — about **$37/month of avoidable duration charges**. The per-connection
state that hibernation discards is kept on the socket via
`serializeAttachment()`, and the table state is in SQLite, so waking costs a
storage read rather than a lost game.

An idle table therefore costs nothing but its stored bytes.

## AI opponents need no secret

`server/controllers/ai.ts` is entirely local: hand strength comes from
`pokersolver` plus `Math.random()` jitter, and trash talk is picked from six
hard-coded persona line lists. There is no model API call, so there is no API
key to provision, no per-turn latency budget and no inference cost. `pokersolver`
itself is dependency-free and runs unmodified on workerd.

## Known limitations to watch

- **Durable Objects are never deleted.** Every room code that has ever been used
  keeps its SQLite storage forever (~15–20 KB each). At 30 tables/day that is
  ~18 MB/month of growth against 5 GB included — years of headroom, but it only
  goes up. A cleanup alarm that calls `deleteAll()` on an empty table would fix
  it; it was left out of this change deliberately to keep the port faithful.
- **The lobby is a single object.** Quickplay matchmaking is one decision point
  by nature, so `LOBBY` is a single instance. It handles one request per
  quickplay click, which is nowhere near a bottleneck at this scale, but it is
  the one part of the design that does not shard.
