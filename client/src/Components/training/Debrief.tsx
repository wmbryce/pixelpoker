import type { DebriefData } from '@pixelpoker/shared/src/trainingTypes';
import StreetScore from './StreetScore';

interface DebriefProps {
  handNumber: number;
  debrief: DebriefData;
  onNextHand: () => void;
  onExit: () => void;
}

export default function Debrief({ handNumber, debrief, onNextHand, onExit }: DebriefProps) {
  return (
    <div className="min-h-screen flex items-start justify-center pt-16 px-4">
      <div className="bg-vice-surface border-2 border-vice-violet p-6 w-[480px]"
           style={{ boxShadow: '6px 6px 0 #7B2FBE80, 0 0 40px #7B2FBE25' }}>
        <div className="text-center mb-5">
          <h2 className="font-press text-xs text-white tracking-widest uppercase">
            Hand {handNumber} Complete
          </h2>
          <p className="text-vice-muted text-xs mt-2">Here's how you played it</p>
        </div>

        <div className="flex flex-col gap-2">
          {debrief.streets.map(result => (
            <StreetScore key={result.street} result={result} />
          ))}
        </div>

        <div className="flex justify-center gap-3 mt-5">
          <button
            onClick={onNextHand}
            className="py-2 px-5 bg-vice-gold text-vice-bg font-press text-[9px] tracking-widest uppercase btn-pixel"
          >
            Next Hand →
          </button>
          <button
            onClick={onExit}
            className="py-2 px-5 bg-vice-surface border border-vice-muted/50 text-vice-muted font-press text-[9px] tracking-widest uppercase btn-pixel hover:border-vice-pink hover:text-vice-pink transition-colors"
          >
            Exit Lesson
          </button>
        </div>
      </div>
    </div>
  );
}
