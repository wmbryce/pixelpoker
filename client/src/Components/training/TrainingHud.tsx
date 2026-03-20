interface TrainingHudProps {
  lessonTitle: string;
  handNumber: number;
  totalHands: number;
  results: Array<'correct' | 'wrong' | 'pending'>;
}

export default function TrainingHud({ lessonTitle, handNumber, totalHands, results }: TrainingHudProps) {
  return (
    <div className="flex justify-between items-center px-3 py-2 border border-vice-gold/30 bg-vice-gold/5 mb-3">
      <div className="flex items-center gap-3">
        <span className="font-press text-[7px] text-vice-gold tracking-widest uppercase">
          {lessonTitle}
        </span>
        <span className="text-vice-muted text-[10px]">
          Hand {handNumber} of {totalHands}
        </span>
      </div>
      <div className="flex gap-1.5">
        {results.map((r, i) => (
          <div
            key={i}
            className={`w-2.5 h-2.5 border-2 ${
              r === 'correct'
                ? 'bg-vice-cyan border-vice-cyan shadow-[0_0_6px_#00D4FF60]'
                : r === 'wrong'
                ? 'bg-vice-pink border-vice-pink shadow-[0_0_6px_#FF2D7860]'
                : 'border-vice-muted/30'
            }`}
          />
        ))}
      </div>
    </div>
  );
}
