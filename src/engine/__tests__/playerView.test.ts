import { describe, expect, it } from "vitest";
import type { ActiveCard, Card, GameState, Player } from "../types";
import { toPlayerView } from "../playerView";

function card(id: string, value: number): Card {
  return { id, value };
}

function player(id: string, hand: Card[] = [], isWinner = false): Player {
  return { id, name: `Name-${id}`, hand, isWinner };
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

describe("toPlayerView", () => {
  it("보는 사람 본인의 손패는 그대로 보여준다", () => {
    const state = makeState({
      players: [player("A", [card("a-1", 3), card("a-2", 5)]), player("B", [card("b-1", 9)])],
    });

    const view = toPlayerView(state, "A");
    const a = view.players.find((p) => p.id === "A")!;

    expect(a.cards).toEqual([card("a-1", 3), card("a-2", 5)]);
    expect(a.handSize).toBe(2);
  });

  it("다른 플레이어의 손패는 숨기고 장수만 알려준다", () => {
    const state = makeState({
      players: [player("A", [card("a-1", 3)]), player("B", [card("b-1", 9), card("b-2", 4)])],
    });

    const view = toPlayerView(state, "A");
    const b = view.players.find((p) => p.id === "B")!;

    expect(b.cards).toBeNull();
    expect(b.handSize).toBe(2);
  });

  it("드로우/버림 더미는 개수만 노출한다", () => {
    const state = makeState({
      players: [player("A", [])],
      drawPile: [card("d1", 2), card("d2", 3), card("d3", 4)],
      discardPile: [card("x1", 20)],
    });

    const view = toPlayerView(state, "A");

    expect(view.drawPileCount).toBe(3);
    expect(view.discardPileCount).toBe(1);
    expect(view).not.toHaveProperty("drawPile");
    expect(view).not.toHaveProperty("discardPile");
  });

  it("테이블에 낸 카드(activeCards)는 그대로 전달한다", () => {
    const state = makeState({
      players: [player("A", []), player("B", [])],
      activeCards: [active("A", 5), active("B", 7)],
    });

    const view = toPlayerView(state, "A");

    expect(view.activeCards).toEqual(state.activeCards);
    expect(view.activeCards).not.toBe(state.activeCards); // 방어적 복사
  });

  it("승리 여부와 현재 턴/게임 상태도 그대로 전달한다", () => {
    const state = makeState({
      players: [player("A", [], true), player("B", [card("b-1", 2)])],
      currentPlayerIndex: 1,
      gameStatus: "FINISHED",
      round: 3,
      turnCounter: 12,
    });

    const view = toPlayerView(state, "B");

    expect(view.players.find((p) => p.id === "A")!.isWinner).toBe(true);
    expect(view.currentPlayerIndex).toBe(1);
    expect(view.gameStatus).toBe("FINISHED");
    expect(view.round).toBe(3);
    expect(view.turnCounter).toBe(12);
  });
});
