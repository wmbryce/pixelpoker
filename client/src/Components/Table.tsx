import Hand from './Hand';
import type { CardType } from '@pixelpoker/shared';

interface Props {
  tableCards: CardType[];
  pot: number;
  currentBet: number;
}

function Table({ tableCards, pot, currentBet }: Props) {
  return (
    <div className="mx-16 mb-5">
      <p className="text-xs font-bold mb-2 tracking-widest uppercase text-vice-muted/70">
        ◈ TABLE
      </p>
      <div
        className="h-52 flex flex-col justify-center items-center border-2 border-vice-cyan/40 p-4 gap-4 table-grid relative"
        style={{ boxShadow: '0 0 24px #00D4FF18, inset 0 0 40px rgba(0,0,0,0.4)' }}
      >
        <Hand hand={tableCards} active={true} />

        <div className="flex items-center gap-8">
          <div className="flex flex-col items-center">
            <span className="text-xs text-vice-muted/70 tracking-widest uppercase">Pot</span>
            <span
              className="text-vice-cyan text-2xl font-bold tracking-wider"
              style={{ textShadow: '0 0 10px #00D4FF80' }}
            >
              ${pot}
            </span>
          </div>
          <div className="w-px h-8 bg-vice-violet/40" />
          <div className="flex flex-col items-center">
            <span className="text-xs text-vice-muted/70 tracking-widest uppercase">Bet</span>
            <span className="text-vice-muted text-2xl font-semibold tracking-wider">${currentBet}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

export default Table;
