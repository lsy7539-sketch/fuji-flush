// A saved list of names to offer as AI opponent names in "혼자하기" (see
// localMode.ts's buildPlayerDefs) instead of always drawing from the random
// idol name pool. Stored server-side per access code (see accessCodes.ts /
// /api/friends/*) rather than localStorage, so the same list shows up no
// matter which device the player logs in from.
import { getAccessCode } from "./loginGate";

export type AddFriendResult = "ok" | "empty" | "duplicate" | "limit" | "network-error";

// In-memory only (cleared on reload) — a session-lifetime cache so a
// screen that needs this list synchronously (main.ts's renderLocalSetup)
// can read whatever was last fetched instead of always starting from an
// empty list and popping the real one in a beat later, which read as the
// friend picker's whole layout suddenly growing/glitching once it
// resolved. main.ts also fires prefetchFriends() right after login so
// there's usually already something here well before 혼자하기 is ever
// opened.
let cache: string[] | null = null;

export function getCachedFriends(): string[] | null {
  return cache;
}

// Fire-and-forget — called once right after login (see main.ts) purely to
// warm `cache` ahead of time. Safe to call again later too: getFriends()
// always re-fetches regardless of whether a cache already exists, this
// just kicks that off without anyone needing to await it.
export function prefetchFriends(): void {
  void getFriends();
}

export async function getFriends(): Promise<string[]> {
  try {
    const res = await fetch("/api/friends/list", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: getAccessCode() }),
    });
    const data = await res.json();
    const friends = data.ok && Array.isArray(data.friends) ? data.friends : [];
    cache = friends;
    return friends;
  } catch {
    return cache ?? [];
  }
}

export async function addFriend(name: string): Promise<AddFriendResult> {
  try {
    const res = await fetch("/api/friends/add", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: getAccessCode(), name }),
    });
    const data = await res.json();
    if (Array.isArray(data.friends)) cache = data.friends;
    return (data.result as AddFriendResult) ?? "network-error";
  } catch {
    return "network-error";
  }
}

export async function removeFriend(name: string): Promise<boolean> {
  try {
    const res = await fetch("/api/friends/remove", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: getAccessCode(), name }),
    });
    const data = await res.json();
    if (Array.isArray(data.friends)) cache = data.friends;
    return data.ok === true;
  } catch {
    return false;
  }
}
