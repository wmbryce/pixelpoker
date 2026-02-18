import type { CardType } from '@pixelpoker/shared';

interface Props {
  card: CardType | null;
}

const SUITE_ICONS: Record<string, string> = {
  s: '♠',
  h: '♥',
  c: '♣',
  d: '♦',
};

function Card({ card }: Props) {
  if (!card) {
    return <div className="border border-red-600 rounded w-16 h-24 bg-red-600 mx-1.5" />;
  }

  const isRed = card.suite === 'h' || card.suite === 'd';

  return (
    <div className="border border-gray-400 rounded w-16 h-24 flex flex-col justify-center items-center bg-white mx-1.5 shadow-sm">
      <span className={`text-lg font-bold ${isRed ? 'text-red-600' : 'text-gray-900'}`}>
        {SUITE_ICONS[card.suite]}
      </span>
      <span className={`text-sm font-semibold ${isRed ? 'text-red-600' : 'text-gray-900'}`}>
        {card.label}
      </span>
    </div>
  );
}

export default Card;
