# Training Mode Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a structured lesson system where users play scripted poker scenarios to learn advanced concepts, with per-street scoring and detailed debriefs.

**Architecture:** Dedicated server-side training controller (`server/controllers/training.ts`) separate from multiplayer, importing shared utilities (hand eval, AI decisions, pokersolver). New client route `/training` with its own Zustand store and component tree. Lesson scenarios stored as JSON files in `server/data/lessons/`.

**Tech Stack:** React 19, Zustand, Socket.IO, Bun, Express, pokersolver, Tailwind CSS

**Spec:** `docs/superpowers/specs/2026-03-17-training-mode-design.md`

---

## File Map

### New Files

| File | Responsibility |
|------|---------------|
| `shared/src/trainingTypes.ts` | Training-specific type definitions (Lesson, Scenario, OptimalAction, socket events) |
| `server/data/lessons/position-ranges.json` | Lesson 1 scenario data |
| `server/data/lessons/pot-odds.json` | Lesson 2 scenario data |
| `server/controllers/training.ts` | Training state machine, scenario management, scoring |
| `server/controllers/trainingSocketHandlers.ts` | Socket.IO event handlers for training namespace |
| `server/__tests__/training.test.ts` | Training controller tests |
| `client/src/store/trainingStore.ts` | Zustand store for training state + localStorage progress |
| `client/src/Components/training/TrainingView.tsx` | Route handler + lesson select screen |
| `client/src/Components/training/LessonIntro.tsx` | Concept intro screen |
| `client/src/Components/training/TrainingTable.tsx` | Table wrapper with HUD bar |
| `client/src/Components/training/TrainingHud.tsx` | Lesson name, hand count, score dots |
| `client/src/Components/training/Debrief.tsx` | Post-hand scorecard with expandable analysis |
| `client/src/Components/training/StreetScore.tsx` | Single street result row |
| `client/src/Components/training/LessonComplete.tsx` | Final score summary |
| `client/src/Components/training/TrainingActionControls.tsx` | Training-specific action buttons (emits training:action) |

### Modified Files

| File | Change |
|------|--------|
| `server/controllers/ai.ts` | Export `preFlopStrength()`, `postFlopStrength()`. Refactor `makeAIDecision()` to accept optional persona parameter. |
| `server/app.ts` | Register training socket handlers, widen Socket.IO type to include training events |
| `shared/package.json` | Add `"./src/trainingTypes"` to exports field |
| `shared/src/types.ts` | Union training events into `ClientToServerEvents` and `ServerToClientEvents` |
| `client/src/App.tsx` | Add `/training` route |
| `client/src/Components/welcome/HomeScreen.tsx` | Add "Training" button |
| `client/src/Components/WelcomeView.tsx` | Thread `onTraining` prop through to HomeScreen |

---

## Chunk 1: Prerequisite Refactoring & Shared Types

### Task 1: Export hand strength functions from ai.ts

**Files:**
- Modify: `server/controllers/ai.ts:210-266`

- [ ] **Step 1: Add export to preFlopStrength**

In `server/controllers/ai.ts`, change line 210 from:
```typescript
function preFlopStrength(cards: CardType[]): number {
```
to:
```typescript
export function preFlopStrength(cards: CardType[]): number {
```

- [ ] **Step 2: Add export to postFlopStrength**

In `server/controllers/ai.ts`, change line 238 from:
```typescript
function postFlopStrength(holeCards: CardType[], tableCards: CardType[]): number {
```
to:
```typescript
export function postFlopStrength(holeCards: CardType[], tableCards: CardType[]): number {
```

- [ ] **Step 3: Run existing tests to verify no breakage**

Run: `cd server && bun test`
Expected: All existing tests pass

- [ ] **Step 4: Commit**

```bash
git add server/controllers/ai.ts
git commit -m "refactor: export preFlopStrength and postFlopStrength from ai.ts"
```

---

### Task 2: Refactor makeAIDecision to accept optional persona

**Files:**
- Modify: `server/controllers/ai.ts:282-393`
- Test: `server/__tests__/training.test.ts`

- [ ] **Step 1: Write test for makeAIDecision with explicit persona**

Create `server/__tests__/training.test.ts`:
```typescript
import { describe, test, expect } from 'bun:test';
import { makeAIDecision } from '../controllers/ai';
import { initializeGame, createAIPlayer } from '../controllers/gameplay';
import { generateDeck } from '../controllers/deck';
import type { AIPersona } from '../controllers/ai';

describe('makeAIDecision with explicit persona', () => {
  test('accepts persona parameter instead of using personaMap', () => {
    const game = initializeGame(5, 10);
    game.deck = generateDeck();

    const aiPlayer = createAIPlayer(0, 'TestBot');
    game.players = [
      { ...createAIPlayer(1, 'Human'), isAI: false },
      aiPlayer,
    ];

    // Deal cards manually
    game.players[0].cards = game.deck.splice(0, 2);
    game.players[1].cards = game.deck.splice(0, 2);
    game.stage = 1; // preflop
    game.actionOn = 1;
    game.currentBet = 10;
    game.players[0].lastBet = 10;
    game.players[1].lastBet = 0;
    game.pot = 15;

    const testPersona: AIPersona = {
      name: 'TEST',
      tightness: 0.5,
      aggression: 0.5,
      bluffFreq: 0.0,
      skillJitter: 0.0,
      allInThreshold: 0.9,
      chatFrequency: 0,
      chat: { onFold: [], onCall: [], onRaise: [], onAllIn: [], onWin: [], onLose: [], onBluff: [], onBigPot: [], taunt: [] },
    };

    const result = makeAIDecision(game, 1, testPersona);
    expect(result).toHaveProperty('action');
    expect(result).toHaveProperty('chatTrigger');
    expect(result.action.type).toMatch(/^(fold|call|raise)$/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd server && bun test __tests__/training.test.ts`
Expected: FAIL — makeAIDecision doesn't accept 3rd parameter

- [ ] **Step 3: Add optional persona parameter to makeAIDecision**

In `server/controllers/ai.ts`, change the function signature at line 282 from:
```typescript
export const makeAIDecision = (game: Poker, playerIndex: number): AIDecisionResult => {
```
to:
```typescript
export const makeAIDecision = (game: Poker, playerIndex: number, overridePersona?: AIPersona): AIDecisionResult => {
```

Then change line 284 where persona is retrieved from:
```typescript
  const persona = personaMap.get(player.id);
```
to:
```typescript
  const persona = overridePersona ?? personaMap.get(player.id);
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd server && bun test __tests__/training.test.ts`
Expected: PASS

- [ ] **Step 5: Run all tests to verify no breakage**

Run: `cd server && bun test`
Expected: All tests pass (existing callers pass no 3rd arg, so behavior unchanged)

- [ ] **Step 6: Commit**

```bash
git add server/controllers/ai.ts server/__tests__/training.test.ts
git commit -m "refactor: add optional persona parameter to makeAIDecision"
```

---

### Task 3: Define training types in shared package

**Files:**
- Create: `shared/src/trainingTypes.ts`

- [ ] **Step 1: Create training types file**

Create `shared/src/trainingTypes.ts`:
```typescript
import type { CardType } from './types';

// ── Lesson & Scenario ──

export type Position = 'BTN' | 'CO' | 'HJ' | 'SB' | 'BB';

export interface OptimalAction {
  action: 'fold' | 'check' | 'call' | 'raise';
  raiseAmount?: number;
  reasoning: string;
  metrics: {
    equity: number;
    potOdds: number;
    handStrength: number;
  };
}

export interface ScenarioOpponent {
  persona: string;
  cards: [string, string];
  stack: number;
  position: Position;
}

export interface Scenario {
  id: string;
  playerCards: [string, string];
  communityCards: string[];
  playerPosition: Position;
  playerStack: number;
  smallBlind: number;
  bigBlind: number;
  opponents: ScenarioOpponent[];
  optimalActions: {
    preflop: OptimalAction;
    flop: OptimalAction;
    turn: OptimalAction;
    river: OptimalAction;
  };
}

export interface Lesson {
  id: string;
  number: number;
  title: string;
  description: string;
  conceptIntro: string;
  keyTakeaway: string;
  prerequisite: string | null;
  scenarios: Scenario[];
}

/** Lesson metadata sent to client (without scenario answers) */
export interface LessonMeta {
  id: string;
  number: number;
  title: string;
  description: string;
  conceptIntro: string;
  keyTakeaway: string;
  prerequisite: string | null;
}

// ── Socket Event Payloads ──

export interface OpponentState {
  persona: string;
  position: Position;
  stack: number;
  lastAction: string | null;
  isActive: boolean;
  isAllIn: boolean;
}

export interface TrainingGameState {
  stage: number;
  playerCards: CardType[];
  communityCards: CardType[];
  pot: number;
  currentBet: number;
  opponents: OpponentState[];
  playerStack: number;
  playerPosition: Position;
  playerLastBet: number;
  smallBlind: number;
  bigBlind: number;
  lastRaiseSize: number;
}

export interface StreetResult {
  street: 'preflop' | 'flop' | 'turn' | 'river';
  userAction: OptimalAction['action'] | null;
  optimalAction: OptimalAction;
  correct: boolean;
}

export interface DebriefData {
  streets: StreetResult[];
  overallScore: number;
}

export interface LessonCompleteData {
  finalScore: number;
  handResults: DebriefData[];
  scenarioIds: string[];
}

// ── Socket Event Interfaces ──

export interface TrainingClientEvents {
  'training:start': (data: { lessonId: string; scenariosSeen?: string[] }) => void;
  'training:action': (data: { type: 'fold' | 'check' | 'call' | 'raise'; bet?: number }) => void;
  'training:nextHand': () => void;
  'training:exit': () => void;
}

export interface TrainingServerEvents {
  'training:lessonIntro': (data: {
    lesson: LessonMeta;
    handNumber: number;
    totalHands: number;
  }) => void;
  'training:gameState': (data: TrainingGameState) => void;
  'training:debrief': (data: DebriefData & { scenarioComplete: boolean }) => void;
  'training:lessonComplete': (data: LessonCompleteData) => void;
  'training:error': (data: { message: string }) => void;
}

// ── Client Progress (localStorage) ──

export interface TrainingProgress {
  lessonId: string;
  completedAt: string | null;
  bestScore: number;
  attempts: number;
  scenariosSeen: string[];
}
```

- [ ] **Step 2: Add trainingTypes to shared package exports**

In `shared/package.json`, update the `exports` field from:
```json
"exports": {
  ".": "./src/types.ts"
}
```
to:
```json
"exports": {
  ".": "./src/types.ts",
  "./src/trainingTypes": "./src/trainingTypes.ts"
}
```

- [ ] **Step 3: Union training events into shared socket types**

In `shared/src/types.ts`, add at the top:
```typescript
import type { TrainingClientEvents, TrainingServerEvents } from './trainingTypes';
```

Then update the event interfaces to union training events. Change `ClientToServerEvents` to extend `TrainingClientEvents` and `ServerToClientEvents` to extend `TrainingServerEvents`:
```typescript
export interface ClientToServerEvents extends TrainingClientEvents {
  // ... existing events unchanged
}

export interface ServerToClientEvents extends TrainingServerEvents {
  // ... existing events unchanged
}
```

This eliminates the need for `as any` casts on the client socket.

- [ ] **Step 4: Verify types compile**

Run: `cd server && bun test --bail 1`
Expected: No import errors (tests may fail for other reasons)

- [ ] **Step 3: Commit**

```bash
git add shared/src/trainingTypes.ts
git commit -m "feat: add training mode type definitions"
```

---

## Chunk 2: Server — Training Controller & Socket Handlers

### Task 4: Create lesson data files

