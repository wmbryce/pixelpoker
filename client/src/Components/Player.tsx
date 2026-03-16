import { useState, useEffect } from 'react';
import Hand from './Hand';
import TimerBar from './TimerBar';
import ActionControls from './ActionControls';
import socket from '../socket';
import type { PlayerType, CardType } from '@pixelpoker/shared';

// Two placeholder entries so Hand renders face-down cards for hidden hands
const HIDDEN_CARDS: CardType[] = [
  { suite: '', value: '', label: '' },
  { suite: '', value: '', label: '' },
];

interface Props {
  player: PlayerType;
  index: number;
  dealer: number;
  winner: number[];
  winnerHandName: string;
  winnerCards: string[];
  actionOn: number;
  currentBet: number;
  lastRaiseSize: number;
  numPlayers: number;
  isMe: boolean;
  timerDeadline: number | null;
  pot: number;
  isFolding?: boolean;
  isRevealing?: boolean;
  compact?: boolean;
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

const ACTION_COLORS: Record<string, string> = {
  FOLD:  'text-vice-pink',
  CHECK: 'text-vice-muted',
  CALL:  'text-vice-cyan',
};

function Player({
  player,
  index,
  dealer,
  winner,
  winnerHandName,
  winnerCards,
  actionOn,
  currentBet,
  lastRaiseSize,
  numPlayers,
  isMe,
  timerDeadline,
  pot,
  isFolding = false,
  isRevealing = false,
  compact = false,
}: Props) {
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);

  const isMyTurn = isMe && actionOn === index && player.isActive;
  const isThisTurn = actionOn === index && player.isActive;
  const isWinner = winner.includes(index);
  const isBusted = player.stack === 0 && !player.isAllIn;

  const isHidden = !isMe && player.isActive && player.cards.length === 0;
  const displayCards = isHidden ? HIDDEN_CARDS : player.cards;
  const handActive = player.isActive && !isHidden;
  const label = seatLabel(index, dealer, numPlayers);

  useEffect(() => {
    if (timerDeadline === null) {
      setSecondsLeft(null);
      return;
    }

    const tick = () => {
      const left = Math.ceil((timerDeadline - Date.now()) / 1000);
      setSecondsLeft(Math.max(0, left));
    };

    tick();
    const id = setInterval(tick, 500);
    return () => clearInterval(id);
  }, [timerDeadline]);

  const actionColor = player.lastAction
    ? (player.lastAction.startsWith('RAISE') ? 'text-vice-gold' : (ACTION_COLORS[player.lastAction] ?? 'text-vice-muted'))
    : '';

  return (
    <div className="flex flex-col items-center gap-1">
      {/* Player card */}
      <div
        className={`flex flex-col items-center gap-1.5 p-2 border-2 transition-all duration-200 ${
          compact ? 'min-w-[130px]' : 'min-w-[168px]'
        } ${
          isMyTurn
            ? 'border-vice-gold bg-vice-gold/5 animate-glow-pulse'
            : isWinner
            ? 'border-vice-pink bg-vice-pink/5'
            : isThisTurn
            ? 'border-vice-cyan/60 bg-vice-cyan/5'
            : 'border-vice-surface bg-vice-surface'
        } ${!player.isActive ? 'opacity-40' : ''}`}
        style={
          !isMyTurn && !isWinner && !isThisTurn
            ? { boxShadow: '4px 4px 0 rgba(0,0,0,0.5)' }
            : undefined
        }
      >
        {isWinner ? (
          <>
            <span className={`font-bold tracking-widest uppercase animate-winner-flash ${compact ? 'text-xs' : 'text-sm'}`}>
              ★ {player.name} ★
            </span>
            {winnerHandName && (
              <span className="text-vice-gold/80 tracking-widest uppercase" style={{ fontSize: '0.6rem' }}>
                {winnerHandName}
              </span>
            )}
            <p
              key="win"
              className={`font-bold tracking-wider w-full text-center animate-stack-win ${compact ? 'text-lg' : 'text-2xl'}`}
              style={{ color: '#FFB800' }}
            >
              ${player.stack}
            </p>
          </>
        ) : (
          <>
            {/* Name row */}
            <div className="flex items-center gap-1.5 w-full justify-between">
              <span className={`font-bold text-white tracking-wide uppercase truncate ${compact ? 'text-xs' : 'text-sm'}`}>
                {player.name}
                {isMe && <span className="ml-1 text-vice-gold text-xs">(you)</span>}
              </span>
              <div className="flex items-center gap-1 shrink-0">
                {player.isAI && (
                  <span className="text-xs px-1 py-0.5 font-bold tracking-wider bg-vice-violet/60 text-vice-cyan border border-vice-cyan/40" style={{ fontSize: '0.6rem' }}>
                    BOT
                  </span>
                )}
                {label && (
                  <span className={`px-1 py-0.5 font-bold tracking-wider ${LABEL_COLORS[label] ?? ''}`} style={{ fontSize: '0.6rem' }}>
                    {label}
                  </span>
                )}
              </div>
            </div>

            {/* Stack */}
            <p
              key="base"
              className={`font-bold tracking-wider w-full text-left ${compact ? 'text-lg' : 'text-2xl'}`}
              style={{ color: '#FFB800', textShadow: isMyTurn ? '0 0 8px #FFB80080' : 'none' }}
            >
              ${player.stack}
            </p>

            {/* Status badges */}
            {player.isAllIn && player.isActive && (
              <p className="text-xs font-bold tracking-widest uppercase w-full text-left text-vice-gold animate-pulse" style={{ fontSize: '0.6rem' }}>
                ALL IN
              </p>
            )}
            {isBusted && !isMe && (
              <p className="text-xs font-bold tracking-widest uppercase w-full text-left text-vice-pink" style={{ fontSize: '0.6rem' }}>
                BUSTED
              </p>
            )}
            {!isMe && player.lastAction && !isThisTurn && !player.isAllIn && (
              <p className={`font-bold tracking-widest uppercase w-full text-left ${actionColor}`} style={{ fontSize: '0.6rem' }}>
                {player.lastAction}
              </p>
            )}
          </>
        )}

        <Hand
          hand={displayCards}
          active={handActive}
          winnerCardValues={isWinner && winnerCards.length > 0 ? winnerCards : undefined}
          animationType={isFolding ? 'fold-toss' : isRevealing ? 'flip' : undefined}
        />

        {isThisTurn && secondsLeft !== null && (
          <TimerBar secondsLeft={secondsLeft} compact={compact} />
        )}
      </div>

      {/* Action controls */}
      {isMe && !isBusted && (
        <ActionControls
          playerIndex={index}
          isMyTurn={isMyTurn}
          currentBet={currentBet}
          lastBet={player.lastBet}
          lastRaiseSize={lastRaiseSize}
          stack={player.stack}
          pot={pot}
        />
      )}

      {/* Rebuy */}
      {isMe && isBusted && (
        <div className="flex flex-col items-stretch gap-2 mt-1 w-full">
          <p className="text-vice-pink text-xs font-bold tracking-widest uppercase text-center animate-pulse">
            BUSTED
          </p>
          <button
            onClick={() => socket.emit('rebuy', { amount: 1000 })}
            className="w-full bg-vice-gold text-vice-bg text-xs py-2 font-bold tracking-widest uppercase btn-pixel hover:brightness-110"
          >
            RE-BUY $1000
          </button>
        </div>
      )}
    </div>
  );
}

export default Player;
