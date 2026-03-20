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
