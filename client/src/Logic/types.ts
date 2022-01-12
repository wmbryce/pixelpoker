export interface Poker {
  stage: number;
  pot: number;
  tableCards: Array<CardType>;
  deck: Array<CardType>;
  players: Array<PlayerType>;
  winner: any;
  actionOn: number;
  dealer: number;
}

export interface PlayerType {
  name: string;
  stack: number;
  cards: Array<CardType>;
  isActive: boolean;
}

export interface CardType {
  suite: string;
  label: string;
  value: number;
}

export const gameStages = [
  "pre-flop",
  "flop",
  "turn",
  "river",
  "Finish",
  "Reset",
];