**Files:**
- Create: `server/data/lessons/position-ranges.json`
- Create: `server/data/lessons/pot-odds.json`

- [ ] **Step 1: Create lesson 1 — Position & Opening Ranges**

Create `server/data/lessons/position-ranges.json` with the lesson definition and 5 initial scenarios (enough to be playable — more added later). Each scenario has scripted cards designed to teach position-based decisions:

```json
{
  "id": "position-ranges",
  "number": 1,
  "title": "Position & Opening Ranges",
  "description": "Know when to play and when to fold based on where you sit",
  "conceptIntro": "Your position at the table is one of the most important factors in deciding which hands to play. The later you act, the more information you have about what other players are doing — and the wider range of hands you can profitably play. Early position demands strong hands. Late position lets you open up.",
  "keyTakeaway": "Play tighter in early position, wider in late position",
  "prerequisite": null,
  "scenarios": [
    {
      "id": "pr-01",
      "playerCards": ["As", "Kd"],
      "communityCards": ["Qh", "7c", "2s", "Jd", "4h"],
      "playerPosition": "BTN",
      "playerStack": 1000,
      "smallBlind": 5,
      "bigBlind": 10,
      "opponents": [
        { "persona": "ALICE", "cards": ["Tc", "9c"], "stack": 1000, "position": "SB" },
        { "persona": "VINNY", "cards": ["8h", "6h"], "stack": 1000, "position": "BB" }
      ],
      "optimalActions": {
        "preflop": {
          "action": "raise",
          "raiseAmount": 30,
          "reasoning": "AKo on the button is a premium hand. With position and a strong holding, a 3x raise is standard to build the pot and narrow the field.",
          "metrics": { "equity": 0.65, "potOdds": 0, "handStrength": 0.85 }
        },
        "flop": {
          "action": "raise",
          "raiseAmount": 40,
          "reasoning": "You flopped a gutshot straight draw (need a T or J) plus two overcards. With top pair potential and position, a continuation bet of about 2/3 pot is strong.",
          "metrics": { "equity": 0.52, "potOdds": 0, "handStrength": 0.45 }
        },
        "turn": {
          "action": "raise",
          "raiseAmount": 60,
          "reasoning": "The J on the turn gives you top pair top kicker (TPTK). This is a strong value bet — charge draws and worse pairs.",
          "metrics": { "equity": 0.78, "potOdds": 0, "handStrength": 0.75 }
        },
        "river": {
          "action": "raise",
          "raiseAmount": 80,
          "reasoning": "You still have TPTK on a relatively dry board. A value bet targets worse pairs and Qx hands.",
          "metrics": { "equity": 0.72, "potOdds": 0, "handStrength": 0.70 }
        }
      }
    },
    {
      "id": "pr-02",
      "playerCards": ["7d", "2c"],
      "communityCards": ["Ah", "Kc", "9s", "3d", "Jh"],
      "playerPosition": "HJ",
      "playerStack": 1000,
      "smallBlind": 5,
      "bigBlind": 10,
      "opponents": [
        { "persona": "NIKO", "cards": ["As", "Qd"], "stack": 1000, "position": "CO" },
        { "persona": "SUKI", "cards": ["Kh", "Jc"], "stack": 1000, "position": "BTN" }
      ],
      "optimalActions": {
        "preflop": {
          "action": "fold",
          "reasoning": "72o is the worst hand in poker. In the hijack with players still to act behind you, this is a clear fold regardless of any other factor.",
          "metrics": { "equity": 0.32, "potOdds": 0, "handStrength": 0.05 }
        },
        "flop": {
          "action": "fold",
          "reasoning": "If you somehow got here, you've completely missed this board. Fold.",
          "metrics": { "equity": 0.04, "potOdds": 0, "handStrength": 0.02 }
        },
        "turn": {
          "action": "fold",
          "reasoning": "Still nothing. Fold.",
          "metrics": { "equity": 0.04, "potOdds": 0, "handStrength": 0.02 }
        },
        "river": {
          "action": "fold",
          "reasoning": "No improvement. Fold.",
          "metrics": { "equity": 0.04, "potOdds": 0, "handStrength": 0.02 }
        }
      }
    },
    {
      "id": "pr-03",
      "playerCards": ["Jh", "Th"],
      "communityCards": ["9h", "5c", "2d", "8h", "Ks"],
      "playerPosition": "CO",
      "playerStack": 1000,
      "smallBlind": 5,
      "bigBlind": 10,
      "opponents": [
        { "persona": "BUBBA", "cards": ["Ad", "5d"], "stack": 1000, "position": "BTN" },
        { "persona": "ALICE", "cards": ["Qc", "Tc"], "stack": 1000, "position": "BB" }
      ],
      "optimalActions": {
        "preflop": {
          "action": "raise",
          "raiseAmount": 25,
          "reasoning": "JTs is a strong suited connector. In the cutoff, this is in your opening range — raise to build the pot with a hand that plays well post-flop.",
          "metrics": { "equity": 0.50, "potOdds": 0, "handStrength": 0.55 }
        },
        "flop": {
          "action": "raise",
          "raiseAmount": 30,
          "reasoning": "You flopped an open-ended straight draw plus a flush draw — a monster drawing hand with ~54% equity. Bet for value and to build the pot.",
          "metrics": { "equity": 0.54, "potOdds": 0, "handStrength": 0.48 }
        },
        "turn": {
          "action": "raise",
          "raiseAmount": 60,
          "reasoning": "The 8h completes your flush! You have the second-nut flush (J-high). Value bet strongly.",
          "metrics": { "equity": 0.92, "potOdds": 0, "handStrength": 0.90 }
        },
        "river": {
          "action": "raise",
          "raiseAmount": 80,
          "reasoning": "Your flush holds. The K on the river might have improved someone with Kx, but your flush beats any single pair. Value bet.",
          "metrics": { "equity": 0.88, "potOdds": 0, "handStrength": 0.85 }
        }
      }
    },
    {
      "id": "pr-04",
      "playerCards": ["Qs", "9s"],
      "communityCards": ["Kh", "Td", "3c", "7s", "2h"],
      "playerPosition": "SB",
      "playerStack": 1000,
      "smallBlind": 5,
      "bigBlind": 10,
      "opponents": [
        { "persona": "VINNY", "cards": ["Kc", "8d"], "stack": 1000, "position": "HJ" },
        { "persona": "CHAD", "cards": ["Ad", "Jh"], "stack": 1000, "position": "BTN" }
      ],
      "optimalActions": {
        "preflop": {
          "action": "call",
          "reasoning": "Q9s in the small blind is a marginal hand. Against a raise from the hijack, this is a borderline call — suited helps, but out of position is a disadvantage. Calling is acceptable; folding is also reasonable.",
          "metrics": { "equity": 0.42, "potOdds": 0.33, "handStrength": 0.38 }
        },
        "flop": {
          "action": "check",
          "reasoning": "You have a gutshot straight draw (need a J) but no pair. Out of position with a marginal draw, checking is correct. Let the aggressor bet if they want.",
          "metrics": { "equity": 0.22, "potOdds": 0, "handStrength": 0.15 }
        },
        "turn": {
          "action": "fold",
          "reasoning": "The 7s doesn't help you. With only a gutshot (4 outs, ~8% on the river) and likely facing a bet, the pot odds won't justify a call.",
          "metrics": { "equity": 0.08, "potOdds": 0.25, "handStrength": 0.08 }
        },
        "river": {
          "action": "fold",
          "reasoning": "No improvement. Fold.",
          "metrics": { "equity": 0.05, "potOdds": 0, "handStrength": 0.05 }
        }
      }
    },
    {
      "id": "pr-05",
      "playerCards": ["Ah", "Ac"],
      "communityCards": ["7d", "4s", "2h", "Tc", "6c"],
      "playerPosition": "HJ",
      "playerStack": 1000,
      "smallBlind": 5,
      "bigBlind": 10,
      "opponents": [
        { "persona": "SUKI", "cards": ["Kh", "Qh"], "stack": 1000, "position": "CO" },
        { "persona": "NIKO", "cards": ["9d", "8d"], "stack": 1000, "position": "BB" }
      ],
      "optimalActions": {
        "preflop": {
          "action": "raise",
          "raiseAmount": 30,
          "reasoning": "Pocket aces is the best starting hand. Always raise — from any position. A 3x open is standard.",
          "metrics": { "equity": 0.85, "potOdds": 0, "handStrength": 0.95 }
        },
        "flop": {
          "action": "raise",
          "raiseAmount": 35,
          "reasoning": "You have an overpair on a dry, disconnected board. This is an ideal c-bet spot — charge draws and worse pairs.",
          "metrics": { "equity": 0.88, "potOdds": 0, "handStrength": 0.85 }
        },
        "turn": {
          "action": "raise",
          "raiseAmount": 60,
          "reasoning": "Still the overpair on a board with no flush draws. The Tc could have given someone a pair, but AA is still well ahead. Continue betting for value.",
          "metrics": { "equity": 0.82, "potOdds": 0, "handStrength": 0.80 }
        },
        "river": {
          "action": "raise",
          "raiseAmount": 80,
          "reasoning": "The 6c completes a possible straight (53 or 87) but these are unlikely holdings given the preflop action. Your aces are still strong — value bet.",
          "metrics": { "equity": 0.75, "potOdds": 0, "handStrength": 0.75 }
        }
      }
    }
  ]
}
```

- [ ] **Step 2: Create lesson 2 — Pot Odds & Calling Decisions**

Create `server/data/lessons/pot-odds.json` with the lesson definition and 5 initial scenarios focused on pot odds math:

