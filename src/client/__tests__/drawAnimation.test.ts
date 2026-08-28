import { describe, expect, it } from "vitest";
import { computeDiscardEvents, computeDrawEvents } from "../drawAnimation";

describe("computeDrawEvents", () => {
  it("새로 손패에 들어온 카드가 없으면 빈 배열이다", () => {
    const before = { players: [{ id: "A", hand: [{ id: "a1", value: 3 }] }] };
    const after = { players: [{ id: "A", hand: [{ id: "a1", value: 3 }] }] };
    expect(computeDrawEvents(before, after)).toEqual([]);
  });

  it("새 카드 id가 등장하면 드로우로 잡아낸다", () => {
    const before = { players: [{ id: "A", hand: [{ id: "a1", value: 3 }] }] };
    const after = {
      players: [{ id: "A", hand: [{ id: "a1", value: 3 }, { id: "a2", value: 8 }] }],
    };
    expect(computeDrawEvents(before, after)).toEqual([{ playerId: "A", cardId: "a2", value: 8 }]);
  });

  it("같은 턴에 카드를 내고(제거) 동시에 드로우(추가)해도 정확히 드로우만 잡는다", () => {
    // A played a1 (removed) and drew a3 (added) in the same transition —
    // hand size is unchanged, so a size-based diff would miss this entirely.
    const before = {
      players: [{ id: "A", hand: [{ id: "a1", value: 5 }, { id: "a2", value: 9 }] }],
    };
    const after = {
      players: [{ id: "A", hand: [{ id: "a2", value: 9 }, { id: "a3", value: 2 }] }],
    };
    expect(computeDrawEvents(before, after)).toEqual([{ playerId: "A", cardId: "a3", value: 2 }]);
  });

  it("여러 플레이어가 동시에 드로우하면 모두 잡아낸다", () => {
    const before = {
      players: [
        { id: "A", hand: [] as { id: string; value: number }[] },
        { id: "B", hand: [] as { id: string; value: number }[] },
      ],
    };
    const after = {
      players: [
        { id: "A", hand: [{ id: "a1", value: 4 }] },
        { id: "B", hand: [{ id: "b1", value: 6 }] },
      ],
    };
    expect(computeDrawEvents(before, after)).toEqual([
      { playerId: "A", cardId: "a1", value: 4 },
      { playerId: "B", cardId: "b1", value: 6 },
    ]);
  });
});

describe("computeDiscardEvents", () => {
  it("사라진 activeCard가 없으면 빈 배열이다", () => {
    const before = { activeCards: [{ cardId: "c1", playerId: "A", value: 5 }] };
    const after = { activeCards: [{ cardId: "c1", playerId: "A", value: 5 }] };
    expect(computeDiscardEvents(before, after)).toEqual([]);
  });

  it("플러시로 사라진 카드를 잡아낸다", () => {
    const before = {
      activeCards: [
        { cardId: "c1", playerId: "A", value: 5 },
        { cardId: "c2", playerId: "B", value: 8 },
      ],
    };
    const after = { activeCards: [{ cardId: "c2", playerId: "B", value: 8 }] };
    expect(computeDiscardEvents(before, after)).toEqual([{ playerId: "A", cardId: "c1", value: 5 }]);
  });

  it("연합이 함께 살아남아 버려지면 둘 다 잡아낸다", () => {
    const before = {
      activeCards: [
        { cardId: "c1", playerId: "A", value: 7 },
        { cardId: "c2", playerId: "B", value: 7 },
      ],
    };
    const after = { activeCards: [] as { cardId: string; playerId: string; value: number }[] };
    expect(computeDiscardEvents(before, after)).toEqual([
      { playerId: "A", cardId: "c1", value: 7 },
      { playerId: "B", cardId: "c2", value: 7 },
    ]);
  });
});
