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

export interface AccessCheckResult {
  valid: boolean;
  isAdmin: boolean;
  nickname: string;
}

const memoryCodes = new Map<string, AccessCode>();

export async function checkAccessCode(code: string): Promise<AccessCheckResult> {
  const normalized = code.trim().toUpperCase();
  if (!pool) {
    const entry = memoryCodes.get(normalized);
    return entry
      ? { valid: true, isAdmin: entry.isAdmin, nickname: entry.nickname }
      : { valid: false, isAdmin: false, nickname: "" };
  }
  const result = await pool.query(
    "SELECT is_admin, nickname FROM access_codes WHERE code = $1",
    [normalized],
  );
  if (result.rows.length === 0) {
    return { valid: false, isAdmin: false, nickname: "" };
  }
  return {
    valid: true,
    isAdmin: result.rows[0].is_admin === true,
    nickname: result.rows[0].nickname,
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

export async function revokeAccessCode(code: string): Promise<boolean> {
  const normalized = code.trim().toUpperCase();
  if (!pool) {
    return memoryCodes.delete(normalized);
  }
  const result = await pool.query("DELETE FROM access_codes WHERE code = $1", [normalized]);
  return (result.rowCount ?? 0) > 0;
}
