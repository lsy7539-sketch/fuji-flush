import { describe, expect, it } from "vitest";
import type { ActiveCard, Card, GameState, Player } from "../../engine/types";
import { chooseBotMove } from "../botPlayer";

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

describe("chooseBotMove", () => {
  it("안전한 카드가 여러 장이면 그중 가장 낮은 카드를 낸다", () => {
    const state = makeState({
      players: [player("bot", [card("bot-3", 3), card("bot-8", 8)]), player("other", [])],
      currentPlayerIndex: 0,
    });

    expect(chooseBotMove(state, "bot")).toBe("bot-3");
  });

  it("안전한 카드가 없으면 결과 총합이 가장 높은 카드를 낸다", () => {
    const state = makeState({
      players: [player("bot", [card("bot-2", 2), card("bot-3", 3)]), player("other", [])],
      activeCards: [active("other", 20)],
      currentPlayerIndex: 0,
    });

    // 2와 3 둘 다 테이블의 20보다 낮아 안전하지 않으므로, 그중 총합이 더 큰 3을 낸다.
    expect(chooseBotMove(state, "bot")).toBe("bot-3");
  });

  it("손패가 없으면 undefined를 반환한다 (Pushed Through/승리 경로에 위임)", () => {
    const state = makeState({
      players: [player("bot", []), player("other", [])],
      activeCards: [active("bot", 7)],
      currentPlayerIndex: 0,
    });

    expect(chooseBotMove(state, "bot")).toBeUndefined();
  });
});
