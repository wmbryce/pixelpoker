import type { LessonMeta } from '@pixelpoker/shared/src/trainingTypes';

interface LessonIntroProps {
  lesson: LessonMeta;
  handNumber: number;
  totalHands: number;
  onStart: () => void;
}

export default function LessonIntro({ lesson, handNumber: _handNumber, totalHands, onStart }: LessonIntroProps) {
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
