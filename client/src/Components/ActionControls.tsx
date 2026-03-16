import { useState, useEffect } from 'react';
import socket from '../socket';
import type { GameAction } from '@pixelpoker/shared';

interface RaisePanelProps {
  playerIndex: number;
  isMyTurn: boolean;
  sliderMin: number;
  sliderMax: number;
  presets: { label: string; value: number }[];
  bet: number;
  setBet: (v: number) => void;
  onRaised: () => void;
}

function RaisePanel({ playerIndex, isMyTurn, sliderMin, sliderMax, presets, bet, setBet, onRaised }: RaisePanelProps) {
  const [customBet, setCustomBet] = useState('');
  const fillPct = sliderMax === sliderMin ? 100 : ((bet - sliderMin) / (sliderMax - sliderMin)) * 100;

  const submitRaise = (amount: number) => {
    socket.emit('gameAction', { type: 'raise', playerIndex, bet: amount });
    onRaised();
  };

  const submitCustomBet = () => {
    const parsed = Number.parseInt(customBet, 10);
    if (!Number.isNaN(parsed) && parsed >= sliderMin && parsed <= sliderMax) {
      setBet(parsed);
      submitRaise(parsed);
      setCustomBet('');
    }
  };

  return (
    <div className="flex flex-col gap-2 border border-vice-pink/30 bg-vice-bg p-2">
      {/* Preset buttons */}
      <div className="flex gap-1.5">
        {presets.map((p) => (
          <button
            key={p.label}
            onClick={() => {
              setBet(p.value);
              submitRaise(p.value);
            }}
            disabled={!isMyTurn}
            className={`flex-1 text-xs py-2 font-bold tracking-wider uppercase btn-pixel disabled:opacity-30 hover:brightness-110 truncate ${
              p.label === 'ALL IN'
                ? 'bg-vice-gold text-vice-bg'
                : 'bg-vice-pink/80 text-white'
            }`}
          >
            {p.label}
          </button>
        ))}
      </div>

      {/* Custom amount: slider + input */}
      <div className="flex flex-col gap-1.5">
        <input
          type="range"
          min={sliderMin}
          max={sliderMax}
          value={bet}
          disabled={!isMyTurn}
          onChange={(e) => {
            const v = Number.parseInt(e.target.value, 10);
            setBet(v);
            setCustomBet(String(v));
          }}
          className="bet-slider flex-1 disabled:opacity-30"
          style={{
            background: `linear-gradient(to right, #7B2FBE 0%, #7B2FBE ${fillPct}%, #1a2035 ${fillPct}%, #1a2035 100%)`,
          }}
        />
        <div className="flex gap-1.5">
          <div className="flex-1 flex items-center bg-vice-surface border border-vice-muted/30 focus-within:border-vice-gold transition-colors">
            <span className="pl-2 text-vice-gold text-xs select-none">$</span>
            <input
              type="number"
              min={sliderMin}
              max={sliderMax}
              value={customBet}
              placeholder={String(bet)}
              disabled={!isMyTurn}
              onChange={(e) => {
                setCustomBet(e.target.value);
                const v = Number.parseInt(e.target.value, 10);
                if (!Number.isNaN(v) && v >= sliderMin && v <= sliderMax) setBet(v);
              }}
              onKeyDown={(e) => { if (e.key === 'Enter') submitCustomBet(); }}
              className="flex-1 bg-transparent px-1 py-1.5 text-sm text-white focus:outline-none w-0"
            />
          </div>
          <button
            onClick={() => submitRaise(bet)}
            disabled={!isMyTurn}
            className="bg-vice-pink text-white px-4 py-1.5 text-xs font-bold tracking-widest uppercase btn-pixel disabled:opacity-30 hover:brightness-110"
          >
            RAISE
          </button>
        </div>
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────────────

interface ActionControlsProps {
  playerIndex: number;
  isMyTurn: boolean;
  currentBet: number;
  lastBet: number;
  lastRaiseSize: number;
  stack: number;
  pot: number;
}

function ActionControls({ playerIndex, isMyTurn, currentBet, lastBet, lastRaiseSize, stack, pot }: ActionControlsProps) {
  const [bet, setBet] = useState(20);
  const [showRaise, setShowRaise] = useState(false);

  const minRaise = currentBet + lastRaiseSize;
  const amountToCall = currentBet - lastBet;
  const allInBet = lastBet + stack;
  const sliderMin = minRaise;
  const sliderMax = Math.max(minRaise, allInBet);

  // Reset when turn starts
  useEffect(() => {
    if (isMyTurn) {
      setBet(Math.max(minRaise, currentBet * 2));
      setShowRaise(false);
    }
  }, [isMyTurn]); // eslint-disable-line react-hooks/exhaustive-deps

  const sendAction = (type: GameAction['type']) => {
    socket.emit('gameAction', { type, playerIndex, bet });
  };

  // Preset raise amounts
  const halfPot = Math.max(minRaise, Math.floor((pot + amountToCall) / 2) + currentBet);
  const fullPot = Math.max(minRaise, pot + amountToCall + currentBet);
  const presets = [
    { label: 'MIN', value: minRaise },
    { label: '½ POT', value: Math.min(halfPot, allInBet) },
    { label: 'POT', value: Math.min(fullPot, allInBet) },
    { label: 'ALL IN', value: allInBet },
  ].filter((p, i, arr) => arr.findIndex((q) => q.value === p.value) === i);

  return (
    <div className="flex flex-col items-stretch gap-2 mt-1 w-full min-w-[220px]">
      {/* Primary actions: Check/Call + Fold */}
      <div className="flex gap-2">
        <button
          onClick={() => sendAction('call')}
          disabled={!isMyTurn}
          className="flex-1 bg-vice-cyan text-vice-bg text-xs py-2.5 min-h-[40px] font-bold tracking-widest uppercase btn-pixel disabled:opacity-30 hover:brightness-110 truncate px-1"
        >
          {amountToCall === 0 ? 'CHECK' : `CALL $${amountToCall}`}
        </button>
        <button
          onClick={() => sendAction('fold')}
          disabled={!isMyTurn}
          className="bg-vice-surface border border-vice-muted/50 text-vice-muted text-xs py-2.5 min-h-[40px] px-4 font-bold tracking-widest uppercase btn-pixel disabled:opacity-30 hover:border-vice-pink hover:text-vice-pink transition-colors"
        >
          FOLD
        </button>
      </div>

      {/* Raise toggle */}
      <button
        onClick={() => setShowRaise((v) => !v)}
        disabled={!isMyTurn}
        className={`w-full text-xs py-2 font-bold tracking-widest uppercase transition-colors disabled:opacity-30 ${
          showRaise
            ? 'bg-vice-pink text-white'
            : 'bg-vice-surface border border-vice-muted/50 text-vice-muted hover:border-vice-pink hover:text-vice-pink'
        }`}
      >
        {showRaise ? '▾ RAISE' : '▸ RAISE'}
      </button>

      {/* Raise panel (expandable) */}
      {showRaise && (
        <RaisePanel
          playerIndex={playerIndex}
          isMyTurn={isMyTurn}
          sliderMin={sliderMin}
          sliderMax={sliderMax}
          presets={presets}
          bet={bet}
          setBet={setBet}
          onRaised={() => setShowRaise(false)}
        />
      )}
    </div>
  );
}

export default ActionControls;
