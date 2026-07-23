import fs from "node:fs";
import { createClient } from "@libsql/client";

// Falls back to a local SQLite file when no Turso credentials are set, so
// `npm run dev`/`npm run server` work out of the box without an account —
// only the real deployment needs TURSO_DATABASE_URL/TURSO_AUTH_TOKEN set.
const usingLocalFile = !process.env.TURSO_DATABASE_URL;
if (usingLocalFile) {
  fs.mkdirSync("./data", { recursive: true });
}

const url = process.env.TURSO_DATABASE_URL ?? "file:./data/fuji-flush.db";
const authToken = process.env.TURSO_AUTH_TOKEN;

export const db = createClient({ url, authToken });

export async function initDb(): Promise<void> {
  await db.execute(`
    CREATE TABLE IF NOT EXISTS access_codes (
      code TEXT PRIMARY KEY,
      created_at INTEGER NOT NULL,
      is_admin INTEGER NOT NULL DEFAULT 0
    )
  `);
  // Lightweight migration for databases created before is_admin existed —
  // SQLite has no "ADD COLUMN IF NOT EXISTS", so just ignore the "duplicate
  // column" error when it's already there.
  try {
    await db.execute("ALTER TABLE access_codes ADD COLUMN is_admin INTEGER NOT NULL DEFAULT 0");
  } catch {
    // already migrated
  }
  await db.execute(`
    CREATE TABLE IF NOT EXISTS matches (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      room_name TEXT NOT NULL,
      room_code TEXT NOT NULL,
      started_at INTEGER NOT NULL,
      finished_at INTEGER NOT NULL,
      player_count INTEGER NOT NULL
    )
  `);
  await db.execute(`
    CREATE TABLE IF NOT EXISTS match_players (
      match_id INTEGER NOT NULL REFERENCES matches(id),
      player_name TEXT NOT NULL,
      is_winner INTEGER NOT NULL,
      final_hand_size INTEGER NOT NULL
    )
  `);
}
