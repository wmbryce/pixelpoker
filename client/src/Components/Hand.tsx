import Card from './Card';
import type { CardType } from '@pixelpoker/shared';

interface Props {
  hand: CardType[];
  active?: boolean;
  winnerCardValues?: string[];
  staggerDelayMs?: number;
  animationType?: 'deal' | 'flip' | 'fold-toss' | 'none';
}

function Hand({ hand = [], active, winnerCardValues, staggerDelayMs = 0, animationType }: Props) {
  return (
    <div className="flex flex-row items-center justify-center">
      {hand.map((card, index) => {
        const highlighted = winnerCardValues
          ? winnerCardValues.includes(card.value)
          : undefined;
        return (
          <Card
            key={index}
            card={active ? card : null}
            highlighted={highlighted}
            animationDelay={staggerDelayMs ? index * staggerDelayMs : 0}
            animationType={animationType}
          />
        );
      })}
    </div>
  );
}

export default Hand;
