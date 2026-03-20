import { useState } from 'react';
import type { StreetResult } from '@pixelpoker/shared/src/trainingTypes';

const STREET_LABELS = { preflop: 'Pre-flop', flop: 'Flop', turn: 'Turn', river: 'River' };

export default function StreetScore({ result }: { result: StreetResult }) {
  const [expanded, setExpanded] = useState(false);
  const inactive = result.userAction === null;

  if (inactive) {
    return (
      <div className="border-2 border-vice-surface p-3 opacity-40">
        <span className="text-vice-muted text-xs">
          {STREET_LABELS[result.street]} — not reached
        </span>
      </div>
    );
  }

  const isCorrect = result.correct;
  const borderClass = isCorrect ? 'border-vice-cyan/40 bg-vice-cyan/5' : 'border-vice-pink/40 bg-vice-pink/5';

  return (
    <div className={`border-2 p-3 ${borderClass}`}>
      <div className="flex justify-between items-center">
        <div>
          <span className={`font-press text-[9px] ${isCorrect ? 'text-vice-cyan' : 'text-vice-pink'}`}>
            {isCorrect ? '\u2713' : '\u2717'} {STREET_LABELS[result.street]}
          </span>
          <span className="text-vice-muted text-xs ml-2">
            {result.userAction?.toUpperCase()}
          </span>
        </div>
        <button
          onClick={() => setExpanded(!expanded)}
          className="text-vice-muted/50 text-[10px] tracking-wider uppercase hover:text-white transition-colors"
        >
          {expanded ? '\u25B2 Hide' : '\u25BC Details'}
        </button>
      </div>

      {expanded && (
        <div className="mt-3 pt-3 border-t border-vice-violet/20 text-xs text-vice-muted leading-relaxed">
          <strong className="text-white">
            Optimal play: {result.optimalAction.action.toUpperCase()}
            {result.optimalAction.raiseAmount ? ` $${result.optimalAction.raiseAmount}` : ''}
          </strong>
          <p className="mt-1">{result.optimalAction.reasoning}</p>
          <div className="bg-vice-bg border border-vice-violet/30 p-2 mt-2 text-xs leading-relaxed">
            <span className="text-vice-gold">Equity:</span> {Math.round(result.optimalAction.metrics.equity * 100)}%
            <br />
            <span className="text-vice-gold">Pot Odds:</span>{' '}
            {result.optimalAction.metrics.potOdds > 0
              ? `${Math.round(result.optimalAction.metrics.potOdds * 100)}%`
              : 'N/A (no bet to call)'}
            <br />
            <span className="text-vice-cyan">Hand Strength:</span>{' '}
            {Math.round(result.optimalAction.metrics.handStrength * 100)}%
          </div>
        </div>
      )}
    </div>
  );
}