```json
{
  "id": "pot-odds",
  "number": 2,
  "title": "Pot Odds & Calling Decisions",
  "description": "When the math says call — and when it says fold",
  "conceptIntro": "Pot odds compare the size of the pot to the cost of your call. If the pot is $100 and you need to call $20, you're getting 5:1 odds — meaning you only need to win 1 in 6 times (about 17%) to break even. When your equity (chance of winning) is higher than the price you're paying, calling is profitable in the long run.",
  "keyTakeaway": "Compare your chance of winning to the price you're paying",
  "prerequisite": "position-ranges",
  "scenarios": [
    {
      "id": "po-01",
      "playerCards": ["Qh", "Jh"],
      "communityCards": ["Kh", "9s", "4d", "2c", "8h"],
      "playerPosition": "BTN",
      "playerStack": 1000,
      "smallBlind": 5,
      "bigBlind": 10,
      "opponents": [
        { "persona": "ALICE", "cards": ["Kc", "Td"], "stack": 1000, "position": "SB" },
        { "persona": "VINNY", "cards": ["As", "9d"], "stack": 1000, "position": "BB" }
      ],
      "optimalActions": {
        "preflop": {
          "action": "call",
          "reasoning": "QJh on the button is a solid suited broadway hand. Standard call or raise here.",
          "metrics": { "equity": 0.50, "potOdds": 0.33, "handStrength": 0.55 }
        },
        "flop": {
          "action": "call",
          "reasoning": "You have a flush draw (9 outs) plus a gutshot straight draw (3 additional outs for a T). That's ~12 outs twice, giving you roughly 45% equity by the river. The pot is offering you much better than the ~20% you need — clear call.",
          "metrics": { "equity": 0.45, "potOdds": 0.20, "handStrength": 0.35 }
        },
        "turn": {
          "action": "call",
          "reasoning": "The 2c doesn't help, but you still have your flush draw — 9 outs with one card to come is ~18% equity. If the pot is offering better than 18%, call. With the pot built up on the flop, you're likely getting the right price.",
          "metrics": { "equity": 0.18, "potOdds": 0.15, "handStrength": 0.20 }
        },
        "river": {
          "action": "raise",
          "raiseAmount": 80,
          "reasoning": "The 8h completes your flush! You have the queen-high flush. Time to value bet — charge anyone with a pair or worse flush.",
          "metrics": { "equity": 0.92, "potOdds": 0, "handStrength": 0.88 }
        }
      }
    },
    {
      "id": "po-02",
      "playerCards": ["8c", "7c"],
      "communityCards": ["Ac", "5c", "Ks", "Td", "3h"],
      "playerPosition": "CO",
      "playerStack": 1000,
      "smallBlind": 5,
      "bigBlind": 10,
      "opponents": [
        { "persona": "NIKO", "cards": ["Ad", "Qh"], "stack": 1000, "position": "BTN" },
        { "persona": "BUBBA", "cards": ["Kd", "Jd"], "stack": 1000, "position": "BB" }
      ],
      "optimalActions": {
        "preflop": {
          "action": "raise",
          "raiseAmount": 25,
          "reasoning": "87s in the cutoff is a playable suited connector. Open raise to build the pot with a hand that has good implied odds.",
          "metrics": { "equity": 0.45, "potOdds": 0, "handStrength": 0.40 }
        },
        "flop": {
          "action": "call",
          "reasoning": "You flopped a flush draw with 8c7c (9 outs). The ace-high board likely hit your opponents, but you have ~35% equity to the river. Getting at least 2:1 on a call makes this profitable.",
          "metrics": { "equity": 0.35, "potOdds": 0.25, "handStrength": 0.30 }
        },
        "turn": {
          "action": "fold",
          "reasoning": "The Td doesn't help your flush draw. With only one card to come, your 9 outs give you ~18% equity. If facing a large bet (more than 1/4 pot), the pot odds no longer justify the call. This is where discipline pays off.",
          "metrics": { "equity": 0.18, "potOdds": 0.30, "handStrength": 0.15 }
        },
        "river": {
          "action": "fold",
          "reasoning": "Missed the flush. Fold.",
          "metrics": { "equity": 0.05, "potOdds": 0, "handStrength": 0.05 }
        }
      }
    },
    {
      "id": "po-03",
      "playerCards": ["Td", "9d"],
      "communityCards": ["Jd", "8c", "3s", "2d", "Qh"],
      "playerPosition": "BTN",
      "playerStack": 1000,
      "smallBlind": 5,
      "bigBlind": 10,
      "opponents": [
        { "persona": "SUKI", "cards": ["Jc", "Ts"], "stack": 1000, "position": "SB" },
        { "persona": "ALICE", "cards": ["As", "8s"], "stack": 1000, "position": "BB" }
      ],
      "optimalActions": {
        "preflop": {
          "action": "raise",
          "raiseAmount": 25,
          "reasoning": "T9s on the button is a strong suited connector in late position. Raise to build the pot.",
          "metrics": { "equity": 0.48, "potOdds": 0, "handStrength": 0.50 }
        },
        "flop": {
          "action": "call",
          "reasoning": "You flopped an open-ended straight draw (any Q or 7 makes your straight = 8 outs) plus a backdoor flush draw. With ~32% equity and likely good pot odds, calling is correct.",
          "metrics": { "equity": 0.32, "potOdds": 0.22, "handStrength": 0.28 }
        },
        "turn": {
          "action": "call",
          "reasoning": "The 2d gives you a flush draw on top of your straight draw! You now have 8 straight outs + 7 additional flush outs = 15 outs, or roughly 30% equity with one card to come. With the pot size, you're getting excellent odds.",
          "metrics": { "equity": 0.30, "potOdds": 0.18, "handStrength": 0.25 }
        },
        "river": {
          "action": "raise",
          "raiseAmount": 70,
          "reasoning": "The Qh completes your straight (Q-J-T-9-8)! Value bet your made hand.",
          "metrics": { "equity": 0.85, "potOdds": 0, "handStrength": 0.82 }
        }
      }
    },
    {
      "id": "po-04",
      "playerCards": ["6h", "5h"],
      "communityCards": ["Kd", "7h", "2c", "4h", "Js"],
      "playerPosition": "BB",
      "playerStack": 1000,
      "smallBlind": 5,
      "bigBlind": 10,
      "opponents": [
        { "persona": "VINNY", "cards": ["Kc", "9c"], "stack": 1000, "position": "CO" },
        { "persona": "CHAD", "cards": ["Ah", "Td"], "stack": 1000, "position": "BTN" }
      ],
      "optimalActions": {
        "preflop": {
          "action": "check",
          "reasoning": "65s in the big blind when facing a limp or min-raise is a check/call. You're already invested and have a suited connector with implied odds.",
          "metrics": { "equity": 0.38, "potOdds": 0.33, "handStrength": 0.30 }
        },
        "flop": {
          "action": "check",
          "reasoning": "You have a gutshot straight draw (need a 3 or 8 for a straight) and a backdoor flush draw. Not enough equity to bet, but worth seeing a turn cheaply.",
          "metrics": { "equity": 0.15, "potOdds": 0, "handStrength": 0.10 }
        },
        "turn": {
          "action": "call",
          "reasoning": "The 4h gives you an open-ended straight draw AND a flush draw! You now have 8 straight outs + 7 flush outs = 15 outs (~30% equity). With the pot offering 3:1 or better, this is a clear call.",
          "metrics": { "equity": 0.30, "potOdds": 0.20, "handStrength": 0.25 }
        },
        "river": {
          "action": "fold",
          "reasoning": "The Js misses all your draws. No pair, no straight, no flush. Fold to any bet.",
          "metrics": { "equity": 0.03, "potOdds": 0, "handStrength": 0.03 }
        }
      }
    },
    {
      "id": "po-05",
      "playerCards": ["Ac", "Tc"],
      "communityCards": ["Jc", "6c", "2s", "9h", "5d"],
      "playerPosition": "CO",
      "playerStack": 1000,
      "smallBlind": 5,
      "bigBlind": 10,
      "opponents": [
        { "persona": "ALICE", "cards": ["Jd", "9d"], "stack": 1000, "position": "BTN" },
        { "persona": "NIKO", "cards": ["Qh", "Qs"], "stack": 1000, "position": "SB" }
      ],
      "optimalActions": {
        "preflop": {
          "action": "raise",
          "raiseAmount": 25,
          "reasoning": "ATs in the cutoff is a strong hand. Raise to build the pot.",
          "metrics": { "equity": 0.52, "potOdds": 0, "handStrength": 0.58 }
        },
        "flop": {
          "action": "call",
          "reasoning": "You flopped the nut flush draw (Ac gives you the best possible flush). With 9 outs, you have ~35% equity to the river. Even facing a bet, the pot odds easily justify a call. Never fold the nut flush draw on the flop.",
          "metrics": { "equity": 0.35, "potOdds": 0.20, "handStrength": 0.32 }
        },
        "turn": {
          "action": "fold",
          "reasoning": "The 9h doesn't complete your flush. With one card to come, you have 9 outs = ~18% equity. If facing a pot-sized bet (needing 33% equity), folding is correct. This is a tough but disciplined fold — the pot odds don't justify the price.",
          "metrics": { "equity": 0.18, "potOdds": 0.33, "handStrength": 0.15 }
        },
        "river": {
          "action": "fold",
          "reasoning": "Missed the flush. Ace-high won't win at showdown against likely hands. Fold.",
          "metrics": { "equity": 0.08, "potOdds": 0, "handStrength": 0.08 }
        }
      }
    }
  ]
}
```

- [ ] **Step 3: Verify JSON is valid**

Run: `cat server/data/lessons/position-ranges.json | python3 -m json.tool > /dev/null && echo "Valid" && cat server/data/lessons/pot-odds.json | python3 -m json.tool > /dev/null && echo "Valid"`
Expected: "Valid" printed twice

- [ ] **Step 4: Commit**

```bash
git add server/data/lessons/
git commit -m "feat: add lesson scenario data for position-ranges and pot-odds"
```

---

### Task 5: Build training controller

**Files:**
- Create: `server/controllers/training.ts`
- Modify: `server/__tests__/training.test.ts`

- [ ] **Step 1: Write tests for training controller**

Add to `server/__tests__/training.test.ts`:

```typescript
import { TrainingSession, loadLessons, toCardType } from '../controllers/training';

describe('toCardType', () => {
  test('converts pokersolver shorthand to CardType', () => {
    const card = toCardType('Qh');
    expect(card.suite).toBe('h');
    expect(card.value).toBe('Qh');
    expect(card.label).toBe('Q♥');
  });

  test('converts all suits correctly', () => {
    expect(toCardType('As').label).toBe('A♠');
    expect(toCardType('Kd').label).toBe('K♦');
    expect(toCardType('Jc').label).toBe('J♣');
    expect(toCardType('Th').label).toBe('T♥');
  });
});

describe('loadLessons', () => {
  test('loads lesson files from data directory', () => {
    const lessons = loadLessons();
    expect(lessons.length).toBeGreaterThanOrEqual(2);
    expect(lessons.find(l => l.id === 'position-ranges')).toBeDefined();
    expect(lessons.find(l => l.id === 'pot-odds')).toBeDefined();
  });

  test('each lesson has scenarios', () => {
    const lessons = loadLessons();
    for (const lesson of lessons) {
      expect(lesson.scenarios.length).toBeGreaterThanOrEqual(5);
    }
  });
});

describe('TrainingSession', () => {
  let lessons: ReturnType<typeof loadLessons>;

  beforeAll(() => {
    lessons = loadLessons();
  });

  test('startLesson initializes session', () => {
    const session = new TrainingSession(lessons);
    const intro = session.startLesson('position-ranges', []);
    expect(intro.totalHands).toBe(5);
    expect(intro.lesson.title).toBe('Position & Opening Ranges');
    // Lesson meta should not contain scenarios
    expect((intro.lesson as any).scenarios).toBeUndefined();
  });

  test('startLesson throws for nonexistent lesson', () => {
    const session = new TrainingSession(lessons);
    expect(() => session.startLesson('nonexistent', [])).toThrow();
  });

  test('nextHand after startLesson returns game state with player cards', () => {
    const session = new TrainingSession(lessons);
    session.startLesson('position-ranges', []);
    const result = session.nextHand();
    expect(result.type).toBe('gameState');
    if (result.type === 'gameState') {
      expect(result.data.playerCards).toHaveLength(2);
      expect(result.data.communityCards).toHaveLength(0); // preflop
      expect(result.data.stage).toBe(0);
      expect(result.data.opponents.length).toBeGreaterThan(0);
    }
  });

  test('processAction records decision and advances street', () => {
    const session = new TrainingSession(lessons);
    session.startLesson('position-ranges', []);
    session.nextHand();

    // Make a preflop action
    const result = session.processAction({ type: 'raise', bet: 30 });
    expect(result.type).toBe('gameState');
    if (result.type === 'gameState') {
      expect(result.data.stage).toBe(1); // flop
      expect(result.data.communityCards).toHaveLength(3);
    }
  });

  test('folding triggers debrief', () => {
    const session = new TrainingSession(lessons);
    session.startLesson('position-ranges', []);
    session.nextHand();

    const result = session.processAction({ type: 'fold' });
    expect(result.type).toBe('debrief');
  });

  test('playing through all streets triggers debrief', () => {
    const session = new TrainingSession(lessons);
    session.startLesson('position-ranges', []);
    session.nextHand();

    // Play through preflop, flop, turn
    session.processAction({ type: 'raise', bet: 30 });
    session.processAction({ type: 'raise', bet: 40 });
    session.processAction({ type: 'raise', bet: 60 });

    // River should trigger debrief
    const result = session.processAction({ type: 'raise', bet: 80 });
    expect(result.type).toBe('debrief');
  });

  test('debrief scores each street correctly', () => {
    const session = new TrainingSession(lessons);
    session.startLesson('position-ranges', []);
    session.nextHand();

    // Get the current scenario to know the optimal play
    // Fold on preflop for a hand where raising is optimal → should be incorrect
    const result = session.processAction({ type: 'fold' });
    expect(result.type).toBe('debrief');
    if (result.type === 'debrief') {
      const preflopResult = result.data.streets.find(s => s.street === 'preflop');
      expect(preflopResult).toBeDefined();
      expect(preflopResult!.userAction).toBe('fold');
      // Streets after fold should have null userAction
      const flopResult = result.data.streets.find(s => s.street === 'flop');
      expect(flopResult!.userAction).toBeNull();
    }
  });

  test('nextHand after debrief deals next hand', () => {
    const session = new TrainingSession(lessons);
    session.startLesson('position-ranges', []);
    session.nextHand(); // deal hand 0
    session.processAction({ type: 'fold' }); // debrief

    const result = session.nextHand(); // deal hand 1
    expect(result.type).toBe('gameState');
  });

  test('completing 5 hands triggers lessonComplete', () => {
    const session = new TrainingSession(lessons);
    session.startLesson('position-ranges', []);

    for (let i = 0; i < 5; i++) {
      session.nextHand(); // deal hand i
      session.processAction({ type: 'fold' }); // debrief
    }

    const result = session.nextHand(); // 6th call → lessonComplete
    expect(result.type).toBe('lessonComplete');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd server && bun test __tests__/training.test.ts`
