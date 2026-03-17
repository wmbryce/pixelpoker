# Training Mode — Design Spec

## Overview

A structured lesson system where users play through scripted poker scenarios to learn advanced concepts. Each lesson introduces a concept, deals 5 hands from a deep pool of pre-authored scenarios, and provides a detailed debrief after each hand with a scorecard and expandable analysis.

## Goals

- Teach advanced poker concepts: position-based opening ranges, pot odds, bet sizing, board texture, bluffing
- Lessons feel like real poker — not flashcards or quizzes
- Deep scenario pools (20-30 per lesson) so replays feel fresh
- Debrief combines a per-street scorecard with detailed math breakdowns (equity, pot odds, optimal play)

## Non-Goals

- Beginner fundamentals (hand rankings, blinds structure)
- Real-time coaching during multiplayer play
- Post-hand review for multiplayer hands
- Cross-device progress sync (future — will require a database)

---

## Architecture

### Approach: Dedicated Server-Side Training Controller

A new `server/controllers/training.ts` that is fully separate from the multiplayer game loop. It imports shared utilities (hand evaluation, AI decisions, pokersolver) but manages its own state machine optimized for lessons.

```
Client                              Server
──────                              ──────
/training route                 ←→  training.ts (new controller)
  ├─ TrainingView (lesson select)    ├─ lesson state machine
  ├─ LessonIntro                     ├─ imports: ai.ts (makeAIDecision,
  ├─ TrainingTable + HUD             │    preFlopStrength, postFlopStrength)
  ├─ Debrief                         ├─ imports: pokersolver (Hand.solve)
  └─ LessonComplete                  ├─ scenario data (JSON per lesson)
                                     └─ scoring engine
```

### Prerequisite Refactoring (Minimal Changes to Existing Code)

Before building the training system, a few small changes to existing code are needed:

1. **Export `preFlopStrength()` and `postFlopStrength()`** from `server/controllers/ai.ts` — currently private functions, training needs them for debrief metrics.
2. **Refactor `makeAIDecision()` to accept persona as a parameter** — currently reads from a module-level `personaMap` singleton. Training needs to pass persona data without polluting the multiplayer persona map. Alternatively, the training controller can maintain its own persona map instance.
3. **Refactor `ActionControls.tsx` to accept an `onAction` callback prop** — currently hardcoded to `socket.emit('gameAction', ...)`. Training needs to route actions through training-specific socket events. The multiplayer flow passes `onAction` that calls the existing socket emit, keeping behavior unchanged.

All other existing code remains untouched. The training controller is purely additive beyond these three changes.

---

## Lesson Flow & State Machine

```
LESSON_INTRO
  Show concept name, explanation, key takeaway
  User clicks "Deal Me In"
      │
      ▼
SCENARIO_DEAL
  Pick random scenario from lesson pool (prefer unseen)
  Set up scripted deck, assign positions, deal cards
      │
      ▼
STREET_ACTION (loops: preflop → flop → turn → river)
  AI opponents act using existing makeAIDecision() logic
  User makes their decision (fold/call/raise)
  Record user's decision + optimal play for scoring
      │
      ▼
HAND_COMPLETE
  Showdown if applicable, determine winner
      │
      ▼
DEBRIEF
  Scorecard: rate each street decision (correct/incorrect)
  Expandable analysis per street:
    - Pot odds calculation
    - Equity vs opponent range
    - Optimal play + reasoning
      │
      ▼
More scenarios? → yes: SCENARIO_DEAL
                → no:  LESSON_COMPLETE (final score, save progress)
```

### Key Rules

- **5 hands per lesson session**, randomly selected from pool of 20-30
- **No interruptions mid-hand** — concept intro before, debrief after
- **Optimal play pre-authored per scenario** (not computed at runtime) so the lesson designer controls the teaching narrative
- **Community cards fully scripted** (all 5) so debrief can show "what would have happened" even if user folds early
- **Opponent cards scripted, opponent actions dynamic** — AI personas use existing `makeAIDecision()` logic with their scripted hole cards

---

## Data Model

### Lesson Definition

JSON files in `server/data/lessons/`.

