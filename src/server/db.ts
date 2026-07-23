import { Pool } from "pg";

// Supabase (or any Postgres) connection string. Local dev without
// DATABASE_URL set falls back to an in-memory store (see accessCodes.ts /
// rooms.ts) so `npm run dev`/`npm run server` still work without an
// account — only the real deployment needs this set.
const connectionString = process.env.DATABASE_URL;

export const pool = connectionString
  ? new Pool({ connectionString, ssl: { rejectUnauthorized: false } })
  : null;

export async function initDb(): Promise<void> {
  if (!pool) {
    console.warn(
      "DATABASE_URL이 설정되지 않아 메모리에만 저장합니다 (재시작하면 초기화됨). " +
        "실제 배포에서는 반드시 설정하세요.",
    );
    return;
  }
  await pool.query(`
    CREATE TABLE IF NOT EXISTS access_codes (
      code TEXT PRIMARY KEY,
      created_at BIGINT NOT NULL,
      is_admin BOOLEAN NOT NULL DEFAULT FALSE,
      nickname TEXT NOT NULL DEFAULT ''
    )
  `);
  // Postgres (unlike SQLite) supports this directly, so no try/catch dance
  // is needed for databases created before `nickname` existed.
  await pool.query("ALTER TABLE access_codes ADD COLUMN IF NOT EXISTS nickname TEXT NOT NULL DEFAULT ''");
  await pool.query(`
    CREATE TABLE IF NOT EXISTS matches (
      id SERIAL PRIMARY KEY,
      room_name TEXT NOT NULL,
      room_code TEXT NOT NULL,
      started_at BIGINT NOT NULL,
      finished_at BIGINT NOT NULL,
      player_count INTEGER NOT NULL
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS match_players (
      match_id INTEGER NOT NULL REFERENCES matches(id),
      player_name TEXT NOT NULL,
      is_winner BOOLEAN NOT NULL,
      final_hand_size INTEGER NOT NULL
    )
  `);
}