Expected: FAIL — TrainingSession, loadLessons, toCardType not found

- [ ] **Step 3: Implement training controller**

Create `server/controllers/training.ts`:

```typescript
import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import type { CardType, Poker } from '@pixelpoker/shared';
import type {
  Lesson, LessonMeta, Scenario, TrainingGameState,
  StreetResult, DebriefData, LessonCompleteData, OpponentState,
} from '@pixelpoker/shared/src/trainingTypes';
import { makeAIDecision, preFlopStrength, postFlopStrength } from './ai';
import type { AIPersona } from './ai';
import { initializeGame, createAIPlayer, createPlayer } from './gameplay';

// ── Card Conversion ──

const SUIT_LABELS: Record<string, string> = { h: '♥', d: '♦', c: '♣', s: '♠' };

export function toCardType(card: string): CardType {
  const rank = card.slice(0, -1);
  const suite = card.slice(-1);
  return { suite, value: card, label: `${rank}${SUIT_LABELS[suite]}` };
}

// ── Lesson Loading ──

const LESSONS_DIR = join(import.meta.dir, '..', 'data', 'lessons');

export function loadLessons(): Lesson[] {
  const files = readdirSync(LESSONS_DIR).filter(f => f.endsWith('.json'));
  return files.map(f => JSON.parse(readFileSync(join(LESSONS_DIR, f), 'utf-8')));
}

function toLessonMeta(lesson: Lesson): LessonMeta {
  const { scenarios, ...meta } = lesson;
  return meta;
}

// ── Street Helpers ──

const STREETS = ['preflop', 'flop', 'turn', 'river'] as const;
type Street = typeof STREETS[number];

function communityCardsForStage(scenario: Scenario, stage: number): CardType[] {
  if (stage === 0) return [];
  if (stage === 1) return scenario.communityCards.slice(0, 3).map(toCardType);
  if (stage === 2) return scenario.communityCards.slice(0, 4).map(toCardType);
  return scenario.communityCards.map(toCardType);
}

// ── Minimal Persona for Training AI ──

function trainingPersona(name: string): AIPersona {
  return {
    name,
    tightness: 0.4, aggression: 0.5, bluffFreq: 0.1,
    skillJitter: 0.1, allInThreshold: 0.85, chatFrequency: 0,
    chat: { onFold: [], onCall: [], onRaise: [], onAllIn: [], onWin: [], onLose: [], onBluff: [], onBigPot: [], taunt: [] },
  };
}

// ── Action Result Types ──

type ActionResult =
  | { type: 'gameState'; data: TrainingGameState }
  | { type: 'debrief'; data: DebriefData & { scenarioComplete: boolean } }
  | { type: 'lessonComplete'; data: LessonCompleteData };

// ── Training Session ──

export class TrainingSession {
  private lessons: Lesson[];
  private currentLesson: Lesson | null = null;
  private selectedScenarios: Scenario[] = [];
  private handIndex = 0;
  private currentScenario: Scenario | null = null;
  private currentStage = 0; // 0=preflop, 1=flop, 2=turn, 3=river
  private streetResults: StreetResult[] = [];
  private handResults: DebriefData[] = [];
  private pot = 0;
  private currentBet = 0;
  private playerStack = 0;
  private playerLastBet = 0;
  private lastRaiseSize = 0;
  private opponentStates: OpponentState[] = [];

  constructor(lessons: Lesson[]) {
    this.lessons = lessons;
  }

  startLesson(lessonId: string, scenariosSeen: string[]): {
    lesson: LessonMeta; handNumber: number; totalHands: number;
  } {
    const lesson = this.lessons.find(l => l.id === lessonId);
    if (!lesson) throw new Error(`Lesson not found: ${lessonId}`);

    this.currentLesson = lesson;
    this.handIndex = -1;
    this.handResults = [];

    // Prefer unseen scenarios, then fill with random ones
    const unseen = lesson.scenarios.filter(s => !scenariosSeen.includes(s.id));
    const pool = unseen.length >= 5 ? unseen : lesson.scenarios;
    this.selectedScenarios = shuffle(pool).slice(0, 5);

    return {
      lesson: toLessonMeta(lesson),
      handNumber: 0,
      totalHands: this.selectedScenarios.length,
    };
  }

  dealHand(): TrainingGameState {
    const scenario = this.selectedScenarios[this.handIndex];
    this.currentScenario = scenario;
    this.currentStage = 0;
    this.streetResults = [];
    this.pot = scenario.smallBlind + scenario.bigBlind;
    this.currentBet = scenario.bigBlind;
    this.playerStack = scenario.playerStack;
    this.playerLastBet = 0;
    this.lastRaiseSize = scenario.bigBlind;

    // Handle player blind contributions based on position
    if (scenario.playerPosition === 'SB') {
      this.playerLastBet = scenario.smallBlind;
      this.playerStack -= scenario.smallBlind;
    } else if (scenario.playerPosition === 'BB') {
      this.playerLastBet = scenario.bigBlind;
      this.playerStack -= scenario.bigBlind;
    }

    this.opponentStates = scenario.opponents.map(opp => {
      let blindDeduction = 0;
      if (opp.position === 'SB') blindDeduction = scenario.smallBlind;
      else if (opp.position === 'BB') blindDeduction = scenario.bigBlind;
      return {
        persona: opp.persona,
        position: opp.position,
        stack: opp.stack - blindDeduction,
        lastAction: null,
        isActive: true,
        isAllIn: false,
      };
    });

    return this.buildGameState();
  }

  processAction(action: { type: string; bet?: number }): ActionResult {
    const scenario = this.currentScenario!;
    const street = STREETS[this.currentStage];
    const optimal = scenario.optimalActions[street];

    // Record user's action
    this.streetResults.push({
      street,
      userAction: action.type as any,
      optimalAction: optimal,
      correct: action.type === optimal.action,
    });

    // Handle fold — end hand immediately
    if (action.type === 'fold') {
      // Fill remaining streets with null actions
      for (let i = this.currentStage + 1; i < 4; i++) {
        this.streetResults.push({
          street: STREETS[i],
          userAction: null,
          optimalAction: scenario.optimalActions[STREETS[i]],
          correct: false,
        });
      }
      return this.buildDebrief();
    }

    // Update pot/stacks for call/raise
    if (action.type === 'call') {
      const callAmount = this.currentBet - this.playerLastBet;
      this.playerStack -= callAmount;
      this.pot += callAmount;
      this.playerLastBet = this.currentBet;
    } else if (action.type === 'raise' && action.bet) {
      this.playerStack -= (action.bet - this.playerLastBet);
      this.pot += (action.bet - this.playerLastBet);
      this.lastRaiseSize = action.bet - this.currentBet;
      this.currentBet = action.bet;
      this.playerLastBet = action.bet;
    }
    // check: no money change

    // Simulate opponent actions (simplified: opponents call or fold based on AI logic)
    this.simulateOpponents(scenario);

    // Advance to next street or end hand
    this.currentStage++;

    if (this.currentStage >= 4) {
      // River action done — showdown
      // Fill any missing streets (shouldn't happen in normal flow)
      return this.buildDebrief();
    }

    // Reset street betting state
    this.currentBet = 0;
    this.playerLastBet = 0;
    this.lastRaiseSize = scenario.bigBlind;
    for (const opp of this.opponentStates) {
      if (opp.isActive) opp.lastAction = null;
    }

    return { type: 'gameState', data: this.buildGameState() };
  }

  nextHand(): ActionResult {
    this.handIndex++;
    if (this.handIndex >= this.selectedScenarios.length) {
      return this.buildLessonComplete();
    }
    return { type: 'gameState', data: this.dealHand() };
  }

  getScenarioIds(): string[] {
    return this.selectedScenarios.map(s => s.id);
  }

  private simulateOpponents(scenario: Scenario): void {
    // Build a Poker-compatible state for makeAIDecision
    const game = this.buildPokerState(scenario);

    for (let i = 0; i < scenario.opponents.length; i++) {
      const opp = this.opponentStates[i];
      if (!opp.isActive) continue;

      const persona = trainingPersona(opp.persona);
      const aiPlayerIndex = i + 1; // player is index 0
      game.actionOn = aiPlayerIndex; // set actionOn for AI decision context

      try {
        const decision = makeAIDecision(game, aiPlayerIndex, persona);
        const aiAction = decision.action;

        if (aiAction.type === 'fold') {
          opp.isActive = false;
          opp.lastAction = 'FOLD';
        } else if (aiAction.type === 'call') {
          const callAmt = this.currentBet - (game.players[aiPlayerIndex].lastBet ?? 0);
          opp.stack -= callAmt;
          this.pot += callAmt;
          opp.lastAction = this.currentBet === 0 ? 'CHECK' : 'CALL';
        } else if (aiAction.type === 'raise' && aiAction.bet) {
          const raiseAmt = aiAction.bet - (game.players[aiPlayerIndex].lastBet ?? 0);
          opp.stack -= raiseAmt;
          this.pot += raiseAmt;
          this.lastRaiseSize = aiAction.bet - this.currentBet;
          this.currentBet = aiAction.bet;
          opp.lastAction = `RAISE $${aiAction.bet}`;
        }
      } catch {
        // If AI decision fails, opponent checks/calls
        opp.lastAction = this.currentBet === 0 ? 'CHECK' : 'CALL';
        if (this.currentBet > 0) {
          const callAmt = Math.min(this.currentBet, opp.stack);
          opp.stack -= callAmt;
          this.pot += callAmt;
        }
      }
    }
  }

  private buildPokerState(scenario: Scenario): Poker {
    const game = initializeGame(scenario.smallBlind, scenario.bigBlind);
    game.stage = this.currentStage + 1; // Poker stages: 1=preflop, 2=flop, etc.
    game.pot = this.pot;
    game.currentBet = this.currentBet;
    game.lastRaiseSize = this.lastRaiseSize;
    game.tableCards = communityCardsForStage(scenario, this.currentStage);

    // Player at index 0
    const player = createPlayer('training-player', 'You');
    player.stack = this.playerStack;
    player.cards = scenario.playerCards.map(toCardType);
    player.lastBet = this.playerLastBet;
    game.players = [player];

    // Opponents at indices 1+
    for (let i = 0; i < scenario.opponents.length; i++) {
      const oppData = scenario.opponents[i];
      const oppState = this.opponentStates[i];
      const aiPlayer = createAIPlayer(i + 1, oppData.persona);
      aiPlayer.stack = oppState.stack;
      aiPlayer.cards = oppData.cards.map(toCardType);
      aiPlayer.isActive = oppState.isActive;
      aiPlayer.lastBet = 0;
      game.players.push(aiPlayer);
    }

    game.actionOn = 0;
    return game;
  }

  private buildGameState(): TrainingGameState {
    const scenario = this.currentScenario!;
    return {
      stage: this.currentStage,
      playerCards: scenario.playerCards.map(toCardType),
      communityCards: communityCardsForStage(scenario, this.currentStage),
      pot: this.pot,
      currentBet: this.currentBet,
      opponents: this.opponentStates,
      playerStack: this.playerStack,
      playerPosition: scenario.playerPosition,
      playerLastBet: this.playerLastBet,
      smallBlind: scenario.smallBlind,
      bigBlind: scenario.bigBlind,
      lastRaiseSize: this.lastRaiseSize,
    };
  }

  private buildDebrief(): ActionResult {
    const correctCount = this.streetResults.filter(s => s.correct).length;
    const totalScored = this.streetResults.filter(s => s.userAction !== null).length;
    const score = totalScored > 0 ? Math.round((correctCount / totalScored) * 100) : 0;

    const debrief: DebriefData = {
      streets: this.streetResults,
      overallScore: score,
    };

    this.handResults.push(debrief);

    return {
      type: 'debrief',
      data: { ...debrief, scenarioComplete: true },
    };
  }

  private buildLessonComplete(): ActionResult {
    const totalCorrect = this.handResults.reduce(
      (sum, h) => sum + h.streets.filter(s => s.correct).length, 0
    );
    const totalScored = this.handResults.reduce(
      (sum, h) => sum + h.streets.filter(s => s.userAction !== null).length, 0
    );

    return {
      type: 'lessonComplete',
      data: {
        finalScore: totalScored > 0 ? Math.round((totalCorrect / totalScored) * 100) : 0,
        handResults: this.handResults,
        scenarioIds: this.getScenarioIds(),
      },
    };
  }
}

// ── Helpers ──

function shuffle<T>(arr: T[]): T[] {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd server && bun test __tests__/training.test.ts`
Expected: All tests pass

