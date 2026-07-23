import { describe, expect, it } from "vitest";
import type { ActiveCard, Card, GameState, Player } from "../types";
import { getActiveGroups, playCard } from "../gameEngine";

function card(id: string, value: number): Card {
  return { id, value };
}

function player(id: string, hand: Card[] = [], isWinner = false): Player {
  return { id, name: id, hand, isWinner };
}

function active(playerId: string, value: number, cardId?: string): ActiveCard {
  return {
    cardId: cardId ?? `${playerId}-active-${value}`,
    playerId,
    value,
    playedAtTurn: 0,
    groupId: null,
  };
}

function makeState(overrides: Partial<GameState>): GameState {
  return {
    players: [],
    drawPile: [],
    discardPile: [],
    currentPlayerIndex: 0,
    gameStatus: "IN_PROGRESS",
    round: 1,
    activeCards: [],
    turnCounter: 0,
    ...overrides,
  };
}

describe("높은 카드가 낮은 카드를 플러시하는 경우", () => {
  it("새로 낸 카드보다 낮은 기존 카드를 플러시하고, 소유자는 드로우한다", () => {
    const state = makeState({
      players: [player("A", []), player("B", [card("b-8", 8)])],
      activeCards: [active("A", 5, "a-5")],
      drawPile: [card("draw-1", 2)],
      currentPlayerIndex: 1,
    });

    const next = playCard(state, "B", "b-8");

    expect(next.activeCards.map((ac) => ac.cardId)).toEqual(["b-8"]);
    expect(next.discardPile).toEqual([{ id: "a-5", value: 5 }]);
    expect(next.players.find((p) => p.id === "A")!.hand).toEqual([card("draw-1", 2)]);
  });
});

describe("같은 숫자 카드 2장이 Joining Forces하는 경우", () => {
  it("두 장이 하나의 그룹으로 합쳐지고 총합이 10이 된다", () => {
    const state = makeState({
      players: [player("A", []), player("B", [card("b-5", 5)])],
      activeCards: [active("A", 5, "a-5")],
      currentPlayerIndex: 1,
    });

    const next = playCard(state, "B", "b-5");
    const groups = getActiveGroups(next.activeCards);

    expect(groups).toHaveLength(1);
    expect(groups[0]).toMatchObject({ value: 5, totalValue: 10, groupId: "group-5" });
    expect(groups[0].cards.map((c) => c.cardId).sort()).toEqual(["a-5", "b-5"]);
  });
});

describe("같은 숫자 카드 3장 이상이 Joining Forces하는 경우", () => {
  it("세 장이 합쳐져 총합 15의 그룹이 된다", () => {
    const state = makeState({
      players: [player("A", []), player("B", []), player("C", [card("c-5", 5)])],
      activeCards: [active("A", 5, "a-5"), active("B", 5, "b-5")],
      currentPlayerIndex: 2,
    });

    const next = playCard(state, "C", "c-5");
    const groups = getActiveGroups(next.activeCards);

    expect(groups).toHaveLength(1);
    expect(groups[0].totalValue).toBe(15);
    expect(groups[0].cards).toHaveLength(3);
  });
});

describe("조합의 합보다 낮은 카드가 플러시되는 경우", () => {
  it("5+5+5=15 조합이 12를 플러시한다", () => {
    const state = makeState({
      players: [
        player("A", []),
        player("B", []),
        player("C", [card("c-5", 5)]),
        player("D", []),
      ],
      activeCards: [active("A", 5, "a-5"), active("B", 5, "b-5"), active("D", 12, "d-12")],
      drawPile: [card("draw-1", 2)],
      currentPlayerIndex: 2,
    });

    const next = playCard(state, "C", "c-5");

    expect(next.activeCards.some((ac) => ac.cardId === "d-12")).toBe(false);
    expect(next.discardPile).toContainEqual({ id: "d-12", value: 12 });
    const group = getActiveGroups(next.activeCards).find((g) => g.value === 5)!;
    expect(group.totalValue).toBe(15);
  });
});

describe("조합의 총합과 같은 숫자의 카드가 조합에 추가되지 않는 경우", () => {
  it("4+4=8 조합에 단독 8 카드가 병합되지 않고 별도 그룹으로 남는다", () => {
    const state = makeState({
      players: [player("A", []), player("B", []), player("C", [card("c-8", 8)])],
      activeCards: [active("A", 4, "a-4"), active("B", 4, "b-4")],
      currentPlayerIndex: 2,
    });

    const next = playCard(state, "C", "c-8");
    const groups = getActiveGroups(next.activeCards).sort((a, b) => a.value - b.value);

    expect(groups).toHaveLength(2);
    expect(groups[0]).toMatchObject({ value: 4, totalValue: 8, groupId: "group-4" });
    expect(groups[1]).toMatchObject({ value: 8, totalValue: 8, groupId: null });
    // 둘 다 총합이 같으므로(8 === 8, 더 낮지 않음) 어느 쪽도 플러시되지 않는다.
    expect(next.activeCards).toHaveLength(3);
  });
});

