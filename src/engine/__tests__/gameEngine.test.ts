import { describe, expect, it } from "vitest";
import type { ActiveCard, Card, GameState, Player } from "../types";
import { createGame, getActiveGroups, playCard, resolveTurnStart } from "../gameEngine";

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

describe("Joining Forces에 참여한 카드들이 Pushed Through되는 경우 (RULES.md 23-26)", () => {
  it("연합원 중 한 명의 턴이 돌아오면 연합 전체가 그 자리에서 함께 버려지고, 아무도 드로우하지 않는다", () => {
    const state = makeState({
      players: [player("A", [card("a-3", 3)]), player("B", [card("b-2", 2)])],
      activeCards: [active("A", 5, "a-5"), active("B", 5, "b-5")],
      drawPile: [card("draw-1", 6), card("draw-2", 7)],
      currentPlayerIndex: 0,
    });

    // A의 차례: A의 5가 연합(5+5)에 속한 채로 살아남았다. 연합 전체(A의 5, B의 5)가
    // 함께 Pushed Through되고, 이어서 A만 손패에서 새 카드(3)를 낸다 — B는 아무것도
    // 하지 않고 자기 차례를 기다린다 (규칙 25).
    const afterA = playCard(state, "A", "a-3");
    expect(afterA.discardPile).toContainEqual({ id: "a-5", value: 5 });
    expect(afterA.discardPile).toContainEqual({ id: "b-5", value: 5 });
    expect(afterA.drawPile).toEqual([card("draw-1", 6), card("draw-2", 7)]); // 드로우 없음
    expect(afterA.activeCards).toEqual([
      { cardId: "a-3", playerId: "A", value: 3, playedAtTurn: 1, groupId: null },
    ]);
    // B는 자기 차례가 오기 전에 이미 activeCard가 사라진 상태다.
    expect(afterA.players.find((p) => p.id === "B")!.hand).toEqual([card("b-2", 2)]);

    // B의 차례: B.activeCard는 이미 없으므로(규칙 26) 기존 카드 버리기 단계 없이
    // 바로 손패의 새 카드를 낸다.
    const afterB = playCard(afterA, "B", "b-2");
    expect(afterB.drawPile).toEqual([card("draw-1", 6), card("draw-2", 7)]); // 여전히 드로우 없음
    expect(afterB.activeCards.map((ac) => ac.cardId).sort()).toEqual(["a-3", "b-2"]);
  });

  it("연합 중 한쪽이 Pushed Through로 마지막 카드를 버리면 자기 차례가 아니어도 즉시 승리한다 (규칙 33)", () => {
    const state = makeState({
      players: [player("A", [card("a-3", 3)]), player("B", [])],
      activeCards: [active("A", 5, "a-5"), active("B", 5, "b-5")],
      currentPlayerIndex: 0,
    });

    const next = playCard(state, "A", "a-3");

    const b = next.players.find((p) => p.id === "B")!;
    expect(b.hand).toEqual([]);
    expect(next.activeCards.some((ac) => ac.playerId === "B")).toBe(false);
    expect(b.isWinner).toBe(true); // B의 턴이 아직 오지 않았는데도 승리 처리됨
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

// 공식 설명서(RULES.md) 53장의 TEST 1~13을 그대로 재현한다. 이름은 스펙 번호와
// 1:1로 대응시켜 어떤 규칙 문단을 검증하는지 바로 추적할 수 있게 한다.
describe("RULES.md 53장 — 공식 예시 테스트", () => {
  it("TEST 1: A=6인 상태에서 B가 8을 내면 A의 6은 Flush되고 A는 드로우, B의 8은 유지", () => {
    const state = makeState({
      players: [player("A", []), player("B", [card("b-8", 8)])],
      activeCards: [active("A", 6, "a-6")],
      drawPile: [card("draw-1", 2)],
      currentPlayerIndex: 1,
    });

    const next = playCard(state, "B", "b-8");

    expect(next.discardPile).toContainEqual({ id: "a-6", value: 6 });
    expect(next.players.find((p) => p.id === "A")!.hand).toEqual([card("draw-1", 2)]);
    expect(next.activeCards.map((ac) => ac.cardId)).toEqual(["b-8"]);
  });

  it("TEST 2: A=8인 상태에서 B가 7을 내면 아무 일도 일어나지 않고 둘 다 유지된다", () => {
    const state = makeState({
      players: [player("A", []), player("B", [card("b-7", 7)])],
      activeCards: [active("A", 8, "a-8")],
      currentPlayerIndex: 1,
    });

    const next = playCard(state, "B", "b-7");

    expect(next.discardPile).toEqual([]);
    expect(next.activeCards.map((ac) => ac.cardId).sort()).toEqual(["a-8", "b-7"]);
  });

  it("TEST 3: A=7인 상태에서 B가 7을 내면 연합이 형성되고 POWER는 14다", () => {
    const state = makeState({
      players: [player("A", []), player("B", [card("b-7", 7)])],
      activeCards: [active("A", 7, "a-7")],
      currentPlayerIndex: 1,
    });

    const next = playCard(state, "B", "b-7");
    const group = getActiveGroups(next.activeCards).find((g) => g.value === 7)!;

    expect(group.totalValue).toBe(14);
    expect(group.cards.map((c) => c.cardId).sort()).toEqual(["a-7", "b-7"]);
  });

  it("TEST 4: 7 연합(POWER 14)이 있을 때 C가 9를 내도 연합은 유지되고 9도 그대로 남는다", () => {
    const state = makeState({
      players: [player("A", []), player("B", []), player("C", [card("c-9", 9)])],
      activeCards: [active("A", 7, "a-7"), active("B", 7, "b-7")],
      currentPlayerIndex: 2,
    });

    const next = playCard(state, "C", "c-9");
    const sevenGroup = getActiveGroups(next.activeCards).find((g) => g.value === 7)!;

    expect(sevenGroup.totalValue).toBe(14);
    expect(next.activeCards.some((ac) => ac.cardId === "c-9")).toBe(true);
  });

  it("TEST 5: A=7,B=7,C=9 상태에서 D가 실제 14를 내면 7 연합(동점)은 유지되고 C의 9만 Flush된다", () => {
    const state = makeState({
      players: [
        player("A", []),
        player("B", []),
        player("C", []),
        player("D", [card("d-14", 14)]),
      ],
      activeCards: [active("A", 7, "a-7"), active("B", 7, "b-7"), active("C", 9, "c-9")],
      drawPile: [card("draw-1", 2)],
      currentPlayerIndex: 3,
    });

    const next = playCard(state, "D", "d-14");
    const groups = getActiveGroups(next.activeCards);

    // 지수의 실제 14는 7 연합(POWER 14)과 동점 → 연합은 그대로 유지된다.
    expect(groups.find((g) => g.value === 7)).toMatchObject({ totalValue: 14, groupId: "group-7" });
    // 하지만 14 > 9이므로 연수의 9는 Flush되고 드로우한다.
    expect(next.discardPile).toContainEqual({ id: "c-9", value: 9 });
    expect(next.players.find((p) => p.id === "C")!.hand).toEqual([card("draw-1", 2)]);
    expect(groups.some((g) => g.value === 14)).toBe(true);
  });

  it("TEST 6: 5+5 연합(POWER 10)과 실제 10 카드는 서로 다른 그룹이며 동점이라 아무도 Flush되지 않는다", () => {
    const state = makeState({
      players: [player("A", []), player("B", []), player("C", [card("c-10", 10)])],
      activeCards: [active("A", 5, "a-5"), active("B", 5, "b-5")],
      currentPlayerIndex: 2,
    });

    const next = playCard(state, "C", "c-10");
    const groups = getActiveGroups(next.activeCards);

    expect(groups).toHaveLength(2);
    expect(groups.find((g) => g.value === 5)).toMatchObject({ totalValue: 10, groupId: "group-5" });
    expect(groups.find((g) => g.value === 10)).toMatchObject({ totalValue: 10, groupId: null });
    expect(next.discardPile).toEqual([]); // 동점이므로 Flush 없음
  });

  it("TEST 7: A=7,B=7 연합 상태로 A의 턴이 시작되면 둘 다 버려지고 드로우 없이 A만 새 카드를 낸다", () => {
    const state = makeState({
      players: [player("A", [card("a-6", 6)]), player("B", [])],
      activeCards: [active("A", 7, "a-7"), active("B", 7, "b-7")],
      drawPile: [card("draw-1", 2)],
      currentPlayerIndex: 0,
    });

    const next = playCard(state, "A", "a-6");

    expect(next.discardPile).toContainEqual({ id: "a-7", value: 7 });
    expect(next.discardPile).toContainEqual({ id: "b-7", value: 7 });
    expect(next.drawPile).toEqual([card("draw-1", 2)]); // 드로우 없음
    expect(next.activeCards).toEqual([
      { cardId: "a-6", playerId: "A", value: 6, playedAtTurn: 1, groupId: null },
    ]);
  });

  it("TEST 8: TEST 7 직후 B의 차례가 오면 B.activeCard는 이미 없으므로 바로 새 카드를 낸다", () => {
    const afterTurn7 = makeState({
      players: [player("A", [], false), player("B", [card("b-3", 3)])],
      activeCards: [active("A", 6, "a-6")],
      currentPlayerIndex: 1,
    });

    expect(afterTurn7.activeCards.some((ac) => ac.playerId === "B")).toBe(false);

    const next = playCard(afterTurn7, "B", "b-3");

    expect(next.activeCards.map((ac) => ac.cardId).sort()).toEqual(["a-6", "b-3"]);
  });

  it("TEST 9: A=7,B=7 연합(POWER 14)에서 C가 15를 내면 둘 다 Flush되고 각자 드로우한다", () => {
    const state = makeState({
      players: [
        player("A", []),
        player("B", []),
        player("C", [card("c-15", 15)]),
      ],
      activeCards: [active("A", 7, "a-7"), active("B", 7, "b-7")],
      drawPile: [card("draw-1", 2), card("draw-2", 3)],
      currentPlayerIndex: 2,
    });

    const next = playCard(state, "C", "c-15");

    expect(next.discardPile).toContainEqual({ id: "a-7", value: 7 });
    expect(next.discardPile).toContainEqual({ id: "b-7", value: 7 });
    expect(next.players.find((p) => p.id === "A")!.hand).toHaveLength(1);
    expect(next.players.find((p) => p.id === "B")!.hand).toHaveLength(1);
  });

  it("TEST 10: AI 2명(총 3명) 선택 시 각 플레이어는 6장을 받는다", () => {
    const state = createGame([{ id: "H", name: "H" }, { id: "AI1", name: "AI1" }, { id: "AI2", name: "AI2" }]);
    for (const p of state.players) expect(p.hand).toHaveLength(6);
  });

  it("TEST 11: AI 5명(총 6명) 선택 시 각 플레이어는 6장을 받는다", () => {
    const defs = ["H", "AI1", "AI2", "AI3", "AI4", "AI5"].map((id) => ({ id, name: id }));
    const state = createGame(defs);
    for (const p of state.players) expect(p.hand).toHaveLength(6);
  });

  it("TEST 12: AI 6명(총 7명) 선택 시 각 플레이어는 5장을 받는다", () => {
    const defs = ["H", "AI1", "AI2", "AI3", "AI4", "AI5", "AI6"].map((id) => ({ id, name: id }));
    const state = createGame(defs);
    for (const p of state.players) expect(p.hand).toHaveLength(5);
  });

  it("TEST 13: AI 7명(총 8명) 선택 시 각 플레이어는 5장을 받고 턴 순서는 Human부터 시계방향이다", () => {
    const ids = ["H", "AI1", "AI2", "AI3", "AI4", "AI5", "AI6", "AI7"];
    const defs = ids.map((id) => ({ id, name: id }));
    const state = createGame(defs);
    for (const p of state.players) expect(p.hand).toHaveLength(5);
    expect(state.players.map((p) => p.id)).toEqual(ids);
    expect(state.currentPlayerIndex).toBe(0); // Human부터 시작
  });
});

describe("resolveTurnStart — 새 카드를 내기 전에 살아남은 카드만 먼저 정리한다", () => {
  it("살아남은 카드가 없으면 아무것도 바뀌지 않는다", () => {
    const state = makeState({
      players: [player("A", [card("a-1", 3)]), player("B", [])],
      currentPlayerIndex: 0,
    });
    const next = resolveTurnStart(state, "A");
    expect(next.activeCards).toEqual([]);
    expect(next.discardPile).toEqual([]);
    expect(next.players.find((p) => p.id === "A")!.hand).toEqual([card("a-1", 3)]);
  });

  it("연합 없이 혼자 살아남은 카드를 드로우 없이 버린다", () => {
    const state = makeState({
      players: [player("A", [card("a-1", 3)])],
      activeCards: [active("A", 7, "a-7")],
      drawPile: [card("d-1", 9)],
      currentPlayerIndex: 0,
    });
    const next = resolveTurnStart(state, "A");
    expect(next.activeCards).toEqual([]);
    expect(next.discardPile).toEqual([{ id: "a-7", value: 7 }]);
    expect(next.players.find((p) => p.id === "A")!.hand).toEqual([card("a-1", 3)]); // 드로우 없음
    expect(next.drawPile).toEqual([card("d-1", 9)]); // 드로우 더미도 그대로
  });

  it("연합 상대의 카드도 함께 버려지고, 둘 다 즉시 승리할 수 있다", () => {
    const state = makeState({
      players: [player("A", []), player("B", [])],
      activeCards: [active("A", 7, "a-7"), active("B", 7, "b-7")],
      currentPlayerIndex: 0,
    });
    const next = resolveTurnStart(state, "A");
    expect(next.activeCards).toEqual([]);
    expect(next.discardPile.map((c) => c.id).sort()).toEqual(["a-7", "b-7"]);
    expect(next.players.find((p) => p.id === "A")!.isWinner).toBe(true);
    expect(next.players.find((p) => p.id === "B")!.isWinner).toBe(true); // B는 자기 턴이 아니어도 승리
  });

  it("resolveTurnStart 뒤에 playCard를 호출해도 중복 정리하지 않고 새 카드만 낸다", () => {
    const state = makeState({
      players: [player("A", [card("a-9", 9)]), player("B", [card("b-13", 13)])],
      activeCards: [active("A", 7, "a-7"), active("B", 7, "b-7")],
      currentPlayerIndex: 0,
    });
    const afterCleanup = resolveTurnStart(state, "A");
    const afterPlay = playCard(afterCleanup, "A", "a-9");

    expect(afterPlay.activeCards).toEqual([
      { cardId: "a-9", playerId: "A", value: 9, playedAtTurn: 1, groupId: null },
    ]);
    // 두 번 버려지지 않고, 연합 7 두 장만 discardPile에 있어야 한다
    expect(afterPlay.discardPile.map((c) => c.id).sort()).toEqual(["a-7", "b-7"]);
  });
});

describe("resolveTurnStart — 손패가 이미 비어있는 채로 자기 턴이 온 경우 (규칙 14)", () => {
  it("카드가 살아남아 버려지자마자 즉시 승리하고, 낼 카드가 없으니 턴을 넘긴다", () => {
    const state = makeState({
      players: [player("A", []), player("B", [card("b-1", 3)])],
      activeCards: [active("A", 7, "a-7")],
      currentPlayerIndex: 0,
    });

    const next = resolveTurnStart(state, "A");

    expect(next.players.find((p) => p.id === "A")!.isWinner).toBe(true);
    expect(next.activeCards).toEqual([]);
    expect(next.discardPile).toEqual([{ id: "a-7", value: 7 }]);
    // A에게는 더 낼 카드가 없으니 턴이 B에게 넘어가 있어야 한다.
    expect(next.players[next.currentPlayerIndex].id).toBe("B");
  });
});
