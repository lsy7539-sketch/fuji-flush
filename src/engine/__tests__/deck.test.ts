import { describe, expect, it } from "vitest";
import { createDeck, TOTAL_DECK_SIZE } from "../deck";
import { createGame, getInitialHandSize } from "../gameEngine";

describe("createDeck", () => {
  it("총 90장의 카드를 생성하고 10/13/17/18/19는 존재하지 않는다", () => {
    const deck = createDeck();
    expect(deck).toHaveLength(90);
    expect(TOTAL_DECK_SIZE).toBe(90);

    const forbidden = [10, 13, 17, 18, 19];
    for (const value of forbidden) {
      expect(deck.some((c) => c.value === value)).toBe(false);
    }

    const counts: Record<number, number> = {};
    for (const c of deck) counts[c.value] = (counts[c.value] ?? 0) + 1;
    expect(counts).toEqual({
      2: 10, 3: 9, 4: 8, 5: 8, 6: 8, 7: 7, 8: 7, 9: 7,
      11: 6, 12: 5, 14: 4, 15: 4, 16: 4, 20: 3,
    });

    const ids = new Set(deck.map((c) => c.id));
    expect(ids.size).toBe(90); // 모든 카드는 고유 ID를 가진다.
  });
});

describe("getInitialHandSize", () => {
  it("3~6명이면 6장, 7~8명이면 5장을 나눠준다", () => {
    for (let n = 3; n <= 6; n++) expect(getInitialHandSize(n)).toBe(6);
    for (let n = 7; n <= 8; n++) expect(getInitialHandSize(n)).toBe(5);
  });

  it("2명 이하 또는 9명 이상이면 오류를 던진다", () => {
    expect(() => getInitialHandSize(2)).toThrow();
    expect(() => getInitialHandSize(9)).toThrow();
  });
});

describe("createGame", () => {
  it("플레이어에게 손패를 나눠주고 나머지는 드로우 덱에 남긴다", () => {
    const players = ["A", "B", "C", "D"].map((id) => ({ id, name: id }));
    const state = createGame(players, { shuffle: (deck) => deck }); // 셔플 없이 결정론적으로 검증

    for (const p of state.players) {
      expect(p.hand).toHaveLength(6);
    }
    expect(state.drawPile).toHaveLength(90 - 4 * 6);
    expect(state.discardPile).toEqual([]);
    expect(state.activeCards).toEqual([]);
    expect(state.gameStatus).toBe("IN_PROGRESS");
  });
});
