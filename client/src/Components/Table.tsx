import { Fragment, useRef } from 'react';
import Hand from './Hand';
import type { CardType, PlayerType } from '@pixelpoker/shared';

function computeSidePots(players: PlayerType[]): number[] {
  const active = players.filter((p) => p.contributed > 0);
  if (active.length === 0) return [];

  const levels = [...new Set(active.map((p) => p.contributed))].sort((a, b) => a - b);
  const amounts: number[] = [];
  let prev = 0;

  for (const level of levels) {
    const eligible = players.filter((p) => p.contributed >= level).length;
    const amount = (level - prev) * eligible;
    if (amount > 0) amounts.push(amount);
    prev = level;
  }

  return amounts;
}

function potLabel(i: number, total: number): string {
  if (i === 0) return 'Main Pot';
  return total === 2 ? 'Side Pot' : `Side Pot ${i}`;
}

function Divider() {
  return <div className="w-px h-8 bg-vice-violet/40" />;
}

interface StatProps {
  label: string;
  value: React.ReactNode;
  valueClass?: string;
  valueStyle?: React.CSSProperties;
}

function Stat({ label, value, valueClass = '', valueStyle }: StatProps) {
  return (
    <div className="flex flex-col items-center">
      <span className="text-xs text-vice-muted/70 tracking-widest uppercase">{label}</span>
      <span className={valueClass} style={valueStyle}>{value}</span>
    </div>
  );
}

const GOLD_STYLE: React.CSSProperties = { textShadow: '0 0 10px #FFB80080' };

interface Props {
  tableCards: CardType[];
  pot: number;
  currentBet: number;
  winnerCards: string[];
  smallBlind: number;
  bigBlind: number;
  players: PlayerType[];
  stage: number;
  winner: number[];
}

function Table({ tableCards, pot, currentBet, winnerCards, smallBlind, bigBlind, players, stage, winner }: Props) {
  const lastPotRef = useRef(0);
  if (pot > 0) lastPotRef.current = pot;

  const isAwarded = winner.length > 0 && pot === 0 && lastPotRef.current > 0;
  const sidePots = computeSidePots(players);
  const showSidePots = sidePots.length > 1 && stage >= 1 && stage <= 4 && players.some((p) => p.isAllIn);

  return (
    <div className="mx-3 mb-4 sm:mx-16 sm:mb-5">
      <p className="text-xs font-bold mb-2 tracking-widest uppercase text-vice-muted/70">
        ◈ TABLE
      </p>
      <div
        className="min-h-[140px] sm:h-52 flex flex-col justify-center items-center border-2 border-vice-gold/30 p-3 gap-3 sm:p-4 sm:gap-4 table-grid relative"
        style={{ boxShadow: '0 0 24px #FFB80015, inset 0 0 40px rgba(0,0,0,0.4)' }}
      >
        <Hand
          hand={tableCards}
          active={true}
          winnerCardValues={winnerCards.length > 0 ? winnerCards : undefined}
        />

        <div className="flex items-center flex-wrap justify-center gap-3 sm:gap-6">
          {showSidePots ? (
            sidePots.map((amount, i) => (
              <Fragment key={i}>
                {i > 0 && <Divider />}
                <Stat
                  label={potLabel(i, sidePots.length)}
                  value={`$${amount}`}
                  valueClass="text-vice-gold text-2xl font-bold tracking-wider"
                  valueStyle={GOLD_STYLE}
                />
              </Fragment>
            ))
          ) : (
            <Stat
              label={isAwarded ? 'Awarded' : 'Pot'}
              value={`$${isAwarded ? lastPotRef.current : pot}`}
              valueClass={`text-vice-gold text-2xl font-bold tracking-wider ${isAwarded ? 'animate-pot-award' : ''}`}
              valueStyle={GOLD_STYLE}
            />
          )}

          <Divider />
          <Stat
            label="Bet"
            value={`$${currentBet}`}
            valueClass="text-vice-muted text-2xl font-semibold tracking-wider"
          />
          <Divider />
          <Stat
            label="Blinds"
            value={<>${smallBlind}<span className="text-vice-violet/60 mx-0.5">/</span>${bigBlind}</>}
            valueClass="text-vice-muted text-lg font-semibold tracking-wider"
          />
        </div>
      </div>
    </div>
  );
}

export default Table;
