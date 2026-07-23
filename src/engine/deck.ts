import type { Card } from "./types";

const VALUE_COUNTS: Record<number, number> = {
  2: 10,
  3: 9,
  4: 8,
  5: 8,
  6: 8,
  7: 7,
  8: 7,
  9: 7,
  11: 6,
  12: 5,
  14: 4,
  15: 4,
  16: 4,
  20: 3,
};

export const TOTAL_DECK_SIZE = Object.values(VALUE_COUNTS).reduce((a, b) => a + b, 0);

export function createDeck(): Card[] {
  const deck: Card[] = [];
  for (const [valueStr, count] of Object.entries(VALUE_COUNTS)) {
    const value = Number(valueStr);
    for (let i = 1; i <= count; i++) {
      deck.push({ id: `card-${value}-${i}`, value });
    }
  }
  return deck;
}

export function shuffleDeck(deck: Card[], rng: () => number = Math.random): Card[] {
  const shuffled = [...deck];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}
