const TURN_SECONDS = 30;

interface Props {
  secondsLeft: number;
  compact?: boolean;
}

function TimerBar({ secondsLeft, compact = false }: Props) {
  const timerPct = (secondsLeft / TURN_SECONDS) * 100;
  const timerColor =
    secondsLeft > 10 ? 'bg-vice-cyan'
    : secondsLeft > 5 ? 'bg-vice-gold'
    : 'bg-vice-pink';

  return (
    <div className="w-full flex flex-col gap-0.5">
      <div className="w-full h-1 bg-vice-bg rounded-none overflow-hidden">
        <div
          className={`h-full transition-all duration-500 ${timerColor}`}
          style={{ width: `${timerPct}%` }}
        />
      </div>
      {!compact && (
        <span className="text-xs text-vice-muted tracking-widest text-right" style={{ fontSize: '0.6rem' }}>
          {secondsLeft}s
        </span>
      )}
    </div>
  );
}

export default TimerBar;
