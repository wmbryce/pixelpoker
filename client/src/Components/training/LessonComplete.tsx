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
