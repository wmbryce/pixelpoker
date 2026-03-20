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
