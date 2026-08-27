import { describe, expect, it } from "vitest";
import { createDeck, TOTAL_DECK_SIZE } from "../deck";
import { createGame, getInitialHandSize } from "../gameEngine";

describe("createDeck", () => {
  it("총 90장의 카드를 생성하고 2~20 모든 숫자가 최소 한 장씩 존재한다 (RULES.md 2장)", () => {
    const deck = createDeck();
    expect(deck).toHaveLength(90);
    expect(TOTAL_DECK_SIZE).toBe(90);

    const counts: Record<number, number> = {};
    for (const c of deck) counts[c.value] = (counts[c.value] ?? 0) + 1;
    expect(counts).toEqual({
      2: 16, 3: 12, 4: 9, 5: 8, 6: 6, 7: 6, 8: 5, 9: 4, 10: 4, 11: 4,
      12: 3, 13: 3, 14: 3, 15: 2, 16: 1, 17: 1, 18: 1, 19: 1, 20: 1,
    });

    // 16~20은 공식 설명서 기준 각각 정확히 한 장씩만 존재한다.
    for (const rare of [16, 17, 18, 19, 20]) {
      expect(counts[rare]).toBe(1);
    }

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
