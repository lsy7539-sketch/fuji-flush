// Gate codes that let a user into the app at all — separate from room codes,
// which just help a group of already-let-in players find each other. Only an
// admin (server.ts's ADMIN_PASSWORD) can register or revoke these, and picks
// the exact code text themselves (no auto-generation).
//
// In-memory only, like rooms.ts — codes disappear on server restart. Fine for
// a hobby project; documented as a known limitation in CLAUDE.md.

export interface AccessCode {
  code: string;
  createdAt: number;
}

const codes = new Map<string, AccessCode>();

export function isValidAccessCode(code: string): boolean {
  return codes.has(code.trim().toUpperCase());
}

export function listAccessCodes(): AccessCode[] {
  return [...codes.values()].sort((a, b) => b.createdAt - a.createdAt);
}

export function registerAccessCode(rawCode: string): AccessCode {
  const code = rawCode.trim().toUpperCase();
  if (!code) {
    throw new Error("코드를 입력해주세요.");
  }
  if (codes.has(code)) {
    throw new Error("이미 등록된 코드입니다.");
  }
  const entry: AccessCode = { code, createdAt: Date.now() };
  codes.set(code, entry);
  return entry;
}

export function revokeAccessCode(code: string): boolean {
  return codes.delete(code.trim().toUpperCase());
}
