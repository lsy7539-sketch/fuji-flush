// Gate codes that let a user into the app at all — separate from room codes,
// which just help a group of already-let-in players find each other. Only an
// admin (server.ts's ADMIN_PASSWORD) can register or revoke these, and picks
// the exact code text themselves (no auto-generation).
//
// Backed by db.ts (Turso in production, a local SQLite file in dev) so
// codes survive server restarts and redeploys.

import { db } from "./db";

export interface AccessCode {
  code: string;
  createdAt: number;
}

export async function isValidAccessCode(code: string): Promise<boolean> {
  const result = await db.execute({
    sql: "SELECT 1 FROM access_codes WHERE code = ?",
    args: [code.trim().toUpperCase()],
  });
  return result.rows.length > 0;
}

export async function listAccessCodes(): Promise<AccessCode[]> {
  const result = await db.execute(
    "SELECT code, created_at FROM access_codes ORDER BY created_at DESC",
  );
  return result.rows.map((row) => ({
    code: String(row.code),
    createdAt: Number(row.created_at),
  }));
}

export async function registerAccessCode(rawCode: string): Promise<AccessCode> {
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
    sql: "INSERT INTO access_codes (code, created_at) VALUES (?, ?)",
    args: [code, createdAt],
  });
  return { code, createdAt };
}

export async function revokeAccessCode(code: string): Promise<boolean> {
  const result = await db.execute({
    sql: "DELETE FROM access_codes WHERE code = ?",
    args: [code.trim().toUpperCase()],
  });
  return result.rowsAffected > 0;
}
