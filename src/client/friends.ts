// A saved list of names to offer as AI opponent names in "혼자하기" (see
// localMode.ts's buildPlayerDefs) instead of always drawing from the random
// idol name pool. Purely a per-device preset — not a real account/roster,
// so it lives in localStorage rather than the server.
const STORAGE_KEY = "fuji-flush-friends";
const MAX_FRIENDS = 30;
const MAX_NAME_LENGTH = 20;

export function getFriends(): string[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((n): n is string => typeof n === "string") : [];
  } catch {
    return [];
  }
}

function saveFriends(friends: string[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(friends));
}

export function addFriend(name: string): void {
  const trimmed = name.trim().slice(0, MAX_NAME_LENGTH);
  if (!trimmed) return;
  const friends = getFriends();
  if (friends.includes(trimmed) || friends.length >= MAX_FRIENDS) return;
  saveFriends([...friends, trimmed]);
}

export function removeFriend(name: string): void {
  saveFriends(getFriends().filter((f) => f !== name));
}
