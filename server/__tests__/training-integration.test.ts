import { describe, test, expect, beforeAll, afterAll, beforeEach } from 'bun:test';
import { createServer } from 'http';
import { Server } from 'socket.io';
import { io as ioc, type Socket as ClientSocket } from 'socket.io-client';
import type { ServerToClientEvents, ClientToServerEvents } from '@pixelpoker/shared';
import type {
  TrainingGameState,
  DebriefData,
  LessonCompleteData,
  LessonMeta,
} from '@pixelpoker/shared/src/trainingTypes';
import { registerTrainingHandlers } from '../controllers/trainingSocketHandlers';

// ── Helpers ──

type TypedClientSocket = ClientSocket<ServerToClientEvents, ClientToServerEvents>;

function waitFor<T>(socket: TypedClientSocket, event: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Timeout waiting for ${event}`)), 3000);
    (socket as any).once(event, (data: T) => {
      clearTimeout(timer);
      resolve(data);
    });
  });
}

// ── Test Setup ──

let ioServer: Server;
let httpServer: ReturnType<typeof createServer>;
let port: number;

beforeAll((done) => {
  httpServer = createServer();
  ioServer = new Server<ClientToServerEvents, ServerToClientEvents>(httpServer);
  registerTrainingHandlers(ioServer);
  httpServer.listen(0, () => {
    const addr = httpServer.address();
    port = typeof addr === 'object' ? addr!.port : 0;
    done();
  });
});

afterAll(() => {
  ioServer.close();
  httpServer.close();
});

function createClient(): TypedClientSocket {
  return ioc(`http://localhost:${port}`, {
    transports: ['websocket'],
    forceNew: true,
  }) as TypedClientSocket;
}

// ── Tests ──

