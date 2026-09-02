// Used by both the client (혼자하기's own timing, see client/speed.ts) and
// the server (같이하기's AI "thinking" pace, see server/rooms.ts) — the
// actual per-speed durations are defined separately in each of those,
// since they mean slightly different things client-side (think/reveal/
// eventBonus) vs server-side (just how long an AI seat pauses before its
// move), but the 5 named levels themselves are the same set either way.
export type Speed = "veryslow" | "slow" | "normal" | "fast" | "veryfast";

export const SPEED_ORDER: Speed[] = ["veryslow", "slow", "normal", "fast", "veryfast"];
