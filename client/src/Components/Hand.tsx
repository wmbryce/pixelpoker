import Card from './Card';
import type { CardType } from '@pixelpoker/shared';

interface Props {
  hand: CardType[];
  active?: boolean;
}

function Hand({ hand = [], active }: Props) {
  return (
    <div className="flex flex-row items-center justify-center">
      {hand.map((card, index) => (
        <Card key={index} card={active ? card : null} />
      ))}
    </div>
  );
}

export default Hand;
