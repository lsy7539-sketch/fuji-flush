import type { Card } from "./types";

const VALUE_COUNTS: Record<number, number> = {
  2: 16,
  3: 12,
  4: 9,
  5: 8,
  6: 6,
  7: 6,
  8: 5,
  9: 4,
  10: 4,
  11: 4,
  12: 3,
  13: 3,
  14: 3,
  15: 2,
  16: 1,
  17: 1,
  18: 1,
  19: 1,
  20: 1,
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
