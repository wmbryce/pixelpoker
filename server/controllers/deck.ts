import type { CardType } from './types';

const SUITES = ['c', 'h', 's', 'd'] as const;
const LABELS = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];

const shuffle = (array: CardType[]): CardType[] => {
  const result = array.slice();
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
};

export const generateDeck = (): CardType[] => {
  const deck = SUITES.flatMap((suite) =>
    LABELS.map((label) => ({
      suite,
      // pokersolver expects e.g. "Ac", "2h", "10s"
      value: label + suite,
      label,
    }))
  );
  // Three independent shuffles for good randomisation
  return shuffle(shuffle(shuffle(deck)));
};