- [ ] **Step 5: Commit**

```bash
git add server/controllers/training.ts server/__tests__/training.test.ts
git commit -m "feat: implement training controller with session management and scoring"
```

---

### Task 6: Create training socket handlers

**Files:**
- Create: `server/controllers/trainingSocketHandlers.ts`
- Modify: `server/app.ts`

- [ ] **Step 1: Create training socket handlers**

Create `server/controllers/trainingSocketHandlers.ts`:

```typescript
import type { Server } from 'socket.io';
import type { ClientToServerEvents, ServerToClientEvents } from '@pixelpoker/shared';
import { TrainingSession, loadLessons } from './training';

const lessons = loadLessons();
const sessions = new Map<string, TrainingSession>();

export function registerTrainingHandlers(
  io: Server<ClientToServerEvents, ServerToClientEvents>
) {
  io.on('connection', (socket) => {
    socket.on('training:start', ({ lessonId, scenariosSeen }) => {
      try {
        const session = new TrainingSession(lessons);
        sessions.set(socket.id, session);
        const intro = session.startLesson(lessonId, scenariosSeen ?? []);
        socket.emit('training:lessonIntro', intro);
      } catch (err: any) {
        socket.emit('training:error', { message: err.message });
      }
    });

    socket.on('training:action', (action) => {
      const session = sessions.get(socket.id);
      if (!session) {
        socket.emit('training:error', { message: 'No active training session' });
        return;
      }

      const result = session.processAction(action);
      if (result.type === 'gameState') {
        socket.emit('training:gameState', result.data);
      } else if (result.type === 'debrief') {
        socket.emit('training:debrief', result.data);
      }
    });

    socket.on('training:nextHand', () => {
      const session = sessions.get(socket.id);
      if (!session) {
        socket.emit('training:error', { message: 'No active training session' });
        return;
      }

      const result = session.nextHand();
      if (result.type === 'gameState') {
        socket.emit('training:gameState', result.data);
      } else if (result.type === 'lessonComplete') {
        socket.emit('training:lessonComplete', result.data);
        sessions.delete(socket.id);
      }
    });

    socket.on('training:exit', () => {
      sessions.delete(socket.id);
    });

    socket.on('disconnect', () => {
      sessions.delete(socket.id);
    });
  });
}
```

- [ ] **Step 2: Register training handlers in app.ts**

In `server/app.ts`, add the import near the top with other controller imports:
```typescript
import { registerTrainingHandlers } from './controllers/trainingSocketHandlers';
```

Then add after the existing `registerHandlers(io);` line (around line 70):
```typescript
registerTrainingHandlers(io);
```

- [ ] **Step 3: Verify server starts without errors**

Run: `cd server && timeout 5 bun app.ts || true`
Expected: Server starts successfully (or times out cleanly after 5s)

- [ ] **Step 4: Commit**

```bash
git add server/controllers/trainingSocketHandlers.ts server/app.ts
git commit -m "feat: add training socket handlers and register in server"
```

---

## Chunk 3: Client — Store, Routing & Lesson Select

### Task 7: Create training Zustand store

**Files:**
- Create: `client/src/store/trainingStore.ts`

- [ ] **Step 1: Create the training store**

Create `client/src/store/trainingStore.ts`:

```typescript
import { create } from 'zustand';
import type {
  LessonMeta, TrainingGameState, DebriefData,
  LessonCompleteData, TrainingProgress,
} from '@pixelpoker/shared/src/trainingTypes';

const STORAGE_KEY = 'pixelpoker_training_progress';

type Phase = 'select' | 'intro' | 'playing' | 'debrief' | 'complete';

interface TrainingStore {
  phase: Phase;
  currentLesson: LessonMeta | null;
  handNumber: number;
  totalHands: number;
  gameState: TrainingGameState | null;
  debrief: (DebriefData & { scenarioComplete: boolean }) | null;
  lessonResult: LessonCompleteData | null;
  progress: TrainingProgress[];
  handResultDots: Array<'correct' | 'wrong' | 'pending'>;

  setPhase: (phase: Phase) => void;
  setLessonIntro: (lesson: LessonMeta, handNumber: number, totalHands: number) => void;
  setGameState: (state: TrainingGameState) => void;
  setDebrief: (data: DebriefData & { scenarioComplete: boolean }) => void;
  setLessonResult: (data: LessonCompleteData) => void;
  loadProgress: () => void;
  saveProgress: (lessonId: string, score: number, scenarioIds: string[]) => void;
  reset: () => void;
}

export const useTrainingStore = create<TrainingStore>((set, get) => ({
  phase: 'select',
  currentLesson: null,
  handNumber: 0,
  totalHands: 5,
  gameState: null,
  debrief: null,
  lessonResult: null,
  progress: [],
  handResultDots: [],

  setPhase: (phase) => set({ phase }),

  setLessonIntro: (lesson, handNumber, totalHands) =>
    set({ currentLesson: lesson, handNumber, totalHands, phase: 'intro', handResultDots: Array(totalHands).fill('pending') }),

  setGameState: (gameState) =>
    set({ gameState, phase: 'playing' }),

  setDebrief: (debrief) => {
    const { handResultDots, handNumber } = get();
    const allCorrect = debrief.streets.every(s => s.userAction === null || s.correct);
    const newDots = [...handResultDots];
    newDots[handNumber - 1] = allCorrect ? 'correct' : 'wrong';
    set({ debrief, phase: 'debrief', handResultDots: newDots });
  },

  setLessonResult: (lessonResult) => {
    // Use getState() to avoid stale closure — save progress here
    const { currentLesson } = get();
    set({ lessonResult, phase: 'complete' });
    if (currentLesson) {
      get().saveProgress(currentLesson.id, lessonResult.finalScore, lessonResult.scenarioIds);
    }
  },

  loadProgress: () => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      const progress: TrainingProgress[] = raw ? JSON.parse(raw) : [];
      set({ progress });
    } catch {
      set({ progress: [] });
    }
  },

  saveProgress: (lessonId, score, scenarioIds) => {
    const { progress } = get();
    const existing = progress.find(p => p.lessonId === lessonId);

    let updated: TrainingProgress[];
    if (existing) {
      updated = progress.map(p =>
        p.lessonId === lessonId
          ? {
              ...p,
              completedAt: new Date().toISOString(),
              bestScore: Math.max(p.bestScore, score),
              attempts: p.attempts + 1,
              scenariosSeen: [...new Set([...p.scenariosSeen, ...scenarioIds])],
            }
          : p
      );
    } else {
      updated = [
        ...progress,
        {
          lessonId,
          completedAt: new Date().toISOString(),
          bestScore: score,
          attempts: 1,
          scenariosSeen: scenarioIds,
        },
      ];
    }

    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
    set({ progress: updated });
  },

  reset: () =>
    set({
      phase: 'select',
      currentLesson: null,
      handNumber: 0,
      gameState: null,
      debrief: null,
      lessonResult: null,
      handResultDots: [],
    }),
}));
```

- [ ] **Step 2: Commit**

```bash
git add client/src/store/trainingStore.ts
git commit -m "feat: add training Zustand store with localStorage progress"
```

---

### Task 8: Add training route and welcome screen button

**Files:**
- Modify: `client/src/App.tsx`
- Modify: `client/src/Components/WelcomeView.tsx`
- Create: `client/src/Components/training/TrainingView.tsx`

- [ ] **Step 1: Create the TrainingView route component (placeholder)**

Create `client/src/Components/training/TrainingView.tsx`:

