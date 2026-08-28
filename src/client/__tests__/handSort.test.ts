import { describe, expect, it } from "vitest";
import { sortByValue } from "../handSort";

describe("sortByValue", () => {
  it("정렬해도 원본 배열은 건드리지 않는다", () => {
    const cards = [{ value: 9 }, { value: 2 }, { value: 5 }];
    sortByValue(cards, "asc");
    expect(cards).toEqual([{ value: 9 }, { value: 2 }, { value: 5 }]);
  });

  it("asc: 낮은 숫자부터", () => {
    const cards = [{ value: 9 }, { value: 2 }, { value: 5 }];
    expect(sortByValue(cards, "asc")).toEqual([{ value: 2 }, { value: 5 }, { value: 9 }]);
  });

  it("desc: 높은 숫자부터", () => {
    const cards = [{ value: 9 }, { value: 2 }, { value: 5 }];
    expect(sortByValue(cards, "desc")).toEqual([{ value: 9 }, { value: 5 }, { value: 2 }]);
  });
});
