// A saved list of names to offer as AI opponent names in "혼자하기" (see
// localMode.ts's buildPlayerDefs) instead of always drawing from the random
// idol name pool. Stored server-side per access code (see accessCodes.ts /
// /api/friends/*) rather than localStorage, so the same list shows up no
// matter which device the player logs in from.
import { getAccessCode } from "./loginGate";

export type AddFriendResult = "ok" | "empty" | "duplicate" | "limit" | "network-error";

export async function getFriends(): Promise<string[]> {
  try {
    const res = await fetch("/api/friends/list", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: getAccessCode() }),
    });
    const data = await res.json();
    return data.ok && Array.isArray(data.friends) ? data.friends : [];
  } catch {
    return [];
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
    return data.ok === true;
  } catch {
    return false;
  }
}
