import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import type { CardType, Poker } from '@pixelpoker/shared';
import type {
  Lesson, LessonMeta, Scenario, TrainingGameState,
  StreetResult, DebriefData, LessonCompleteData, OpponentState,
} from '@pixelpoker/shared/src/trainingTypes';
import { makeAIDecision } from './ai';
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

const LESSONS_DIR = join(import.meta.dirname!, '..', 'data', 'lessons');

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
