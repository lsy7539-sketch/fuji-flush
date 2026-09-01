export type Speed = "slow" | "normal" | "fast";

export interface Timing {
  /** delay before an AI move resolves, i.e. "thinking" */
  think: number;
  /** delay after the move resolves, holding the result on screen */
  reveal: number;
  /** extra reveal time added when the move produced a notable event
   *  (a flush, an alliance forming, or a win) */
  eventBonus: number;
}

const TIMINGS: Record<Speed, Timing> = {
  slow: { think: 2600, reveal: 1600, eventBonus: 1200 },
  normal: { think: 1500, reveal: 900, eventBonus: 700 },
  fast: { think: 700, reveal: 300, eventBonus: 300 },
};

const STORAGE_KEY = "fuji-flush-speed";

export function getSpeed(): Speed {
  const saved = localStorage.getItem(STORAGE_KEY);
  return saved === "slow" || saved === "fast" ? saved : "normal";
}

export function setSpeed(speed: Speed): void {
  localStorage.setItem(STORAGE_KEY, speed);
}

export function getTiming(speed: Speed): Timing {
  return TIMINGS[speed];
}
