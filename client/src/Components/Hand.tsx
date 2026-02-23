import Card from './Card';
import type { CardType } from '@pixelpoker/shared';

interface Props {
  hand: CardType[];
  active?: boolean;
  winnerCardValues?: string[];
}

function Hand({ hand = [], active, winnerCardValues }: Props) {
  return (
    <div className="flex flex-row items-center justify-center">
      {hand.map((card, index) => {
        const highlighted = winnerCardValues
          ? winnerCardValues.includes(card.value)
          : undefined;
        return (
          <Card key={index} card={active ? card : null} highlighted={highlighted} />
        );
      })}
    </div>
  );
}

export default Hand;