describe('training socket integration', () => {
  let client: TypedClientSocket;

  beforeEach(() => {
    client = createClient();
  });

  afterAll(() => {
    client?.disconnect();
  });

  test('full lesson flow: start → play 5 hands → lessonComplete', async () => {
    // 1. Start a lesson
    const introPromise = waitFor<{ lesson: LessonMeta; handNumber: number; totalHands: number }>(
      client,
      'training:lessonIntro'
    );
    client.emit('training:start', { lessonId: 'position-ranges' });
    const intro = await introPromise;

    expect(intro.lesson.id).toBe('position-ranges');
    expect(intro.lesson.title).toBe('Position & Opening Ranges');
    expect(intro.totalHands).toBe(5);
    expect((intro.lesson as any).scenarios).toBeUndefined(); // no leaking answers

    // 2. Play through 5 hands
    for (let hand = 0; hand < 5; hand++) {
      // Request next hand
      const gameStatePromise = waitFor<TrainingGameState>(client, 'training:gameState');
      client.emit('training:nextHand');
      const gameState = await gameStatePromise;

      // Verify game state shape
      expect(gameState.playerCards).toHaveLength(2);
      expect(gameState.stage).toBe(0); // preflop
      expect(gameState.opponents.length).toBeGreaterThan(0);
      expect(gameState.playerStack).toBeGreaterThan(0);
      expect(gameState.smallBlind).toBeGreaterThan(0);
      expect(gameState.bigBlind).toBeGreaterThan(0);

      // Play through all 4 streets (preflop, flop, turn, river)
      for (let street = 0; street < 3; street++) {
        const nextStatePromise = waitFor<TrainingGameState>(client, 'training:gameState');
        client.emit('training:action', { type: 'call' });
        const nextState = await nextStatePromise;
        expect(nextState.stage).toBe(street + 1);
      }

      // River action triggers debrief
      const debriefPromise = waitFor<DebriefData & { scenarioComplete: boolean }>(
        client,
        'training:debrief'
      );
      client.emit('training:action', { type: 'call' });
      const debrief = await debriefPromise;

      expect(debrief.streets).toHaveLength(4);
      expect(debrief.streets[0].street).toBe('preflop');
      expect(debrief.streets[1].street).toBe('flop');
      expect(debrief.streets[2].street).toBe('turn');
      expect(debrief.streets[3].street).toBe('river');
      expect(debrief.scenarioComplete).toBe(true);
      expect(debrief.overallScore).toBeGreaterThanOrEqual(0);
      expect(debrief.overallScore).toBeLessThanOrEqual(100);

      // Each street result has an optimal action with reasoning
      for (const sr of debrief.streets) {
        expect(sr.optimalAction.reasoning).toBeTruthy();
        expect(sr.optimalAction.metrics).toHaveProperty('equity');
        expect(sr.optimalAction.metrics).toHaveProperty('potOdds');
      }
    }

    // 3. After 5 hands, nextHand should trigger lessonComplete
    const completePromise = waitFor<LessonCompleteData>(client, 'training:lessonComplete');
    client.emit('training:nextHand');
    const complete = await completePromise;

    expect(complete.finalScore).toBeGreaterThanOrEqual(0);
    expect(complete.finalScore).toBeLessThanOrEqual(100);
    expect(complete.handResults).toHaveLength(5);
    expect(complete.scenarioIds).toHaveLength(5);

    client.disconnect();
  });

  test('fold on preflop triggers debrief with null remaining streets', async () => {
    const introPromise = waitFor(client, 'training:lessonIntro');
    client.emit('training:start', { lessonId: 'position-ranges' });
    await introPromise;

    const gameStatePromise = waitFor<TrainingGameState>(client, 'training:gameState');
    client.emit('training:nextHand');
    await gameStatePromise;

    // Fold immediately
    const debriefPromise = waitFor<DebriefData & { scenarioComplete: boolean }>(
      client,
      'training:debrief'
    );
    client.emit('training:action', { type: 'fold' });
    const debrief = await debriefPromise;

    expect(debrief.streets).toHaveLength(4);
    expect(debrief.streets[0].userAction).toBe('fold');
    // Remaining streets should have null userAction
    expect(debrief.streets[1].userAction).toBeNull();
    expect(debrief.streets[2].userAction).toBeNull();
    expect(debrief.streets[3].userAction).toBeNull();

    client.disconnect();
  });

  test('raise action updates game state correctly', async () => {
    const introPromise = waitFor(client, 'training:lessonIntro');
    client.emit('training:start', { lessonId: 'pot-odds' });
    await introPromise;

    const gameStatePromise = waitFor<TrainingGameState>(client, 'training:gameState');
    client.emit('training:nextHand');
    const initialState = await gameStatePromise;

    const initialPot = initialState.pot;
    const raiseAmount = initialState.bigBlind * 3;

    const nextStatePromise = waitFor<TrainingGameState>(client, 'training:gameState');
    client.emit('training:action', { type: 'raise', bet: raiseAmount });
    const nextState = await nextStatePromise;

    // Pot should have increased
    expect(nextState.pot).toBeGreaterThan(initialPot);
    // Should be on flop now
    expect(nextState.stage).toBe(1);
    expect(nextState.communityCards).toHaveLength(3);

    client.disconnect();
  });

  test('error on nonexistent lesson', async () => {
    const errorPromise = waitFor<{ message: string }>(client, 'training:error');
    client.emit('training:start', { lessonId: 'does-not-exist' });
    const error = await errorPromise;

    expect(error.message).toContain('not found');

    client.disconnect();
  });

  test('error when acting without active session', async () => {
    const errorPromise = waitFor<{ message: string }>(client, 'training:error');
    client.emit('training:action', { type: 'call' });
    const error = await errorPromise;

    expect(error.message).toContain('No active training session');

    client.disconnect();
  });

  test('exit cleans up session', async () => {
    const introPromise = waitFor(client, 'training:lessonIntro');
    client.emit('training:start', { lessonId: 'position-ranges' });
    await introPromise;

    client.emit('training:exit');

    // Small delay to let the exit process
    await new Promise(r => setTimeout(r, 50));

    // Now acting should fail with no session error
    const errorPromise = waitFor<{ message: string }>(client, 'training:error');
    client.emit('training:action', { type: 'call' });
    const error = await errorPromise;

    expect(error.message).toContain('No active training session');

    client.disconnect();
  });

  test('scenariosSeen filters out previously seen scenarios', async () => {
    // Start lesson once to get scenario IDs
    const intro1Promise = waitFor(client, 'training:lessonIntro');
    client.emit('training:start', { lessonId: 'position-ranges' });
    await intro1Promise;

    // Play one hand to verify it works, then collect all scenario IDs
    // by completing the full lesson
    const scenarioIds: string[] = [];
    for (let i = 0; i < 5; i++) {
      const gsPromise = waitFor<TrainingGameState>(client, 'training:gameState');
      client.emit('training:nextHand');
      await gsPromise;

      const debriefPromise = waitFor<DebriefData>(client, 'training:debrief');
      client.emit('training:action', { type: 'fold' });
      await debriefPromise;
    }

    const completePromise = waitFor<LessonCompleteData>(client, 'training:lessonComplete');
    client.emit('training:nextHand');
    const complete = await completePromise;
    scenarioIds.push(...complete.scenarioIds);

    client.disconnect();

    // Start a new session with those IDs as seen
    const client2 = createClient();
    const intro2Promise = waitFor(client2, 'training:lessonIntro');
    client2.emit('training:start', {
      lessonId: 'position-ranges',
      scenariosSeen: scenarioIds,
    });
    await intro2Promise;

    // Should still work (falls back to full pool if all seen)
    const gsPromise = waitFor<TrainingGameState>(client2, 'training:gameState');
    client2.emit('training:nextHand');
    const gs = await gsPromise;
    expect(gs.playerCards).toHaveLength(2);

    client2.disconnect();
  });
});
