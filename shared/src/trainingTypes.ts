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
