import { describe, expect, it } from "vitest";
import { computeDrawEvents } from "../drawAnimation";

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
