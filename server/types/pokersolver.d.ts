// pokersolver ships no type definitions. It was previously pulled in with
// `require()`, which esbuild cannot emit inside the ESM bundle Workers needs,
// so it is imported as a default (CommonJS interop) against this declaration.
declare module 'pokersolver' {
  export interface SolvedCard {
    value: string;
    suit: string;
  }

  export interface SolvedHand {
    /** Hand category, e.g. "Straight Flush", "Two Pair" */
    name: string;
    /** Full description, e.g. "Royal Flush" */
    descr: string;
    /** 1 (high card) – 9 (straight flush) */
    rank: number;
    cards: SolvedCard[];
  }

  export interface HandStatic {
    solve(cards: string[], game?: string, canDisqualify?: boolean): SolvedHand;
    winners(hands: SolvedHand[]): SolvedHand[];
  }

  const pokersolver: { Hand: HandStatic };
  export default pokersolver;
}
