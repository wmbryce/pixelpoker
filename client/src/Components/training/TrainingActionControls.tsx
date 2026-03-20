import { useState } from 'react';

interface TrainingActionControlsProps {
  currentBet: number;
  playerLastBet: number;
  playerStack: number;
  pot: number;
  bigBlind: number;
  lastRaiseSize: number;
  onAction: (action: { type: 'fold' | 'check' | 'call' | 'raise'; bet?: number }) => void;
}

export default function TrainingActionControls({
  currentBet, playerLastBet, playerStack, pot, bigBlind, lastRaiseSize, onAction,
}: TrainingActionControlsProps) {
  const amountToCall = currentBet - playerLastBet;
  const canCheck = amountToCall === 0;
  const minRaise = currentBet + Math.max(lastRaiseSize, bigBlind);
  const maxBet = playerStack + playerLastBet;
  const [betAmount, setBetAmount] = useState(minRaise);
  const [showRaise, setShowRaise] = useState(false);

  const presets = [
    { label: 'MIN', value: minRaise },
    { label: '\u00BD POT', value: Math.min(Math.floor(pot / 2) + currentBet, maxBet) },
    { label: 'POT', value: Math.min(pot + currentBet, maxBet) },
    { label: 'ALL IN', value: maxBet },
  ];

  return (
    <div className="flex flex-col gap-2">
      {showRaise && (
        <div className="border border-vice-pink/30 bg-vice-bg p-2">
          <div className="flex gap-1 mb-2">
            {presets.map(p => (
              <button
                key={p.label}
                onClick={() => setBetAmount(p.value)}
                className={`flex-1 py-1 text-[8px] font-press tracking-wider uppercase btn-pixel ${
                  p.label === 'ALL IN'
                    ? 'bg-vice-gold text-vice-bg'
                    : 'bg-vice-pink/80 text-white'
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
          <input
            type="range"
            min={minRaise}
            max={maxBet}
            value={betAmount}
            onChange={e => setBetAmount(Number(e.target.value))}
            className="w-full bet-slider"
          />
          <div className="flex justify-between mt-1">
            <span className="text-vice-muted text-[10px]">${minRaise}</span>
            <span className="font-press text-vice-gold text-xs">${betAmount}</span>
            <span className="text-vice-muted text-[10px]">${maxBet}</span>
          </div>
          <button
            onClick={() => { onAction({ type: 'raise', bet: betAmount }); setShowRaise(false); }}
            className="w-full mt-2 py-2 bg-vice-pink text-white font-press text-[10px] tracking-widest uppercase btn-pixel"
          >
            Raise ${betAmount}
          </button>
        </div>
      )}

      <div className="flex gap-2">
        <button
          onClick={() => onAction({ type: 'fold' })}
          className="flex-1 py-2 bg-vice-surface border border-vice-muted/50 text-vice-muted font-press text-[10px] tracking-widest uppercase btn-pixel hover:border-vice-pink hover:text-vice-pink transition-colors"
        >
          Fold
        </button>
        <button
          onClick={() => onAction(canCheck ? { type: 'check' } : { type: 'call' })}
          className="flex-1 py-2 bg-vice-cyan text-vice-bg font-press text-[10px] tracking-widest uppercase btn-pixel"
        >
          {canCheck ? 'Check' : `Call $${amountToCall}`}
        </button>
        <button
          onClick={() => setShowRaise(!showRaise)}
          className="flex-1 py-2 bg-vice-pink text-white font-press text-[10px] tracking-widest uppercase btn-pixel"
        >
          Raise
        </button>
      </div>
    </div>
  );
}
