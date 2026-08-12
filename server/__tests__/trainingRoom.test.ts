import { describe, it, expect } from 'vitest';
import { env, evictDurableObject } from 'cloudflare:test';
import { WS_PING, WS_PONG, WS_TRAINING_PATH } from '@pixelpoker/shared/src/protocol';
import type {
  DebriefData,
  LessonCompleteData,
  LessonMeta,
  TrainingGameState,
} from '@pixelpoker/shared/src/trainingTypes';
import { TestClient } from './helpers/wsClient';

/**
 * Replaces the old `training-integration.test.ts`, which stood up a real
 * socket.io server. Same flows, driven over the raw-WebSocket protocol against
 * the Durable Object that now owns the session.
 */

type Intro = { lesson: LessonMeta; handNumber: number; totalHands: number };
type Debrief = DebriefData & { scenarioComplete: boolean };

let clientCounter = 0;

async function openTraining(): Promise<TestClient> {
  const client = `train-${++clientCounter}`;
  return TestClient.connect(WS_TRAINING_PATH, { client });
}

async function startLesson(client: TestClient, lessonId: string): Promise<Intro> {
  client.emit('training:start', { lessonId });
  return client.waitFor<Intro>('training:lessonIntro');
}

describe('TrainingRoom', () => {
  it('answers the heartbeat while a lesson sits idle', async () => {
    const client = await openTraining();
    await startLesson(client, 'position-ranges');

    client.emitRaw(WS_PING);

    await client.waitForRaw(WS_PONG);
  });

  it('runs a full lesson: start → five hands → lessonComplete', async () => {
    const client = await openTraining();
    const intro = await startLesson(client, 'position-ranges');

    expect(intro.lesson.id).toBe('position-ranges');
    expect(intro.lesson.title).toBe('Position & Opening Ranges');
    expect(intro.totalHands).toBe(5);
    // Lesson meta must not leak the scenario answers.
    expect((intro.lesson as unknown as { scenarios?: unknown }).scenarios).toBeUndefined();

    for (let hand = 0; hand < 5; hand++) {
      client.emit('training:nextHand');
      const state = await client.waitFor<TrainingGameState>('training:gameState');

      expect(state.playerCards).toHaveLength(2);
      expect(state.stage).toBe(0);
      expect(state.opponents.length).toBeGreaterThan(0);
      expect(state.playerStack).toBeGreaterThan(0);
      expect(state.bigBlind).toBeGreaterThan(0);

      for (let street = 0; street < 3; street++) {
        client.emit('training:action', { type: 'call' });
        const next = await client.waitFor<TrainingGameState>('training:gameState');
        expect(next.stage).toBe(street + 1);
      }

      client.emit('training:action', { type: 'call' });
      const debrief = await client.waitFor<Debrief>('training:debrief');

      expect(debrief.streets.map((s) => s.street)).toEqual(['preflop', 'flop', 'turn', 'river']);
      expect(debrief.scenarioComplete).toBe(true);
      expect(debrief.overallScore).toBeGreaterThanOrEqual(0);
      expect(debrief.overallScore).toBeLessThanOrEqual(100);

      for (const street of debrief.streets) {
        expect(street.optimalAction.reasoning).toBeTruthy();
        expect(street.optimalAction.metrics).toHaveProperty('equity');
        expect(street.optimalAction.metrics).toHaveProperty('potOdds');
      }
    }

    client.emit('training:nextHand');
    const complete = await client.waitFor<LessonCompleteData>('training:lessonComplete');

    expect(complete.finalScore).toBeGreaterThanOrEqual(0);
    expect(complete.finalScore).toBeLessThanOrEqual(100);
    expect(complete.handResults).toHaveLength(5);
    expect(complete.scenarioIds).toHaveLength(5);
  });

  it('folding pre-flop debriefs with the remaining streets unanswered', async () => {
    const client = await openTraining();
    await startLesson(client, 'position-ranges');

    client.emit('training:nextHand');
    await client.waitFor<TrainingGameState>('training:gameState');

    client.emit('training:action', { type: 'fold' });
    const debrief = await client.waitFor<Debrief>('training:debrief');

    expect(debrief.streets).toHaveLength(4);
    expect(debrief.streets[0].userAction).toBe('fold');
    expect(debrief.streets[1].userAction).toBeNull();
    expect(debrief.streets[2].userAction).toBeNull();
    expect(debrief.streets[3].userAction).toBeNull();
  });

  it('a raise grows the pot and advances the street', async () => {
    const client = await openTraining();
    await startLesson(client, 'pot-odds');

    client.emit('training:nextHand');
    const initial = await client.waitFor<TrainingGameState>('training:gameState');

    client.emit('training:action', { type: 'raise', bet: initial.bigBlind * 3 });
    const next = await client.waitFor<TrainingGameState>('training:gameState');

    expect(next.pot).toBeGreaterThan(initial.pot);
    expect(next.stage).toBe(1);
    expect(next.communityCards).toHaveLength(3);
  });

  it('errors on a nonexistent lesson', async () => {
    const client = await openTraining();
    client.emit('training:start', { lessonId: 'does-not-exist' });

    const error = await client.waitFor<{ message: string }>('training:error');
    expect(error.message).toContain('not found');
  });

  it('errors when acting without an active session', async () => {
    const client = await openTraining();
    client.emit('training:action', { type: 'call' });

    const error = await client.waitFor<{ message: string }>('training:error');
    expect(error.message).toContain('No active training session');
  });

  it('exit clears the session', async () => {
    const client = await openTraining();
    await startLesson(client, 'position-ranges');

    client.emit('training:exit');
    await TestClient.settle(100);

    client.emit('training:action', { type: 'call' });
    const error = await client.waitFor<{ message: string }>('training:error');
    expect(error.message).toContain('No active training session');
  });

  it('falls back to the full pool when every scenario has been seen', async () => {
    const first = await openTraining();
    await startLesson(first, 'position-ranges');

    for (let i = 0; i < 5; i++) {
      first.emit('training:nextHand');
      await first.waitFor<TrainingGameState>('training:gameState');
      first.emit('training:action', { type: 'fold' });
      await first.waitFor<Debrief>('training:debrief');
    }

    first.emit('training:nextHand');
    const complete = await first.waitFor<LessonCompleteData>('training:lessonComplete');

    const second = await openTraining();
    second.emit('training:start', {
      lessonId: 'position-ranges',
      scenariosSeen: complete.scenarioIds,
    });
    await second.waitFor<Intro>('training:lessonIntro');

    second.emit('training:nextHand');
    const state = await second.waitFor<TrainingGameState>('training:gameState');
    expect(state.playerCards).toHaveLength(2);
  });

  it('survives eviction mid-lesson', async () => {
    const client = `train-evict-${++clientCounter}`;
    const socket = await TestClient.connect(WS_TRAINING_PATH, { client });

    await startLesson(socket, 'position-ranges');
    socket.emit('training:nextHand');
    const before = await socket.waitFor<TrainingGameState>('training:gameState');

    // A lesson is thinking-time heavy, so the object will routinely be evicted
    // between a player's actions.
    await evictDurableObject(env.TRAINING_ROOM.getByName(client), { webSockets: 'hibernate' });

    socket.emit('training:action', { type: 'call' });
    const after = await socket.waitFor<TrainingGameState>('training:gameState');

    expect(after.stage).toBe(1);
    expect(after.communityCards).toHaveLength(3);
    expect(after.playerCards).toEqual(before.playerCards);
  });
});
