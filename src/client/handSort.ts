export type HandSort = "asc" | "desc";

const STORAGE_KEY = "fuji-flush-hand-sort";

export function getHandSort(): HandSort {
  return localStorage.getItem(STORAGE_KEY) === "desc" ? "desc" : "asc";
}

export function setHandSort(sort: HandSort): void {
  localStorage.setItem(STORAGE_KEY, sort);
}

export function sortByValue<T extends { value: number }>(cards: T[], sort: HandSort): T[] {
  const sorted = [...cards].sort((a, b) => a.value - b.value);
  return sort === "desc" ? sorted.reverse() : sorted;
}
