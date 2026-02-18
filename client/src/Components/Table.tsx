import Hand from './Hand';
import type { CardType } from '@pixelpoker/shared';

interface Props {
  tableCards: CardType[];
  pot: number;
  currentBet: number;
}

function Table({ tableCards, pot, currentBet }: Props) {
  return (
    <div className="mx-24 mb-5">
      <h1 className="text-xl font-bold mb-2">Table</h1>
      <div className="h-48 flex flex-col justify-center items-center bg-green-600 rounded-3xl p-4 gap-3">
        <Hand hand={tableCards} active={true} />
        <p className="text-white font-semibold text-lg">Pot: ${pot}</p>
        <p className="text-white text-sm">Current bet: ${currentBet}</p>
      </div>
    </div>
  );
}

export default Table;
