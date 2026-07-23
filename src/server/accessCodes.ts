// Gate codes that let a user into the app at all — separate from room codes,
// which just help a group of already-let-in players find each other. Only an
// admin (server.ts's ADMIN_PASSWORD) can create or revoke these.
//
// In-memory only, like rooms.ts — codes disappear on server restart. Fine for
// a hobby project; documented as a known limitation in CLAUDE.md.

export interface AccessCode {
  code: string;
  createdAt: number;
}

const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const CODE_LENGTH = 8;

const codes = new Map<string, AccessCode>();

export function isValidAccessCode(code: string): boolean {
  return codes.has(code.trim().toUpperCase());
}

export function listAccessCodes(): AccessCode[] {
  return [...codes.values()].sort((a, b) => b.createdAt - a.createdAt);
}

export function createAccessCode(): AccessCode {
  let code: string;
  do {
    code = randomCode();
  } while (codes.has(code));
  const entry: AccessCode = { code, createdAt: Date.now() };
  codes.set(code, entry);
  return entry;
}

export function revokeAccessCode(code: string): boolean {
  return codes.delete(code.trim().toUpperCase());
}

function randomCode(): string {
  let code = "";
  for (let i = 0; i < CODE_LENGTH; i++) {
    code += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
  }
  return code;
}