```typescript
interface Lesson {
  id: string;                    // "position-ranges"
  number: number;                // 1
  title: string;                 // "Position & Opening Ranges"
  description: string;           // Short subtitle
  conceptIntro: string;          // Paragraph shown on intro screen
  keyTakeaway: string;           // One-liner highlighted in gold
  prerequisite: string | null;   // Lesson ID required before unlock
  scenarios: Scenario[];         // 20-30 per lesson
}

interface Scenario {
  id: string;                    // "pr-01"
  playerCards: [string, string]; // ["Qh", "Jh"]
  communityCards: string[];      // ["Kh", "9s", "4d", "2c", "8h"] — all 5
  playerPosition: Position;     // "BTN" | "CO" | "HJ" | "SB" | "BB"
  playerStack: number;          // Starting stack for the player
  smallBlind: number;           // Blind levels for this scenario
  bigBlind: number;
  opponents: ScenarioOpponent[];
  optimalActions: {
    preflop: OptimalAction;
    flop: OptimalAction;
    turn: OptimalAction;
    river: OptimalAction;
  };
}

interface OptimalAction {
  action: "fold" | "check" | "call" | "raise";
  raiseAmount?: number;         // Required if action is "raise"
  reasoning: string;            // Shown in debrief
  metrics: {
    equity: number;             // 0-1
    potOdds: number;            // 0-1 (0 when checking)
    handStrength: number;       // 0-1
  };
}

interface ScenarioOpponent {
  persona: string;              // "ALICE" | "VINNY" etc.
  cards: [string, string];
  stack: number;
  position: Position;           // Where this opponent sits
}

type Position = "BTN" | "CO" | "HJ" | "SB" | "BB";
```

### Progress (localStorage)

```typescript
interface TrainingProgress {
  lessonId: string;
  completedAt: string | null;   // ISO date
  bestScore: number;            // 0-100
  attempts: number;
  scenariosSeen: string[];      // Scenario IDs already played
}
```

Stored as an array in localStorage under key `pixelpoker_training_progress`. Shaped to migrate cleanly to a database table later.

---

## Socket Events

Prefixed with `training:` to stay separate from multiplayer events.

### Client → Server

```typescript
interface TrainingClientEvents {
  'training:start': (data: { lessonId: string }) => void;
  'training:action': (data: { type: 'fold' | 'check' | 'call' | 'raise'; bet?: number }) => void;
  'training:nextHand': () => void;
  'training:exit': () => void;
}
```

### Server → Client

```typescript
interface TrainingServerEvents {
  'training:lessonIntro': (data: {
    lesson: Lesson;              // Without scenarios (don't leak answers)
    handNumber: number;
    totalHands: number;
  }) => void;
  'training:gameState': (data: {
    stage: number;               // 0-3 (preflop through river)
    playerCards: CardType[];
    communityCards: CardType[];
    pot: number;
    currentBet: number;
    opponents: OpponentState[];
    playerStack: number;
    playerPosition: Position;
  }) => void;
  'training:debrief': (data: {
    streets: StreetResult[];
    scenarioComplete: boolean;
    overallScore: number;
  }) => void;
  'training:lessonComplete': (data: {
    finalScore: number;
    breakdown: StreetResult[];
  }) => void;
}
```

### Supporting Types

```typescript
interface OpponentState {
  persona: string;
  position: Position;
  stack: number;
  lastAction: string | null;    // "FOLD" | "CHECK" | "CALL" | "RAISE $X" | "ALL IN"
  isActive: boolean;
  isAllIn: boolean;
}

interface StreetResult {
  street: 'preflop' | 'flop' | 'turn' | 'river';
  userAction: OptimalAction['action'] | null;  // null if street not reached
  optimalAction: OptimalAction;
  correct: boolean;
}

// Alias used by TrainingStore
type DebriefData = {
  streets: StreetResult[];
  overallScore: number;
};

type LessonResult = {
  lessonId: string;
  score: number;
  scenarioIds: string[];
};
```

### Card Format Conversion

Scenario JSON uses pokersolver shorthand strings (e.g., `"Qh"`, `"Kh"`). The training controller converts these to `CardType` objects before emitting to the client:

```typescript
// "Qh" → { suite: "h", value: "Qh", label: "Q♥" }
function toCardType(card: string): CardType
```

This conversion function lives in the training controller. The existing `CardType` interface (`{ suite, value, label }`) is reused as-is.

---

## Training Controller

`server/controllers/training.ts`

### Responsibilities

- Load lesson JSON files at startup
- On `training:start` — pick 5 random unseen scenarios, initialize state
- **Construct and maintain a `Poker`-shaped state object** for each scenario — `makeAIDecision()` expects a full `Poker` game state (`players`, `currentBet`, `pot`, `tableCards`, `bigBlind`, etc.). The training controller builds this from scenario data and updates it as the hand progresses.
- On `training:action` — record user's decision, compare to optimal, advance street, trigger AI decisions via `makeAIDecision()`
- On hand complete — compute debrief data and emit `training:debrief`
- Never expose scenario answers or opponent cards until debrief

