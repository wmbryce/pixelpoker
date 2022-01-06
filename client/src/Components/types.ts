export interface CardType {
  suite: string;
  label: string;
  value: number;
}

export interface PlayerType {
  name: string;
  stack: string;
  hand: Array<CardType>;
}
