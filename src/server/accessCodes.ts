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
// Backed by db.ts (Turso in production, a local SQLite file in dev) so
// codes survive server restarts and redeploys.

import { db } from "./db";

export interface AccessCode {
  code: string;
  createdAt: number;
  isAdmin: boolean;
}

export interface AccessCheckResult {
  valid: boolean;
  isAdmin: boolean;
}

export async function checkAccessCode(code: string): Promise<AccessCheckResult> {
  const result = await db.execute({
    sql: "SELECT is_admin FROM access_codes WHERE code = ?",
    args: [code.trim().toUpperCase()],
  });
  if (result.rows.length === 0) {
    return { valid: false, isAdmin: false };
  }
  return { valid: true, isAdmin: Number(result.rows[0].is_admin) === 1 };
}

export async function listAccessCodes(): Promise<AccessCode[]> {
  const result = await db.execute(
    "SELECT code, created_at, is_admin FROM access_codes ORDER BY created_at DESC",
  );
  return result.rows.map((row) => ({
    code: String(row.code),
    createdAt: Number(row.created_at),
    isAdmin: Number(row.is_admin) === 1,
  }));
}

export async function registerAccessCode(rawCode: string, isAdmin: boolean): Promise<AccessCode> {
  const code = rawCode.trim().toUpperCase();
  if (!code) {
    throw new Error("코드를 입력해주세요.");
  }
  const existing = await db.execute({
    sql: "SELECT 1 FROM access_codes WHERE code = ?",
    args: [code],
  });
  if (existing.rows.length > 0) {
    throw new Error("이미 등록된 코드입니다.");
  }
  const createdAt = Date.now();
  await db.execute({
    sql: "INSERT INTO access_codes (code, created_at, is_admin) VALUES (?, ?, ?)",
    args: [code, createdAt, isAdmin ? 1 : 0],
  });
  return { code, createdAt, isAdmin };
}

export async function revokeAccessCode(code: string): Promise<boolean> {
  const result = await db.execute({
    sql: "DELETE FROM access_codes WHERE code = ?",
    args: [code.trim().toUpperCase()],
  });
  return result.rowsAffected > 0;
}