### Imports from Existing Code

- `makeAIDecision()` from `ai.ts` — opponent behavior
- `preFlopStrength()` / `postFlopStrength()` from `ai.ts` — for metrics
- `Hand.solve()` from pokersolver — showdown evaluation

---

## Client Components

### New Route

`/training` — lesson select
`/training/:lessonId` — active lesson

### Component Tree

```
client/src/Components/training/
├── TrainingView.tsx         // Route handler, lesson select screen
├── LessonIntro.tsx          // Concept intro + "Deal Me In"
├── TrainingTable.tsx         // Wraps existing Card + ActionControls + HUD
├── TrainingHud.tsx          // Lesson name, hand count, score dots
├── Debrief.tsx              // Scorecard with expandable street analysis
├── StreetScore.tsx          // Single street result (correct/wrong + details)
└── LessonComplete.tsx       // Final score summary after 5 hands
```

### State Management

New Zustand store `client/src/store/trainingStore.ts`:

```typescript
interface TrainingStore {
  currentLesson: Lesson | null;
  handNumber: number;
  gameState: TrainingGameState | null;
  debrief: DebriefData | null;
  progress: TrainingProgress[];
  phase: 'select' | 'intro' | 'playing' | 'debrief' | 'complete';

  loadProgress: () => void;         // Read from localStorage
  saveProgress: (result: LessonResult) => void;
}
```

### Component Reuse

**Reused (with minor refactoring):**
- `Card.tsx` — renders cards in TrainingTable, no changes needed
- `ActionControls.tsx` — refactored to accept `onAction` callback prop (see prerequisite refactoring). Multiplayer passes a callback that calls `socket.emit`; training passes a callback that calls `training:action`.

**NOT reused (training has simpler versions):**
- `GameContainer.tsx` — too coupled to multiplayer socket events
- `Player.tsx` — training opponents are simpler (no timer, no seat labels)
- `gameStore.ts` — training has its own state machine

---

## UI Screens

### 1. Lesson Select (`/training`)

- Vice-themed panel matching the welcome screen style
- List of lesson cards showing: number, title, description, best score
- Completed lessons show cyan border + score badge
- Locked lessons show pink lock badge + prerequisite name
- "Back to Lobby" link at bottom

### 2. Lesson Intro

- Lesson number, title in pink
- Concept explanation paragraph
- Key takeaway box with gold border
- "Deal Me In" gold button
- "5 hands · ~5 min" meta text

### 3. Training Table

- HUD bar at top: lesson name, hand count, score dots (cyan = correct, pink = wrong)
- Existing oval felt table with community cards and pot
- Simplified opponent display (avatar, name, stack, last action)
- Player's hand + action buttons at bottom
- No chat, no timer bar, no seat position labels

### 4. Debrief

- "Hand N Complete" header
- Per-street scorecard:
  - Cyan border + checkmark for correct decisions
  - Pink border + X for mistakes
  - Expandable detail section per street with:
    - Optimal play + reasoning
    - Math box: equity, pot odds, hand strength
  - Grayed out for streets not reached (user folded early)
- "Next Hand" gold button + "Exit Lesson" surface button

### 5. Lesson Complete

- Final score (percentage)
- Per-hand breakdown
- "Replay Lesson" + "Back to Training" buttons
- Progress saved to localStorage

---

## Lesson Curriculum (Initial)

1. **Position & Opening Ranges** — Is this hand in your range given your seat?
2. **Pot Odds & Calling Decisions** — When the math says call vs fold
3. **Bet Sizing Strategy** — How much to bet and why
4. **Reading Board Texture** — Wet, dry, and dangerous boards
5. **Bluffing & Bluff Catching** — When to fire and when to call them down (locked until lesson 4 complete)

Each lesson starts with 20-30 hand-crafted scenarios. More can be added over time without code changes — just add JSON files.

---

## Storage

- **Scenario data**: JSON files on disk in `server/data/lessons/`. ~500KB total for 50 lessons. No database needed.
- **User progress**: localStorage under `pixelpoker_training_progress`. Shaped as an array of `TrainingProgress` objects ready to migrate to a DB table.
- **Future**: Database migration for cross-device progress sync. The data model is designed for this — `TrainingProgress` maps directly to a table with `lessonId` as key.