describe("플러시된 플레이어가 카드를 드로우하는 경우", () => {
  it("플러시된 카드의 소유자만 드로우 덱에서 1장 받는다", () => {
    const state = makeState({
      players: [player("A", [card("a-old", 99)]), player("B", [card("b-9", 9)])],
      activeCards: [active("A", 3, "a-3")],
      drawPile: [card("draw-1", 6)],
      currentPlayerIndex: 1,
    });

    const next = playCard(state, "B", "b-9");

    const a = next.players.find((p) => p.id === "A")!;
    expect(a.hand).toEqual([card("a-old", 99), card("draw-1", 6)]);
    expect(next.drawPile).toEqual([]);
  });
});

describe("카드가 다음 자신의 턴까지 살아남아 Pushed Through되는 경우", () => {
  it("살아남은 기존 카드는 드로우 없이 버림 더미로 가고, 손패에서 새 카드를 낸다", () => {
    const state = makeState({
      players: [player("A", [card("a-3", 3), card("a-12", 12)]), player("B", [])],
      activeCards: [active("A", 7, "a-7")],
      drawPile: [card("draw-1", 6)],
      currentPlayerIndex: 0,
    });

    const next = playCard(state, "A", "a-12");

    expect(next.discardPile).toContainEqual({ id: "a-7", value: 7 });
    // Pushed Through는 드로우를 유발하지 않으므로 drawPile은 그대로다.
    expect(next.drawPile).toEqual([card("draw-1", 6)]);
    const a = next.players.find((p) => p.id === "A")!;
    expect(a.hand).toEqual([card("a-3", 3)]);
    expect(next.activeCards).toEqual([
      { cardId: "a-12", playerId: "A", value: 12, playedAtTurn: 1, groupId: null },
    ]);
  });
});

describe("Joining Forces에 참여한 카드들이 Pushed Through되는 경우", () => {
  it("그룹에 속한 카드도 각자 자신의 턴에 개별적으로 Pushed Through된다", () => {
    const state = makeState({
      players: [player("A", [card("a-3", 3)]), player("B", [card("b-2", 2)])],
      activeCards: [active("A", 5, "a-5"), active("B", 5, "b-5")],
      drawPile: [card("draw-1", 6), card("draw-2", 7)],
      currentPlayerIndex: 0,
    });

    // A의 차례: A의 5가 그룹에 속해 있었지만 살아남았으므로 Pushed Through.
    // 이어서 내는 3은 5보다 낮으므로 아무것도 플러시하지 않는다.
    const afterA = playCard(state, "A", "a-3");
    expect(afterA.discardPile).toContainEqual({ id: "a-5", value: 5 });
    expect(afterA.drawPile).toEqual([card("draw-1", 6), card("draw-2", 7)]); // 드로우 없음
    // 남은 B의 5는 이제 혼자이므로 그룹이 해체된다.
    expect(getActiveGroups(afterA.activeCards).find((g) => g.value === 5)).toMatchObject({
      groupId: null,
      totalValue: 5,
    });

    // B의 차례: B의 5도 살아남았으므로 Pushed Through.
    // 이어서 내는 2도 A의 3보다 낮으므로 아무것도 플러시하지 않는다.
    const afterB = playCard(afterA, "B", "b-2");
    expect(afterB.discardPile).toContainEqual({ id: "b-5", value: 5 });
    expect(afterB.drawPile).toEqual([card("draw-1", 6), card("draw-2", 7)]); // 여전히 드로우 없음
  });
});

describe("손패가 0장이 되어 승리하는 경우", () => {
  it("마지막 카드가 나중에 플러시되고 드로우 덱이 비어 있으면 승리한다", () => {
    const state = makeState({
      players: [player("X", []), player("Y", [card("y-8", 8)])],
      activeCards: [active("X", 3, "x-3")],
      drawPile: [], // 드로우 덱 소진: 플러시돼도 카드를 받지 못한다.
      currentPlayerIndex: 1,
    });

    const next = playCard(state, "Y", "y-8");

    const x = next.players.find((p) => p.id === "X")!;
    expect(x.hand).toEqual([]);
    expect(next.activeCards.some((ac) => ac.playerId === "X")).toBe(false);
    expect(x.isWinner).toBe(true);
  });

  it("Pushed Through로 마지막 활성 카드가 사라지는 순간에도 승리한다", () => {
    const state = makeState({
      players: [player("A", []), player("B", [card("b-1", 2)])],
      activeCards: [active("A", 7, "a-7")],
      currentPlayerIndex: 0,
    });

    const next = playCard(state, "A", undefined);

    const a = next.players.find((p) => p.id === "A")!;
    expect(a.isWinner).toBe(true);
    expect(next.activeCards).toEqual([]);
  });
});

describe("여러 플레이어가 동시에 승리하는 경우", () => {
  it("드로우 덱이 비어 있을 때 한 번의 플레이로 두 플레이어가 동시에 승리한다", () => {
    const state = makeState({
      players: [
        player("X", []),
        player("W", []),
        player("Z", [card("z-10", 11)]),
      ],
      activeCards: [active("X", 3, "x-3"), active("W", 4, "w-4")],
      drawPile: [],
      currentPlayerIndex: 2,
    });

    const next = playCard(state, "Z", "z-10");

    const x = next.players.find((p) => p.id === "X")!;
    const w = next.players.find((p) => p.id === "W")!;
    expect(x.isWinner).toBe(true);
    expect(w.isWinner).toBe(true);
    expect(next.activeCards.some((ac) => ac.playerId === "X" || ac.playerId === "W")).toBe(false);
  });
});
