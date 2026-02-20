import { useState } from 'react';
import Hand from './Hand';
import socket from '../socket';
import type { PlayerType } from '@pixelpoker/shared';
import type { GameAction } from '@pixelpoker/shared';

interface Props {
  player: PlayerType;
  index: number;
  dealer: number;
  winner: number[];
  actionOn: number;
  currentBet: number;
  numPlayers: number;
  isMe: boolean;
}

function seatLabel(index: number, dealer: number, numPlayers: number): string {
  if (index === dealer) return 'DEALER';
  if (index === (dealer + 1) % numPlayers) return 'SB';
  if (index === (dealer + 2) % numPlayers) return 'BB';
  return '';
}

const LABEL_COLORS: Record<string, string> = {
  DEALER: 'bg-vice-violet/80 text-white',
  SB:     'bg-vice-cyan/20 text-vice-cyan border border-vice-cyan/50',
  BB:     'bg-vice-pink/20 text-vice-pink border border-vice-pink/50',
};

function Player({
  player,
  index,
  dealer,
  winner,
  actionOn,
  currentBet,
  numPlayers,
  isMe,
}: Props) {
  const [bet, setBet] = useState(20);

  const isMyTurn = isMe && actionOn === index && player.isActive;
  const isWinner = winner.includes(index);
  const label = seatLabel(index, dealer, numPlayers);

  const sendAction = (type: GameAction['type']) => {
    const action: GameAction = { type, playerIndex: index, bet };
    socket.emit('gameAction', action);
  };

  return (
    <div
      className={`flex flex-col items-center gap-2 p-3 border-2 min-w-[168px] transition-all duration-200 ${
        isMyTurn
          ? 'border-vice-cyan bg-vice-cyan/5 animate-glow-pulse'
          : isWinner
          ? 'border-vice-pink bg-vice-pink/5'
          : 'border-vice-surface bg-vice-surface'
      } ${!player.isActive ? 'opacity-40' : ''}`}
      style={
        !isMyTurn && !isWinner
          ? { boxShadow: '4px 4px 0 rgba(0,0,0,0.5)' }
          : undefined
      }
    >
      {/* Name row */}
      <div className="flex items-center gap-2 w-full justify-between">
        <span className="text-sm font-bold text-white tracking-wide uppercase truncate">
          {player.name}
          {isMe && <span className="ml-1 text-vice-cyan text-xs">(you)</span>}
        </span>
        {label && (
          <span className={`text-xs px-1.5 py-0.5 font-bold tracking-wider ${LABEL_COLORS[label] ?? ''}`}>
            {label}
          </span>
        )}
      </div>

      {/* Stack */}
      <p
        className="text-2xl font-bold tracking-wider w-full text-left"
        style={{ color: '#00D4FF', textShadow: isMyTurn ? '0 0 8px #00D4FF80' : 'none' }}
      >
        ${player.stack}
      </p>

      <Hand hand={player.cards} active={player.isActive} />

      {isWinner && (
        <span className="text-sm font-bold tracking-widest uppercase animate-winner-flash">
          ★ WINNER ★
        </span>
      )}

      {/* Action controls (only for me) */}
      {isMe && (
        <div className="flex flex-col items-stretch gap-2 mt-1 w-full">
          {/* Bet amount */}
          <div className="flex items-center gap-2 border border-vice-muted/30 px-2 py-1 bg-vice-bg">
            <label className="text-xs text-vice-muted uppercase tracking-wider whitespace-nowrap">Bet $</label>
            <input
              type="number"
              min={currentBet}
              max={player.stack}
              value={bet}
              disabled={!isMyTurn}
              onChange={(e) => setBet(Number.parseInt(e.target.value, 10))}
              className="flex-1 min-w-0 bg-transparent text-white text-sm text-right disabled:opacity-30 focus:outline-none"
            />
          </div>

          <button
            onClick={() => sendAction('raise')}
            disabled={!isMyTurn}
            className="w-full bg-vice-pink text-white text-xs py-2 font-bold tracking-widest uppercase btn-pixel disabled:opacity-30 hover:brightness-110"
          >
            RAISE ${bet}
          </button>
          <button
            onClick={() => sendAction('call')}
            disabled={!isMyTurn}
            className="w-full bg-vice-cyan text-vice-bg text-xs py-2 font-bold tracking-widest uppercase btn-pixel disabled:opacity-30 hover:brightness-110"
          >
            CHECK / CALL
          </button>
          <button
            onClick={() => sendAction('fold')}
            disabled={!isMyTurn}
            className="w-full bg-vice-surface border border-vice-muted/50 text-vice-muted text-xs py-2 font-bold tracking-widest uppercase btn-pixel disabled:opacity-30 hover:border-vice-pink hover:text-vice-pink transition-colors"
          >
            FOLD
          </button>
        </div>
      )}
    </div>
  );
}

export default Player;
