import { describe, expect, it } from "vitest";
import type { ActiveCard, Card, GameState, Player } from "../../engine/types";
import { playCard } from "../../engine/gameEngine";
import { describeMove } from "../localMode";

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

describe("describeMove", () => {
  it("플러시: 밀려난 카드의 소유자를 언급하고 notable이다", () => {
    const before = makeState({
      players: [player("A", []), player("B", [card("b-8", 8)])],
      activeCards: [active("A", 5, "a-5")],
      drawPile: [card("draw-1", 2)],
      currentPlayerIndex: 1,
    });

    const after = playCard(before, "B", "b-8");
    const { message, notable } = describeMove(before, after, "B");

    expect(notable).toBe(true);
    expect(message).toContain("B가 8를 냈습니다");
    expect(message).toContain("💥");
    expect(message).toContain("A의 카드가 밀려났습니다");
  });

  it("연합: POWER 계산을 언급하고 notable이다", () => {
    const before = makeState({
      players: [player("A", []), player("B", [card("b-7", 7)])],
      activeCards: [active("A", 7, "a-7")],
      currentPlayerIndex: 1,
    });

    const after = playCard(before, "B", "b-7");
    const { message, notable } = describeMove(before, after, "B");

    expect(notable).toBe(true);
    expect(message).toContain("B가 7를 냈습니다");
    expect(message).toContain("🤝");
    expect(message).toContain("A와 연합");
    expect(message).toContain("7 × 2 = 14");
  });

  it("연합 성공(살아남음): 두 플레이어 모두 언급하고, 승리도 감지한다", () => {
    const before = makeState({
      players: [player("A", [card("a-9", 9)]), player("B", [], false)],
      activeCards: [active("A", 7, "a-7"), active("B", 7, "b-7")],
      currentPlayerIndex: 0,
    });

    const after = playCard(before, "A", "a-9");
    const { message, notable } = describeMove(before, after, "A");

    expect(notable).toBe(true);
    expect(message).toContain("A와 B의 연합 카드가 살아남아 함께 버려졌습니다");
    expect(message).toContain("🏆 B 승리!");
    // A still had a hand card to play afterwards.
    expect(message).toContain("A가 9를 냈습니다");
  });

  it("첫 번째가 아닌 승리는 '승리!' 대신 등수로 표시한다", () => {
    const before = makeState({
      players: [player("A", [card("a-9", 9)]), player("B", [], false)],
      activeCards: [active("A", 7, "a-7"), active("B", 7, "b-7")],
      currentPlayerIndex: 0,
    });

    const after = playCard(before, "A", "a-9");
    // C already finished earlier, so B (this move's finisher) is 2등, not 승리.
    const { message } = describeMove(before, after, "A", ["C", "B"]);

    expect(message).toContain("B 2등!");
    expect(message).not.toContain("🏆 B 승리!");
  });

  it("아무 일도 없음: 낮은 카드를 내도 아무것도 밀려나지 않고 notable이 아니다", () => {
    const before = makeState({
      players: [player("A", []), player("B", [card("b-3", 3)])],
      activeCards: [active("A", 8, "a-8")],
      currentPlayerIndex: 1,
    });

    const after = playCard(before, "B", "b-3");
    const { message, notable } = describeMove(before, after, "B");

    expect(notable).toBe(false);
    expect(message).toBe("B가 3를 냈습니다.");
  });
});
