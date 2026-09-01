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

// Returns whether the write actually succeeded — some browsers (notably
// in-app webviews like KakaoTalk's, which already needed a workaround for
// blocked confirm() dialogs — see confirmDialog.ts) restrict or throw on
// localStorage access. Silently swallowing that made "추가" look like it
// just did nothing, with no way to tell a real failure apart from "already
// added" or "browser doesn't support this".
function saveFriends(friends: string[]): boolean {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(friends));
    return true;
  } catch {
    return false;
  }
}

export type AddFriendResult = "ok" | "empty" | "duplicate" | "limit" | "storage-error";

export function addFriend(name: string): AddFriendResult {
  const trimmed = name.trim().slice(0, MAX_NAME_LENGTH);
  if (!trimmed) return "empty";
  const friends = getFriends();
  if (friends.includes(trimmed)) return "duplicate";
  if (friends.length >= MAX_FRIENDS) return "limit";
  return saveFriends([...friends, trimmed]) ? "ok" : "storage-error";
}

export function removeFriend(name: string): boolean {
  return saveFriends(getFriends().filter((f) => f !== name));
}
