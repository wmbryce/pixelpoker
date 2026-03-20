import { describe, test, expect, beforeAll } from 'bun:test';
import { makeAIDecision } from '../controllers/ai';
import { initializeGame, createAIPlayer } from '../controllers/gameplay';
import { generateDeck } from '../controllers/deck';
import type { AIPersona } from '../controllers/ai';
import { TrainingSession, loadLessons, toCardType } from '../controllers/training';

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
