// Gate codes that let a user into the app at all — separate from room codes,
// which just help a group of already-let-in players find each other. Only an
// admin (server.ts's ADMIN_PASSWORD) can register or revoke these.
//
// Each code is effectively an "account": it carries a fixed nickname set at
// registration time, so a person's display name is consistent across every
// game they join (no retyping, and match history stays attributable to one
// real person instead of whatever string someone typed that day).
//
// A code can additionally be flagged `isAdmin`, which just controls whether
// the client shows the "관리자 모드" link after logging in with it — the
// actual admin panel is still gated by the separate ADMIN_PASSWORD, so this
// flag is a convenience/visibility switch, not a second auth boundary.
//
// Backed by db.ts (Postgres/Supabase in production). Falls back to an
// in-memory Map when no DATABASE_URL is set, purely so local dev works
// without an account — that path does NOT survive restarts.

import { pool } from "./db";

export interface AccessCode {
  code: string;
  createdAt: number;
  isAdmin: boolean;
  nickname: string;
}

const MAX_FRIENDS = 30;
const MAX_FRIEND_NAME_LENGTH = 20;
const MAX_ALLIANCE_TEXT_LENGTH = 12;

// Kept off AccessCode itself (the admin listing/registration shape) since
// nothing there needs it — friends is purely a self-service, per-account
// list (see the functions below).
const memoryFriends = new Map<string, string[]>();

// The account holder's own wording for the 🤝 연합! shout (render.ts's
// showAllianceBanner) — "" means "use the default 연합!!! text", same
// off-AccessCode reasoning as memoryFriends above.
const memoryAllianceText = new Map<string, string>();

export interface AccessCheckResult {
  valid: boolean;
  isAdmin: boolean;
  nickname: string;
  allianceText: string;
}

const memoryCodes = new Map<string, AccessCode>();

export async function checkAccessCode(code: string): Promise<AccessCheckResult> {
  const normalized = code.trim().toUpperCase();
  if (!pool) {
    const entry = memoryCodes.get(normalized);
    return entry
      ? {
          valid: true,
          isAdmin: entry.isAdmin,
          nickname: entry.nickname,
          allianceText: memoryAllianceText.get(normalized) ?? "",
        }
      : { valid: false, isAdmin: false, nickname: "", allianceText: "" };
  }
  const result = await pool.query(
    "SELECT is_admin, nickname, alliance_text FROM access_codes WHERE code = $1",
    [normalized],
  );
  if (result.rows.length === 0) {
    return { valid: false, isAdmin: false, nickname: "", allianceText: "" };
  }
  return {
    valid: true,
    isAdmin: result.rows[0].is_admin === true,
    nickname: result.rows[0].nickname,
    allianceText: result.rows[0].alliance_text ?? "",
  };
}

export async function listAccessCodes(): Promise<AccessCode[]> {
  if (!pool) {
    return [...memoryCodes.values()].sort((a, b) => b.createdAt - a.createdAt);
  }
  const result = await pool.query(
    "SELECT code, created_at, is_admin, nickname FROM access_codes ORDER BY created_at DESC",
  );
  return result.rows.map((row) => ({
    code: String(row.code),
    createdAt: Number(row.created_at),
    isAdmin: row.is_admin === true,
    nickname: row.nickname,
  }));
}

export async function registerAccessCode(
  rawCode: string,
  isAdmin: boolean,
  nickname: string,
): Promise<AccessCode> {
  const code = rawCode.trim().toUpperCase();
  const trimmedNickname = nickname.trim();
  if (!code) {
    throw new Error("코드를 입력해주세요.");
  }
  if (!trimmedNickname) {
    throw new Error("닉네임을 입력해주세요.");
  }
  if (!pool) {
    if (memoryCodes.has(code)) throw new Error("이미 등록된 코드입니다.");
    const entry: AccessCode = { code, createdAt: Date.now(), isAdmin, nickname: trimmedNickname };
    memoryCodes.set(code, entry);
    return entry;
  }
  const existing = await pool.query("SELECT 1 FROM access_codes WHERE code = $1", [code]);
  if (existing.rows.length > 0) {
    throw new Error("이미 등록된 코드입니다.");
  }
  const createdAt = Date.now();
  await pool.query(
    "INSERT INTO access_codes (code, created_at, is_admin, nickname) VALUES ($1, $2, $3, $4)",
    [code, createdAt, isAdmin, trimmedNickname],
  );
  return { code, createdAt, isAdmin, nickname: trimmedNickname };
}

