export type Speed = "veryslow" | "slow" | "normal" | "fast" | "veryfast";

export interface Timing {
  /** delay before an AI move resolves, i.e. "thinking" */
  think: number;
  /** delay after the move resolves, holding the result on screen */
  reveal: number;
  /** extra reveal time added when the move produced a notable event
   *  (a flush, an alliance forming, or a win) */
  eventBonus: number;
}

// slow/normal/fast keep their original values (existing players' feel for
// each doesn't change) — veryslow/veryfast are new extremes added on
// either end.
const TIMINGS: Record<Speed, Timing> = {
  veryslow: { think: 3600, reveal: 2200, eventBonus: 1600 },
  slow: { think: 2600, reveal: 1600, eventBonus: 1200 },
  normal: { think: 1500, reveal: 900, eventBonus: 700 },
  fast: { think: 700, reveal: 300, eventBonus: 300 },
  veryfast: { think: 350, reveal: 150, eventBonus: 150 },
};

const STORAGE_KEY = "fuji-flush-speed";
const VALID_SPEEDS: Speed[] = ["veryslow", "slow", "normal", "fast", "veryfast"];

export function getSpeed(): Speed {
  const saved = localStorage.getItem(STORAGE_KEY);
  return (VALID_SPEEDS as string[]).includes(saved ?? "") ? (saved as Speed) : "normal";
}

export function setSpeed(speed: Speed): void {
  localStorage.setItem(STORAGE_KEY, speed);
}

export function getTiming(speed: Speed): Timing {
  return TIMINGS[speed];
}
