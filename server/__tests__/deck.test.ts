import { describe, it, expect } from 'bun:test';
import { generateDeck } from '../controllers/deck';

describe('generateDeck', () => {
  it('returns 52 cards', () => {
    const deck = generateDeck();
    expect(deck.length).toBe(52);
  });

  it('all cards have a suite, label, and value', () => {
    const deck = generateDeck();
    for (const card of deck) {
      expect(card.suite).toBeTruthy();
      expect(card.label).toBeTruthy();
      expect(card.value).toBeTruthy();
    }
  });

  it('all card values are unique', () => {
    const deck = generateDeck();
    const values = deck.map((c) => c.value);
    const unique = new Set(values);
    expect(unique.size).toBe(52);
  });

  it('card values follow pokersolver format (label + suite)', () => {
    const deck = generateDeck();
    for (const card of deck) {
      expect(card.value).toBe(card.label + card.suite);
    }
  });

  it('produces different orderings on successive calls', () => {
    const deck1 = generateDeck();
    const deck2 = generateDeck();
    // Statistically extremely unlikely to be identical
    const same = deck1.every((c, i) => c.value === deck2[i].value);
    expect(same).toBe(false);
  });
});