// Lets a logged-in player rename themselves (see profile.ts / POST
// /api/nickname) — deliberately self-service, unlike register/revoke above,
// since a nickname is a cosmetic choice the account holder should be able to
// change without going through an admin. The access code itself is this
// simple app's whole identity proof (see the file header), so knowing it is
// treated as sufficient authorization to rename that account — the same
// trust model login already relies on.
export async function updateNickname(rawCode: string, nickname: string): Promise<AccessCode> {
  const code = rawCode.trim().toUpperCase();
  const trimmedNickname = nickname.trim();
  if (!trimmedNickname) {
    throw new Error("닉네임을 입력해주세요.");
  }
  if (trimmedNickname.length > 20) {
    throw new Error("닉네임은 20자 이하로 입력해주세요.");
  }
  if (!pool) {
    const entry = memoryCodes.get(code);
    if (!entry) throw new Error("코드를 찾을 수 없습니다.");
    entry.nickname = trimmedNickname;
    return entry;
  }
  const result = await pool.query(
    "UPDATE access_codes SET nickname = $1 WHERE code = $2 RETURNING created_at, is_admin",
    [trimmedNickname, code],
  );
  if (result.rows.length === 0) {
    throw new Error("코드를 찾을 수 없습니다.");
  }
  return {
    code,
    createdAt: Number(result.rows[0].created_at),
    isAdmin: result.rows[0].is_admin === true,
    nickname: trimmedNickname,
  };
}

export type FriendMutationResult = "ok" | "empty" | "duplicate" | "limit" | "not-found";

// Names the account holder wants to offer as "혼자하기" AI opponents — tied
// to the access code (see db.ts) rather than localStorage, so it's the same
// on every device they log in from. Same self-service trust model as
// updateNickname above: knowing the code is sufficient authorization.
export async function getFriendsForCode(rawCode: string): Promise<string[]> {
  const code = rawCode.trim().toUpperCase();
  if (!pool) {
    return memoryFriends.get(code) ?? [];
  }
  const result = await pool.query("SELECT friends FROM access_codes WHERE code = $1", [code]);
  if (result.rows.length === 0) return [];
  try {
    const parsed = JSON.parse(result.rows[0].friends ?? "[]");
    return Array.isArray(parsed) ? parsed.filter((n): n is string => typeof n === "string") : [];
  } catch {
    return [];
  }
}

async function saveFriendsForCode(code: string, friends: string[]): Promise<boolean> {
  if (!pool) {
    if (!memoryCodes.has(code)) return false;
    memoryFriends.set(code, friends);
    return true;
  }
  const result = await pool.query("UPDATE access_codes SET friends = $1 WHERE code = $2", [
    JSON.stringify(friends),
    code,
  ]);
  return (result.rowCount ?? 0) > 0;
}

export async function addFriendForCode(
  rawCode: string,
  name: string,
): Promise<{ result: FriendMutationResult; friends: string[] }> {
  const code = rawCode.trim().toUpperCase();
  const trimmed = name.trim().slice(0, MAX_FRIEND_NAME_LENGTH);
  const current = await getFriendsForCode(code);
  if (!trimmed) return { result: "empty", friends: current };
  if (current.includes(trimmed)) return { result: "duplicate", friends: current };
  if (current.length >= MAX_FRIENDS) return { result: "limit", friends: current };
  const updated = [...current, trimmed];
  const saved = await saveFriendsForCode(code, updated);
  return saved ? { result: "ok", friends: updated } : { result: "not-found", friends: current };
}

export async function removeFriendForCode(rawCode: string, name: string): Promise<string[]> {
  const code = rawCode.trim().toUpperCase();
  const current = await getFriendsForCode(code);
  const updated = current.filter((f) => f !== name);
  await saveFriendsForCode(code, updated);
  return updated;
}

// Optional, unlike updateNickname — an empty string is a valid value here
// and just means "fall back to the default 연합!!! wording" (see
// showAllianceBanner). Same self-service trust model as updateNickname.
export async function getAllianceTextForCode(rawCode: string): Promise<string> {
  const code = rawCode.trim().toUpperCase();
  if (!pool) {
    return memoryAllianceText.get(code) ?? "";
  }
  const result = await pool.query("SELECT alliance_text FROM access_codes WHERE code = $1", [code]);
  return result.rows.length > 0 ? (result.rows[0].alliance_text ?? "") : "";
}

export async function updateAllianceTextForCode(rawCode: string, text: string): Promise<string> {
  const code = rawCode.trim().toUpperCase();
  const trimmed = text.trim().slice(0, MAX_ALLIANCE_TEXT_LENGTH);
  if (!pool) {
    if (!memoryCodes.has(code)) throw new Error("코드를 찾을 수 없습니다.");
    memoryAllianceText.set(code, trimmed);
    return trimmed;
  }
  const result = await pool.query("UPDATE access_codes SET alliance_text = $1 WHERE code = $2", [
    trimmed,
    code,
  ]);
  if ((result.rowCount ?? 0) === 0) {
    throw new Error("코드를 찾을 수 없습니다.");
  }
  return trimmed;
}

export async function revokeAccessCode(code: string): Promise<boolean> {
  const normalized = code.trim().toUpperCase();
  if (!pool) {
    return memoryCodes.delete(normalized);
  }
  const result = await pool.query("DELETE FROM access_codes WHERE code = $1", [normalized]);
  return (result.rowCount ?? 0) > 0;
}
