// Gate codes that let a user into the app at all — separate from room codes,
// which just help a group of already-let-in players find each other. Only an
// admin (server.ts's ADMIN_PASSWORD) can register or revoke these, and picks
// the exact code text themselves (no auto-generation).
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
}

export interface AccessCheckResult {
  valid: boolean;
  isAdmin: boolean;
}

const memoryCodes = new Map<string, AccessCode>();

export async function checkAccessCode(code: string): Promise<AccessCheckResult> {
  const normalized = code.trim().toUpperCase();
  if (!pool) {
    const entry = memoryCodes.get(normalized);
    return entry ? { valid: true, isAdmin: entry.isAdmin } : { valid: false, isAdmin: false };
  }
  const result = await pool.query("SELECT is_admin FROM access_codes WHERE code = $1", [normalized]);
  if (result.rows.length === 0) {
    return { valid: false, isAdmin: false };
  }
  return { valid: true, isAdmin: result.rows[0].is_admin === true };
}

export async function listAccessCodes(): Promise<AccessCode[]> {
  if (!pool) {
    return [...memoryCodes.values()].sort((a, b) => b.createdAt - a.createdAt);
  }
  const result = await pool.query(
    "SELECT code, created_at, is_admin FROM access_codes ORDER BY created_at DESC",
  );
  return result.rows.map((row) => ({
    code: String(row.code),
    createdAt: Number(row.created_at),
    isAdmin: row.is_admin === true,
  }));
}

export async function registerAccessCode(rawCode: string, isAdmin: boolean): Promise<AccessCode> {
  const code = rawCode.trim().toUpperCase();
  if (!code) {
    throw new Error("코드를 입력해주세요.");
  }
  if (!pool) {
    if (memoryCodes.has(code)) throw new Error("이미 등록된 코드입니다.");
    const entry: AccessCode = { code, createdAt: Date.now(), isAdmin };
    memoryCodes.set(code, entry);
    return entry;
  }
  const existing = await pool.query("SELECT 1 FROM access_codes WHERE code = $1", [code]);
  if (existing.rows.length > 0) {
    throw new Error("이미 등록된 코드입니다.");
  }
  const createdAt = Date.now();
  await pool.query("INSERT INTO access_codes (code, created_at, is_admin) VALUES ($1, $2, $3)", [
    code,
    createdAt,
    isAdmin,
  ]);
  return { code, createdAt, isAdmin };
}

export async function revokeAccessCode(code: string): Promise<boolean> {
  const normalized = code.trim().toUpperCase();
  if (!pool) {
    return memoryCodes.delete(normalized);
  }
  const result = await pool.query("DELETE FROM access_codes WHERE code = $1", [normalized]);
  return (result.rowCount ?? 0) > 0;
}