```tsx
import { useTrainingStore } from '../../store/trainingStore';
import { useEffect } from 'react';

// Lesson metadata hardcoded for now — will come from server later if needed
const LESSONS = [
  { id: 'position-ranges', number: 1, title: 'Position & Opening Ranges', description: 'Know when to play and when to fold based on where you sit', prerequisite: null },
  { id: 'pot-odds', number: 2, title: 'Pot Odds & Calling Decisions', description: 'When the math says call — and when it says fold', prerequisite: 'position-ranges' },
];

interface TrainingViewProps {
  onBack: () => void;
}

export default function TrainingView({ onBack }: TrainingViewProps) {
  const { phase, progress, loadProgress } = useTrainingStore();

  useEffect(() => {
    loadProgress();
  }, []);

  const isLessonUnlocked = (lessonId: string, prerequisite: string | null) => {
    if (!prerequisite) return true;
    return progress.some(p => p.lessonId === prerequisite && p.completedAt);
  };

  const getScore = (lessonId: string) => {
    const p = progress.find(pr => pr.lessonId === lessonId);
    return p?.bestScore ?? null;
  };

  return (
    <div className="min-h-screen flex items-start justify-center pt-28 px-4">
      <div className="bg-vice-surface border-2 border-vice-violet p-8 w-96"
           style={{ boxShadow: '6px 6px 0 #7B2FBE80, 0 0 40px #7B2FBE25' }}>
        <div className="text-center mb-6">
          <div className="text-vice-gold/40 text-sm tracking-[0.3em]">♠ ♥ ♣ ♦</div>
          <h1 className="font-press text-vice-pink text-2xl tracking-widest uppercase mt-2">
            Training
          </h1>
          <p className="text-vice-gold text-xs tracking-widest uppercase opacity-70 mt-2">
            sharpen your game<span className="animate-blink"> █</span>
          </p>
        </div>

        <div className="flex flex-col gap-2">
          {LESSONS.map(lesson => {
            const unlocked = isLessonUnlocked(lesson.id, lesson.prerequisite);
            const score = getScore(lesson.id);

            return (
              <button
                key={lesson.id}
                disabled={!unlocked}
                onClick={() => {
                  // TODO: Start lesson — will be connected in Task 11
                }}
                className={`text-left border-2 p-3 transition-colors ${
                  unlocked
                    ? score !== null
                      ? 'border-vice-cyan/30 bg-vice-bg hover:border-vice-violet'
                      : 'border-vice-surface bg-vice-bg hover:border-vice-violet'
                    : 'border-vice-surface bg-vice-bg opacity-40 cursor-default'
                }`}
              >
                <div className="flex justify-between items-center">
                  <div>
                    <div className={`font-press text-[8px] tracking-widest uppercase ${
                      score !== null ? 'text-vice-cyan' : 'text-vice-muted'
                    }`}>
                      Lesson {lesson.number}
                    </div>
                    <div className="font-press text-[10px] text-white mt-1 tracking-wide uppercase">
                      {lesson.title}
                    </div>
                    <div className="text-vice-muted text-xs mt-1">
                      {lesson.description}
                    </div>
                  </div>
                  <div className="text-right ml-3 shrink-0">
                    {!unlocked ? (
                      <span className="font-press text-[7px] text-vice-pink border border-vice-pink/40 px-2 py-1 tracking-wider uppercase">
                        🔒 Locked
                      </span>
                    ) : score !== null ? (
                      <div>
                        <div className={`font-press text-[10px] px-2 py-1 font-bold ${
                          score >= 80 ? 'bg-vice-cyan text-vice-bg' : 'bg-vice-gold text-vice-bg'
                        }`}>
                          {score}%
                        </div>
                        <div className="text-vice-muted/50 text-[9px] mt-1 uppercase tracking-wider">Best</div>
                      </div>
                    ) : (
                      <span className="text-vice-muted/50 font-press text-[8px] tracking-wider uppercase">
                        Not started
                      </span>
                    )}
                  </div>
                </div>
              </button>
            );
          })}
        </div>

        <div className="text-center mt-5">
          <button
            onClick={onBack}
            className="text-vice-muted text-xs tracking-widest uppercase hover:text-white transition-colors"
          >
            ← Back to Lobby
          </button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Add training state and route to App.tsx**

In `client/src/App.tsx`, add state for the training view. Add near other state declarations:
```typescript
const [showTraining, setShowTraining] = useState(false);
```

Add the import at the top:
```typescript
import TrainingView from './Components/training/TrainingView';
```

Then in the render logic, add a training view branch. The existing logic is:
```typescript
if (username && room) {
  // Game view
} else {
  // WelcomeView
}
```

Change it to:
```typescript
if (showTraining) {
  return <TrainingView onBack={() => setShowTraining(false)} />;
} else if (username && room) {
  // Game view (unchanged)
} else {
  // WelcomeView — pass setShowTraining
}
```

Pass `onTraining` to WelcomeView:
```tsx
<WelcomeView setupRoom={setupRoom} onTraining={() => setShowTraining(true)} />
```

- [ ] **Step 3: Add Training button to HomeScreen and thread prop through WelcomeView**

In `client/src/Components/welcome/HomeScreen.tsx`, add `onTraining` to the Props interface and add a Training button after the JOIN ROOM button:

```tsx
interface Props {
  onCreate: () => void;
  onJoin: () => void;
  onQuickPlay: () => void;
  onTraining: () => void;
}

function HomeScreen({ onCreate, onJoin, onQuickPlay, onTraining }: Props) {
  return (
    <div className="flex flex-col gap-3 w-full">
      {/* ... existing Quick Play, Create, Join buttons unchanged ... */}
      <button
        onClick={onTraining}
        className="w-full bg-vice-violet text-white py-4 font-bold tracking-widest uppercase text-sm btn-pixel hover:brightness-110"
      >
        ▶ TRAINING
      </button>
    </div>
  );
}
```

In `client/src/Components/WelcomeView.tsx`, add `onTraining` to the Props interface:
```typescript
interface Props {
  setupRoom: (userId: string, roomId: string, smallBlind?: number, bigBlind?: number, aiCount?: number) => void;
  onTraining: () => void;
}
```

Then pass `onTraining` through to `HomeScreen` where it is rendered (in the `step === 'home'` branch):
```tsx
<HomeScreen onCreate={...} onJoin={...} onQuickPlay={...} onTraining={onTraining} />
```

- [ ] **Step 4: Verify the app builds**

Run: `cd client && bun run build`
Expected: Build succeeds

- [ ] **Step 5: Commit**

```bash
git add client/src/Components/training/TrainingView.tsx client/src/App.tsx client/src/Components/WelcomeView.tsx
git commit -m "feat: add training route, lesson select screen, and welcome screen button"
```

---

## Chunk 4: Client — Lesson Flow Components

### Task 9: Build LessonIntro component

**Files:**
- Create: `client/src/Components/training/LessonIntro.tsx`

- [ ] **Step 1: Create LessonIntro component**

Create `client/src/Components/training/LessonIntro.tsx`:

```tsx
import type { LessonMeta } from '@pixelpoker/shared/src/trainingTypes';

interface LessonIntroProps {
  lesson: LessonMeta;
  handNumber: number;
  totalHands: number;
  onStart: () => void;
}

