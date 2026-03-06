import { useState, useEffect } from 'react';
import Hand from './Hand';
import socket from '../socket';
import type { PlayerType, CardType } from '@pixelpoker/shared';
import type { GameAction } from '@pixelpoker/shared';

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
  bigBlind: number;
}

const TURN_SECONDS = 30;

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
  bigBlind,
}: Props) {
  const [bet, setBet] = useState(20);
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);

  const minRaise = currentBet + lastRaiseSize;

  const isMyTurn = isMe && actionOn === index && player.isActive;
  const isThisTurn = actionOn === index && player.isActive;
  const isWinner = winner.includes(index);
  const isBusted = player.stack === 0 && !player.isAllIn;

  // Other players' cards are hidden until showdown (server sends cards: [])
  const isHidden = !isMe && player.isActive && player.cards.length === 0;
  const displayCards = isHidden ? HIDDEN_CARDS : player.cards;
  const handActive = player.isActive && !isHidden;
  const label = seatLabel(index, dealer, numPlayers);

  // Reset bet to a sensible default when it becomes our turn
  useEffect(() => {
    if (isMyTurn) {
      setBet(Math.max(minRaise, currentBet * 2));
    }
  }, [isMyTurn]); // eslint-disable-line react-hooks/exhaustive-deps

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

  const sendAction = (type: GameAction['type']) => {
    const action: GameAction = { type, playerIndex: index, bet };
    socket.emit('gameAction', action);
  };

  const sendAllIn = () => {
    // bet = total commitment this round (what's already in + remaining stack)
    const allInBet = player.lastBet + player.stack;
    socket.emit('gameAction', { type: 'raise', playerIndex: index, bet: allInBet });
  };

  const actionColor = player.lastAction
    ? (player.lastAction.startsWith('RAISE') ? 'text-vice-gold' : (ACTION_COLORS[player.lastAction] ?? 'text-vice-muted'))
    : '';

  const timerPct = secondsLeft !== null ? (secondsLeft / TURN_SECONDS) * 100 : null;
  const timerColor =
    secondsLeft === null ? ''
    : secondsLeft > 10   ? 'bg-vice-cyan'
    : secondsLeft > 5    ? 'bg-vice-gold'
    : 'bg-vice-pink';

  return (
    <div
      className={`flex flex-col items-center gap-2 p-3 border-2 min-w-[168px] transition-all duration-200 ${
        isMyTurn
          ? 'border-vice-gold bg-vice-gold/5 animate-glow-pulse'
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
          {isMe && <span className="ml-1 text-vice-gold text-xs">(you)</span>}
        </span>
        <div className="flex items-center gap-1 shrink-0">
          {player.isAI && (
            <span className="text-xs px-1.5 py-0.5 font-bold tracking-wider bg-vice-violet/60 text-vice-cyan border border-vice-cyan/40">
              BOT
            </span>
          )}
          {label && (
            <span className={`text-xs px-1.5 py-0.5 font-bold tracking-wider ${LABEL_COLORS[label] ?? ''}`}>
              {label}
            </span>
          )}
        </div>
      </div>

      {/* Stack */}
      <p
        key={isWinner ? 'win' : 'base'}
        className={`text-2xl font-bold tracking-wider w-full text-left ${isWinner ? 'animate-card-deal' : ''}`}
        style={{ color: '#FFB800', textShadow: isMyTurn ? '0 0 8px #FFB80080' : 'none' }}
      >
        ${player.stack}
      </p>

      {/* All-in badge */}
      {player.isAllIn && player.isActive && (
        <p className="text-xs font-bold tracking-widest uppercase w-full text-left text-vice-gold animate-pulse">
          ALL IN
        </p>
      )}

      {/* Busted badge (for other players) */}
      {isBusted && !isMe && (
        <p className="text-xs font-bold tracking-widest uppercase w-full text-left text-vice-pink">
          BUSTED
        </p>
      )}

      {/* Last action — shown for other players when not actively their turn */}
      {!isMe && player.lastAction && !isThisTurn && !player.isAllIn && (
        <p className={`text-xs font-bold tracking-widest uppercase w-full text-left ${actionColor}`}>
          {player.lastAction}
        </p>
      )}

      <Hand
        hand={displayCards}
        active={handActive}
        winnerCardValues={isWinner && winnerCards.length > 0 ? winnerCards : undefined}
      />

      {/* Turn timer */}
      {isThisTurn && timerPct !== null && (
        <div className="w-full flex flex-col gap-0.5">
          <div className="w-full h-1.5 bg-vice-bg rounded-none overflow-hidden">
            <div
              className={`h-full transition-all duration-500 ${timerColor}`}
              style={{ width: `${timerPct}%` }}
            />
          </div>
          <span className="text-xs text-vice-muted tracking-widest text-right">
            {secondsLeft}s
          </span>
        </div>
      )}

      {isWinner && (
        <div className="flex flex-col items-center gap-0.5 mt-1">
          <span className="text-sm font-bold tracking-widest uppercase animate-winner-flash">
            ★ WINNER ★
          </span>
          {winnerHandName && (
            <span className="text-xs text-vice-gold/80 tracking-widest uppercase">
              {winnerHandName}
            </span>
          )}
        </div>
      )}

      {/* Rebuy controls (only for me when busted) */}
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

      {/* Action controls (only for me when not busted) */}
      {isMe && !isBusted && (
        <div className="flex flex-col items-stretch gap-2 mt-1 w-full">
          {/* Bet slider */}
          {(() => {
            const sliderMin = minRaise;
            const sliderMax = Math.max(minRaise, player.lastBet + player.stack);
            const fillPct = sliderMax === sliderMin ? 100 : ((bet - sliderMin) / (sliderMax - sliderMin)) * 100;
            return (
              <div className="flex flex-col gap-1 border border-vice-muted/30 px-2 py-2 bg-vice-bg">
                {/* Label + value */}
                <div className="flex items-center justify-between">
                  <span className="text-xs text-vice-muted uppercase tracking-wider">Bet</span>
                  <span className="text-vice-gold font-bold tracking-wider text-sm">${bet}</span>
                </div>
                {/* Slider + stepper buttons */}
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setBet(Math.max(sliderMin, bet - bigBlind))}
                    disabled={!isMyTurn}
                    className="text-vice-muted text-base w-6 h-6 flex items-center justify-center border border-vice-muted/30 bg-vice-surface hover:border-vice-gold hover:text-vice-gold disabled:opacity-30 transition-colors select-none shrink-0"
                  >
                    −
                  </button>
                  <input
                    type="range"
                    min={sliderMin}
                    max={sliderMax}
                    value={bet}
                    disabled={!isMyTurn}
                    onChange={(e) => setBet(Number.parseInt(e.target.value, 10))}
                    className="bet-slider flex-1 disabled:opacity-30"
                    style={{
                      background: `linear-gradient(to right, #7B2FBE 0%, #7B2FBE ${fillPct}%, #1a2035 ${fillPct}%, #1a2035 100%)`,
                    }}
                  />
                  <button
                    onClick={() => setBet(Math.min(sliderMax, bet + bigBlind))}
                    disabled={!isMyTurn}
                    className="text-vice-muted text-base w-6 h-6 flex items-center justify-center border border-vice-muted/30 bg-vice-surface hover:border-vice-gold hover:text-vice-gold disabled:opacity-30 transition-colors select-none shrink-0"
                  >
                    +
                  </button>
                </div>
              </div>
            );
          })()}

          {/* 2×2 action grid */}
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => sendAction('call')}
              disabled={!isMyTurn}
              className="bg-vice-cyan text-vice-bg text-xs py-3 min-h-[44px] font-bold tracking-widest uppercase btn-pixel disabled:opacity-30 hover:brightness-110 truncate px-1"
            >
              {currentBet - player.lastBet === 0 ? 'CHECK' : `CALL $${currentBet - player.lastBet}`}
            </button>
            <button
              onClick={() => sendAction('fold')}
              disabled={!isMyTurn}
              className="bg-vice-surface border border-vice-muted/50 text-vice-muted text-xs py-3 min-h-[44px] font-bold tracking-widest uppercase btn-pixel disabled:opacity-30 hover:border-vice-pink hover:text-vice-pink transition-colors"
            >
              FOLD
            </button>
            <button
              onClick={() => sendAction('raise')}
              disabled={!isMyTurn}
              className="bg-vice-pink text-white text-xs py-3 min-h-[44px] font-bold tracking-widest uppercase btn-pixel disabled:opacity-30 hover:brightness-110 truncate px-1"
            >
              RAISE ${bet}
            </button>
            <button
              onClick={sendAllIn}
              disabled={!isMyTurn || player.stack === 0}
              className="bg-vice-gold text-vice-bg text-xs py-3 min-h-[44px] font-bold tracking-widest uppercase btn-pixel disabled:opacity-30 hover:brightness-110 truncate px-1"
            >
              ALL IN ${player.lastBet + player.stack}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default Player;
