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
  { id: 'pot-odds', number: 2, title: 'Pot Odds & Calling Decisions', description: 'When the math says call \u2014 and when it says fold', prerequisite: 'position-ranges' },
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
    loadProgress, reset,
  } = store;

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

  const handleAction = useCallback((action: { type: 'fold' | 'check' | 'call' | 'raise'; bet?: number }) => {
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
            <div className="text-vice-gold/40 text-sm tracking-[0.3em]">{'\u2660'} {'\u2665'} {'\u2663'} {'\u2666'}</div>
            <h1 className="font-press text-vice-pink text-2xl tracking-widest uppercase mt-2">
              Training
            </h1>
            <p className="text-vice-gold text-xs tracking-widest uppercase opacity-70 mt-2">
              sharpen your game<span className="animate-blink"> {'\u2588'}</span>
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
                          Locked
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
              {'\u2190'} Back to Lobby
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