export default function LessonIntro({ lesson, handNumber, totalHands, onStart }: LessonIntroProps) {
  return (
    <div className="min-h-screen flex items-start justify-center pt-28 px-4">
      <div className="bg-vice-surface border-2 border-vice-violet p-8 w-[480px] text-center"
           style={{ boxShadow: '6px 6px 0 #7B2FBE80, 0 0 40px #7B2FBE25' }}>
        <div className="font-press text-[8px] text-vice-cyan tracking-widest uppercase">
          Lesson {lesson.number} of 5
        </div>
        <h2 className="font-press text-vice-pink text-sm tracking-widest uppercase mt-3 leading-relaxed">
          {lesson.title}
        </h2>

        <div className="text-left text-vice-muted text-xs leading-relaxed mt-5 px-2">
          {lesson.conceptIntro}
        </div>

        <div className="mt-4 p-3 border border-vice-gold/30 bg-vice-gold/5 text-left">
          <div className="font-press text-[7px] text-vice-gold tracking-widest uppercase">
            ▶ Key Takeaway
          </div>
          <div className="text-white text-xs mt-1 leading-relaxed">
            {lesson.keyTakeaway}
          </div>
        </div>

        <button
          onClick={onStart}
          className="mt-6 py-3 px-8 bg-vice-gold text-vice-bg font-press text-[10px] tracking-widest uppercase btn-pixel"
        >
          Deal Me In →
        </button>

        <div className="text-vice-muted/50 text-[10px] tracking-wider uppercase mt-3">
          {totalHands} hands · ~5 min
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add client/src/Components/training/LessonIntro.tsx
git commit -m "feat: add LessonIntro component"
```

---

### Task 10: Build TrainingHud, TrainingTable, and TrainingActionControls

**Files:**
- Create: `client/src/Components/training/TrainingHud.tsx`
- Create: `client/src/Components/training/TrainingActionControls.tsx`
- Create: `client/src/Components/training/TrainingTable.tsx`

- [ ] **Step 1: Create TrainingHud component**

Create `client/src/Components/training/TrainingHud.tsx`:

```tsx
interface TrainingHudProps {
  lessonTitle: string;
  handNumber: number;
  totalHands: number;
  results: Array<'correct' | 'wrong' | 'pending'>;
}

export default function TrainingHud({ lessonTitle, handNumber, totalHands, results }: TrainingHudProps) {
  return (
    <div className="flex justify-between items-center px-3 py-2 border border-vice-gold/30 bg-vice-gold/5 mb-3">
      <div className="flex items-center gap-3">
        <span className="font-press text-[7px] text-vice-gold tracking-widest uppercase">
          {lessonTitle}
        </span>
        <span className="text-vice-muted text-[10px]">
          Hand {handNumber} of {totalHands}
        </span>
      </div>
      <div className="flex gap-1.5">
        {results.map((r, i) => (
          <div
            key={i}
            className={`w-2.5 h-2.5 border-2 ${
              r === 'correct'
                ? 'bg-vice-cyan border-vice-cyan shadow-[0_0_6px_#00D4FF60]'
                : r === 'wrong'
                ? 'bg-vice-pink border-vice-pink shadow-[0_0_6px_#FF2D7860]'
                : 'border-vice-muted/30'
            }`}
          />
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Create TrainingActionControls component**

Create `client/src/Components/training/TrainingActionControls.tsx`:

```tsx
import { useState } from 'react';

interface TrainingActionControlsProps {
  currentBet: number;
  playerLastBet: number;
  playerStack: number;
  pot: number;
  bigBlind: number;
  lastRaiseSize: number;
  onAction: (action: { type: 'fold' | 'check' | 'call' | 'raise'; bet?: number }) => void;
}

export default function TrainingActionControls({
  currentBet, playerLastBet, playerStack, pot, bigBlind, lastRaiseSize, onAction,
}: TrainingActionControlsProps) {
  const amountToCall = currentBet - playerLastBet;
  const canCheck = amountToCall === 0;
  const minRaise = currentBet + Math.max(lastRaiseSize, bigBlind);
  const maxBet = playerStack + playerLastBet;
  const [betAmount, setBetAmount] = useState(minRaise);
  const [showRaise, setShowRaise] = useState(false);

  const presets = [
    { label: 'MIN', value: minRaise },
    { label: '½ POT', value: Math.min(Math.floor(pot / 2) + currentBet, maxBet) },
    { label: 'POT', value: Math.min(pot + currentBet, maxBet) },
    { label: 'ALL IN', value: maxBet },
  ];

  return (
    <div className="flex flex-col gap-2">
      {showRaise && (
        <div className="border border-vice-pink/30 bg-vice-bg p-2">
          <div className="flex gap-1 mb-2">
            {presets.map(p => (
              <button
                key={p.label}
                onClick={() => setBetAmount(p.value)}
                className={`flex-1 py-1 text-[8px] font-press tracking-wider uppercase btn-pixel ${
                  p.label === 'ALL IN'
                    ? 'bg-vice-gold text-vice-bg'
                    : 'bg-vice-pink/80 text-white'
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
          <input
            type="range"
            min={minRaise}
            max={maxBet}
            value={betAmount}
            onChange={e => setBetAmount(Number(e.target.value))}
            className="w-full bet-slider"
          />
          <div className="flex justify-between mt-1">
            <span className="text-vice-muted text-[10px]">${minRaise}</span>
            <span className="font-press text-vice-gold text-xs">${betAmount}</span>
            <span className="text-vice-muted text-[10px]">${maxBet}</span>
          </div>
          <button
            onClick={() => { onAction({ type: 'raise', bet: betAmount }); setShowRaise(false); }}
            className="w-full mt-2 py-2 bg-vice-pink text-white font-press text-[10px] tracking-widest uppercase btn-pixel"
          >
            Raise ${betAmount}
          </button>
        </div>
      )}

      <div className="flex gap-2">
        <button
          onClick={() => onAction({ type: 'fold' })}
          className="flex-1 py-2 bg-vice-surface border border-vice-muted/50 text-vice-muted font-press text-[10px] tracking-widest uppercase btn-pixel hover:border-vice-pink hover:text-vice-pink transition-colors"
        >
          Fold
        </button>
        <button
          onClick={() => onAction(canCheck ? { type: 'check' } : { type: 'call' })}
          className="flex-1 py-2 bg-vice-cyan text-vice-bg font-press text-[10px] tracking-widest uppercase btn-pixel"
        >
          {canCheck ? 'Check' : `Call $${amountToCall}`}
        </button>
        <button
          onClick={() => setShowRaise(!showRaise)}
          className="flex-1 py-2 bg-vice-pink text-white font-press text-[10px] tracking-widest uppercase btn-pixel"
        >
          Raise
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Create TrainingTable component**

Create `client/src/Components/training/TrainingTable.tsx`:

```tsx
import Card from '../Card';
import TrainingHud from './TrainingHud';
import TrainingActionControls from './TrainingActionControls';
import type { TrainingGameState, OpponentState } from '@pixelpoker/shared/src/trainingTypes';

interface TrainingTableProps {
  gameState: TrainingGameState;
  lessonTitle: string;
  handNumber: number;
  totalHands: number;
  handResults: Array<'correct' | 'wrong' | 'pending'>;
  onAction: (action: { type: 'fold' | 'check' | 'call' | 'raise'; bet?: number }) => void;
}

const STAGE_LABELS = ['Pre-flop', 'Flop', 'Turn', 'River'];

function OpponentCard({ opp }: { opp: OpponentState }) {
  return (
    <div className="text-center">
      <div className="w-9 h-9 border-2 border-vice-surface bg-vice-surface flex items-center justify-center mx-auto">
        <span className="font-press text-[8px] text-vice-muted">
          {opp.persona.slice(0, 2).toUpperCase()}
        </span>
      </div>
      <div className="text-[9px] text-vice-muted mt-1 tracking-wider uppercase">
        {opp.persona} · ${opp.stack}
      </div>
      {opp.lastAction && (
        <div className={`font-press text-[7px] mt-0.5 ${
          opp.lastAction === 'FOLD' ? 'text-vice-pink'
          : opp.lastAction === 'CHECK' ? 'text-vice-muted'
          : opp.lastAction === 'CALL' ? 'text-vice-cyan'
          : 'text-vice-gold'
        }`}>
          {opp.lastAction}
        </div>
      )}
    </div>
  );
}

export default function TrainingTable({
  gameState, lessonTitle, handNumber, totalHands, handResults, onAction,
}: TrainingTableProps) {
  const { playerCards, communityCards, pot, opponents, playerPosition } = gameState;

  return (
    <div className="min-h-screen flex flex-col items-center pt-8 px-4">
      <div className="w-full max-w-lg">
        <TrainingHud
          lessonTitle={lessonTitle}
          handNumber={handNumber}
          totalHands={totalHands}
          results={handResults}
        />

        {/* Table felt */}
        <div className="table-felt border-2 border-vice-gold/30 rounded-full p-6 text-center table-grid"
             style={{ boxShadow: '0 0 24px #FFB80015, inset 0 0 40px rgba(0,0,0,0.4)' }}>
          <div className="font-press text-[8px] text-vice-muted/70 tracking-widest uppercase">
            {STAGE_LABELS[gameState.stage] ?? 'Pre-flop'}
          </div>

          {/* Community cards */}
          <div className="flex justify-center gap-1.5 mt-2 min-h-[56px]">
            {communityCards.map((card, i) => (
              <Card key={i} card={card} />
            ))}
          </div>

          {/* Pot */}
          <div className="mt-3">
            <div className="font-press text-[7px] text-vice-muted/70 tracking-widest uppercase">Pot</div>
            <div className="font-press text-vice-gold text-lg tracking-wider"
                 style={{ textShadow: '0 0 10px #FFB80080' }}>
              ${pot}
            </div>
          </div>

          {/* Opponents */}
          <div className="flex justify-around mt-4">
            {opponents.filter(o => o.isActive).map((opp, i) => (
              <OpponentCard key={i} opp={opp} />
            ))}
          </div>
        </div>

        {/* Player area */}
        <div className="mt-4 border-t border-vice-violet/30 pt-4">
          <div className="flex justify-between items-center mb-3">
            <div className="flex items-center gap-2">
              <span className="text-vice-muted/70 text-[9px] tracking-wider uppercase">You</span>
              <span className="font-press text-[7px] bg-vice-violet/80 text-white px-2 py-0.5 tracking-wider uppercase">
                {playerPosition}
              </span>
              <span className="text-vice-gold font-press text-xs tracking-wider">
                ${gameState.playerStack}
              </span>
            </div>
            <div className="flex gap-1.5">
              {playerCards.map((card, i) => (
                <Card key={i} card={card} />
              ))}
            </div>
          </div>

          <TrainingActionControls
            currentBet={gameState.currentBet}
            playerLastBet={gameState.playerLastBet}
            playerStack={gameState.playerStack}
            pot={gameState.pot}
            bigBlind={gameState.bigBlind}
            lastRaiseSize={gameState.lastRaiseSize}
            onAction={onAction}
          />
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Verify build**

Run: `cd client && bun run build`
Expected: Build succeeds

- [ ] **Step 5: Commit**

```bash
git add client/src/Components/training/TrainingHud.tsx client/src/Components/training/TrainingActionControls.tsx client/src/Components/training/TrainingTable.tsx
git commit -m "feat: add TrainingHud, TrainingActionControls, and TrainingTable components"
```

---

### Task 11: Build Debrief, StreetScore, and LessonComplete components

**Files:**
- Create: `client/src/Components/training/StreetScore.tsx`
- Create: `client/src/Components/training/Debrief.tsx`
- Create: `client/src/Components/training/LessonComplete.tsx`

- [ ] **Step 1: Create StreetScore component**

Create `client/src/Components/training/StreetScore.tsx`:

```tsx
import { useState } from 'react';
import type { StreetResult } from '@pixelpoker/shared/src/trainingTypes';

const STREET_LABELS = { preflop: 'Pre-flop', flop: 'Flop', turn: 'Turn', river: 'River' };

export default function StreetScore({ result }: { result: StreetResult }) {
  const [expanded, setExpanded] = useState(false);
  const inactive = result.userAction === null;

  if (inactive) {
    return (
      <div className="border-2 border-vice-surface p-3 opacity-40">
        <span className="text-vice-muted text-xs">
          {STREET_LABELS[result.street]} — not reached
        </span>
      </div>
    );
  }

  const isCorrect = result.correct;
  const borderClass = isCorrect ? 'border-vice-cyan/40 bg-vice-cyan/5' : 'border-vice-pink/40 bg-vice-pink/5';

  return (
    <div className={`border-2 p-3 ${borderClass}`}>
      <div className="flex justify-between items-center">
        <div>
          <span className={`font-press text-[9px] ${isCorrect ? 'text-vice-cyan' : 'text-vice-pink'}`}>
            {isCorrect ? '✓' : '✗'} {STREET_LABELS[result.street]}
          </span>
          <span className="text-vice-muted text-xs ml-2">
            {result.userAction?.toUpperCase()}
          </span>
        </div>
        <button
          onClick={() => setExpanded(!expanded)}
          className="text-vice-muted/50 text-[10px] tracking-wider uppercase hover:text-white transition-colors"
        >
          {expanded ? '▲ Hide' : '▼ Details'}
        </button>
      </div>

      {expanded && (
        <div className="mt-3 pt-3 border-t border-vice-violet/20 text-xs text-vice-muted leading-relaxed">
          <strong className="text-white">
            Optimal play: {result.optimalAction.action.toUpperCase()}
            {result.optimalAction.raiseAmount ? ` $${result.optimalAction.raiseAmount}` : ''}
          </strong>
          <p className="mt-1">{result.optimalAction.reasoning}</p>
          <div className="bg-vice-bg border border-vice-violet/30 p-2 mt-2 text-xs leading-relaxed">
            <span className="text-vice-gold">Equity:</span> {Math.round(result.optimalAction.metrics.equity * 100)}%
            <br />
            <span className="text-vice-gold">Pot Odds:</span>{' '}
            {result.optimalAction.metrics.potOdds > 0
              ? `${Math.round(result.optimalAction.metrics.potOdds * 100)}%`
              : 'N/A (no bet to call)'}
            <br />
            <span className="text-vice-cyan">Hand Strength:</span>{' '}
            {Math.round(result.optimalAction.metrics.handStrength * 100)}%
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Create Debrief component**

Create `client/src/Components/training/Debrief.tsx`:

```tsx
import type { DebriefData } from '@pixelpoker/shared/src/trainingTypes';
import StreetScore from './StreetScore';

interface DebriefProps {
  handNumber: number;
  debrief: DebriefData;
  onNextHand: () => void;
  onExit: () => void;
}

export default function Debrief({ handNumber, debrief, onNextHand, onExit }: DebriefProps) {
  return (
    <div className="min-h-screen flex items-start justify-center pt-16 px-4">
      <div className="bg-vice-surface border-2 border-vice-violet p-6 w-[480px]"
           style={{ boxShadow: '6px 6px 0 #7B2FBE80, 0 0 40px #7B2FBE25' }}>
        <div className="text-center mb-5">
          <h2 className="font-press text-xs text-white tracking-widest uppercase">
            Hand {handNumber} Complete
          </h2>
          <p className="text-vice-muted text-xs mt-2">Here's how you played it</p>
        </div>

        <div className="flex flex-col gap-2">
          {debrief.streets.map(result => (
            <StreetScore key={result.street} result={result} />
          ))}
        </div>

        <div className="flex justify-center gap-3 mt-5">
          <button
            onClick={onNextHand}
            className="py-2 px-5 bg-vice-gold text-vice-bg font-press text-[9px] tracking-widest uppercase btn-pixel"
          >
            Next Hand →
          </button>
          <button
            onClick={onExit}
            className="py-2 px-5 bg-vice-surface border border-vice-muted/50 text-vice-muted font-press text-[9px] tracking-widest uppercase btn-pixel hover:border-vice-pink hover:text-vice-pink transition-colors"
          >
            Exit Lesson
          </button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Create LessonComplete component**

Create `client/src/Components/training/LessonComplete.tsx`:

```tsx
import type { LessonCompleteData } from '@pixelpoker/shared/src/trainingTypes';

interface LessonCompleteProps {
  lessonTitle: string;
  result: LessonCompleteData;
  onReplay: () => void;
  onBack: () => void;
}

export default function LessonComplete({ lessonTitle, result, onReplay, onBack }: LessonCompleteProps) {
  const { finalScore, handResults } = result;
  const scoreColor = finalScore >= 80 ? 'text-vice-cyan' : finalScore >= 50 ? 'text-vice-gold' : 'text-vice-pink';

  return (
    <div className="min-h-screen flex items-start justify-center pt-28 px-4">
      <div className="bg-vice-surface border-2 border-vice-violet p-8 w-96 text-center"
           style={{ boxShadow: '6px 6px 0 #7B2FBE80, 0 0 40px #7B2FBE25' }}>
        <div className="font-press text-[8px] text-vice-cyan tracking-widest uppercase">
          Lesson Complete
        </div>
        <h2 className="font-press text-vice-pink text-sm tracking-widest uppercase mt-2">
          {lessonTitle}
        </h2>

        <div className={`font-press text-5xl mt-6 ${scoreColor}`}
             style={{ textShadow: '0 0 20px currentColor' }}>
          {finalScore}%
        </div>
        <div className="text-vice-muted text-xs mt-2 tracking-wider uppercase">
          Final Score
        </div>

        {/* Per-hand breakdown */}
        <div className="flex justify-center gap-2 mt-6">
          {handResults.map((hand, i) => (
            <div key={i} className="text-center">
              <div className="text-vice-muted/50 text-[8px] uppercase tracking-wider mb-1">
                H{i + 1}
              </div>
              <div className={`font-press text-xs px-2 py-1 ${
                hand.overallScore >= 80
                  ? 'bg-vice-cyan text-vice-bg'
                  : hand.overallScore >= 50
                  ? 'bg-vice-gold text-vice-bg'
                  : 'bg-vice-pink text-white'
              }`}>
                {hand.overallScore}%
              </div>
            </div>
          ))}
        </div>

        <div className="flex justify-center gap-3 mt-8">
          <button
            onClick={onReplay}
            className="py-3 px-6 bg-vice-gold text-vice-bg font-press text-[10px] tracking-widest uppercase btn-pixel"
          >
            Replay Lesson
          </button>
          <button
            onClick={onBack}
            className="py-3 px-6 bg-vice-surface border border-vice-muted/50 text-vice-muted font-press text-[10px] tracking-widest uppercase btn-pixel hover:border-vice-pink hover:text-vice-pink transition-colors"
          >
            Back to Training
          </button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Verify build**

Run: `cd client && bun run build`
Expected: Build succeeds

- [ ] **Step 5: Commit**

```bash
git add client/src/Components/training/StreetScore.tsx client/src/Components/training/Debrief.tsx client/src/Components/training/LessonComplete.tsx
git commit -m "feat: add Debrief, StreetScore, and LessonComplete components"
```

---

## Chunk 5: Client — Wire Everything Together

### Task 12: Connect TrainingView to socket events and render all phases

**Files:**
- Modify: `client/src/Components/training/TrainingView.tsx`

- [ ] **Step 1: Update TrainingView to handle all phases**

Replace the content of `client/src/Components/training/TrainingView.tsx` with the full implementation that:
- Connects socket events on mount
- Renders the correct component based on `phase` from the training store
- Wires up all callbacks (start lesson, deal hand, process action, next hand, exit)

```tsx
import { useEffect, useCallback } from 'react';
import socket from '../../socket';
import { useTrainingStore } from '../../store/trainingStore';
import LessonIntro from './LessonIntro';
import TrainingTable from './TrainingTable';
import Debrief from './Debrief';
import LessonComplete from './LessonComplete';
import type { LessonMeta, TrainingGameState, DebriefData, LessonCompleteData } from '@pixelpoker/shared/src/trainingTypes';

const LESSONS = [
  { id: 'position-ranges', number: 1, title: 'Position & Opening Ranges', description: 'Know when to play and when to fold based on where you sit', prerequisite: null },
  { id: 'pot-odds', number: 2, title: 'Pot Odds & Calling Decisions', description: 'When the math says call — and when it says fold', prerequisite: 'position-ranges' },
];

interface TrainingViewProps {
  onBack: () => void;
}

export default function TrainingView({ onBack }: TrainingViewProps) {
  const store = useTrainingStore();
  const {
    phase, currentLesson, handNumber, totalHands,
    gameState, debrief, lessonResult, progress,
    setLessonIntro, setGameState, setDebrief, setLessonResult,
    loadProgress, saveProgress, reset, setPhase,
  } = store;

  // Track hand results for HUD dots
  const handResults: Array<'correct' | 'wrong' | 'pending'> = [];
  // We'll derive this from debrief history — for now use a simple approach
  // stored in a ref would be better, but keeping it simple for initial implementation

  useEffect(() => {
    loadProgress();

    // Ensure socket is connected
    if (!socket.connected) socket.connect();

    const onLessonIntro = (data: { lesson: LessonMeta; handNumber: number; totalHands: number }) => {
      setLessonIntro(data.lesson, data.handNumber, data.totalHands);
    };

    const onGameState = (data: TrainingGameState) => {
      setGameState(data);
    };

    const onDebrief = (data: DebriefData & { scenarioComplete: boolean }) => {
      setDebrief(data);
    };

    const onLessonComplete = (data: LessonCompleteData) => {
      // Progress saving is handled inside setLessonResult via getState()
      setLessonResult(data);
    };

    socket.on('training:lessonIntro', onLessonIntro);
    socket.on('training:gameState', onGameState);
    socket.on('training:debrief', onDebrief);
    socket.on('training:lessonComplete', onLessonComplete);

    return () => {
      socket.off('training:lessonIntro', onLessonIntro);
      socket.off('training:gameState', onGameState);
      socket.off('training:debrief', onDebrief);
      socket.off('training:lessonComplete', onLessonComplete);
    };
  }, []);

  const startLesson = useCallback((lessonId: string) => {
    const scenariosSeen = useTrainingStore.getState().progress.find(p => p.lessonId === lessonId)?.scenariosSeen ?? [];
    socket.emit('training:start', { lessonId, scenariosSeen });
  }, []);

  const handleDealFirstHand = useCallback(() => {
    // After intro, request the first hand's game state
    // The server sends gameState after lessonIntro automatically on nextHand
    socket.emit('training:nextHand');
  }, []);

  const handleAction = useCallback((action: { type: string; bet?: number }) => {
    socket.emit('training:action', action);
  }, []);

  const handleNextHand = useCallback(() => {
    socket.emit('training:nextHand');
  }, []);

  const handleExit = useCallback(() => {
    socket.emit('training:exit');
    reset();
  }, [reset]);

  const handleReplay = useCallback(() => {
    if (currentLesson) {
      startLesson(currentLesson.id);
    }
  }, [currentLesson, startLesson]);

  // ── Lesson Select Phase ──
  if (phase === 'select') {
    const isLessonUnlocked = (prerequisite: string | null) => {
      if (!prerequisite) return true;
      return progress.some(p => p.lessonId === prerequisite && p.completedAt);
    };

    const getScore = (lessonId: string) => {
      return progress.find(p => p.lessonId === lessonId)?.bestScore ?? null;
    };

    return (
      <div className="min-h-screen flex items-start justify-center pt-28 px-4">
        <div className="bg-vice-surface border-2 border-vice-violet p-8 w-96"
             style={{ boxShadow: '6px 6px 0 #7B2FBE80, 0 0 40px #7B2FBE25' }}>
          <div className="text-center mb-6">
            <div className="text-vice-gold/40 text-sm tracking-[0.3em]">♠ ♥ ♣ ♦</div>
            <h1 className="font-press text-vice-pink text-2xl tracking-widest uppercase mt-2">
              Training
            </h1>
            <p className="text-vice-gold text-xs tracking-widest uppercase opacity-70 mt-2">
              sharpen your game<span className="animate-blink"> █</span>
            </p>
          </div>

          <div className="flex flex-col gap-2">
            {LESSONS.map(lesson => {
              const unlocked = isLessonUnlocked(lesson.prerequisite);
              const score = getScore(lesson.id);

              return (
                <button
                  key={lesson.id}
                  disabled={!unlocked}
                  onClick={() => startLesson(lesson.id)}
                  className={`text-left border-2 p-3 transition-colors ${
                    unlocked
                      ? score !== null
                        ? 'border-vice-cyan/30 bg-vice-bg hover:border-vice-violet'
                        : 'border-vice-surface bg-vice-bg hover:border-vice-violet'
                      : 'border-vice-surface bg-vice-bg opacity-40 cursor-default'
                  }`}
                >
                  <div className="flex justify-between items-center">
                    <div>
                      <div className={`font-press text-[8px] tracking-widest uppercase ${
                        score !== null ? 'text-vice-cyan' : 'text-vice-muted'
                      }`}>
                        Lesson {lesson.number}
                      </div>
                      <div className="font-press text-[10px] text-white mt-1 tracking-wide uppercase">
                        {lesson.title}
                      </div>
                      <div className="text-vice-muted text-xs mt-1">
                        {lesson.description}
                      </div>
                    </div>
                    <div className="text-right ml-3 shrink-0">
                      {!unlocked ? (
                        <span className="font-press text-[7px] text-vice-pink border border-vice-pink/40 px-2 py-1 tracking-wider uppercase">
                          🔒 Locked
                        </span>
                      ) : score !== null ? (
                        <div>
                          <div className={`font-press text-[10px] px-2 py-1 font-bold ${
                            score >= 80 ? 'bg-vice-cyan text-vice-bg' : 'bg-vice-gold text-vice-bg'
                          }`}>
                            {score}%
                          </div>
                          <div className="text-vice-muted/50 text-[9px] mt-1 uppercase tracking-wider">Best</div>
                        </div>
                      ) : (
                        <span className="text-vice-muted/50 font-press text-[8px] tracking-wider uppercase">
                          Not started
                        </span>
                      )}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>

          <div className="text-center mt-5">
            <button onClick={onBack} className="text-vice-muted text-xs tracking-widest uppercase hover:text-white transition-colors">
              ← Back to Lobby
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── Lesson Intro Phase ──
  if (phase === 'intro' && currentLesson) {
    return (
      <LessonIntro
        lesson={currentLesson}
        handNumber={handNumber}
        totalHands={totalHands}
        onStart={handleDealFirstHand}
      />
    );
  }

  // ── Playing Phase ──
  if (phase === 'playing' && gameState && currentLesson) {
    return (
      <TrainingTable
        gameState={gameState}
        lessonTitle={currentLesson.title}
        handNumber={handNumber}
        totalHands={totalHands}
        handResults={store.handResultDots}
        onAction={handleAction}
      />
    );
  }

  // ── Debrief Phase ──
  if (phase === 'debrief' && debrief) {
    return (
      <Debrief
        handNumber={handNumber}
        debrief={debrief}
        onNextHand={handleNextHand}
        onExit={handleExit}
      />
    );
  }

  // ── Lesson Complete Phase ──
  if (phase === 'complete' && lessonResult && currentLesson) {
    return (
      <LessonComplete
        lessonTitle={currentLesson.title}
        result={lessonResult}
        onReplay={handleReplay}
        onBack={handleExit}
      />
    );
  }

  // Fallback
  return null;
}
```

- [ ] **Step 2: Verify handIndex logic is correct**

The training controller in Task 5 already uses:
- `startLesson()` sets `this.handIndex = -1`
- `nextHand()` increments `this.handIndex++` first, then checks `>= this.selectedScenarios.length`, then calls `this.dealHand()`

This means:
- After `startLesson`, handIndex is -1
- First `training:nextHand` call (from "Deal Me In"): increments to 0, deals scenario[0] ✓
- After debrief, second `training:nextHand`: increments to 1, deals scenario[1] ✓
- After 5th debrief, `training:nextHand`: increments to 5, returns lessonComplete ✓

The `training:nextHand` socket handler in Task 6 already handles both `gameState` and `lessonComplete` results. No changes needed — the flow works as written.

- [ ] **Step 3: Verify full build**

Run: `cd client && bun run build`
Expected: Build succeeds

- [ ] **Step 4: Run server tests**

Run: `cd server && bun test`
Expected: All tests pass (update test expectations for handIndex = -1 change if needed)

- [ ] **Step 5: Commit**

```bash
git add client/src/Components/training/TrainingView.tsx server/controllers/trainingSocketHandlers.ts server/controllers/training.ts
git commit -m "feat: wire up training flow — socket events, phase routing, and full lesson lifecycle"
```

---

### Task 13: Manual integration test

- [ ] **Step 1: Start dev server**

Run: `bun run dev`

- [ ] **Step 2: Test the full training flow**

1. Open app in browser
2. Click "Training" on the welcome screen
3. Verify lesson select shows lessons 1 and 2 (lesson 2 locked)
4. Click lesson 1 — verify intro screen appears with concept text
5. Click "Deal Me In" — verify table appears with cards and opponents
6. Make an action (fold/call/raise) — verify game advances or debrief appears
7. After debrief, click "Next Hand" — verify next hand deals
8. Play through 5 hands — verify lesson complete screen with score
9. Click "Back to Training" — verify return to lesson select with saved score
10. Verify lesson 2 is now unlocked

- [ ] **Step 3: Fix any issues found during testing**

Address bugs found during manual testing.

- [ ] **Step 4: Commit any fixes**

```bash
git add -A
git commit -m "fix: address issues found during training mode integration testing"
```
