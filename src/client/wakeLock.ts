// Keeps the screen from sleeping while a game is on screen — mobile browsers
// dim/lock the screen on their own timer regardless of an active game, and a
// locked screen is also what triggers most of the WebSocket drops
// reconnect.ts works around (see networkMode.ts). Safe everywhere: the
// Wake Lock API is unsupported in some browsers/in-app webviews, and the
// request can be rejected outright in others — both are silent no-ops here,
// never a crash.
//
// The browser itself releases a held lock the moment the tab is hidden
// (screen off counts), so `wanted` tracks intent separately from whether a
// sentinel is currently held, and a visibilitychange listener re-requests
// it on return to the foreground if it's still wanted.

let sentinel: WakeLockSentinel | null = null;
let wanted = false;
let listenerAttached = false;

async function tryAcquire(): Promise<void> {
  if (!wanted || sentinel || typeof navigator === "undefined" || !("wakeLock" in navigator)) return;
  try {
    sentinel = await navigator.wakeLock.request("screen");
    sentinel.addEventListener("release", () => {
      sentinel = null;
    });
  } catch {
    sentinel = null;
  }
}

// Attached lazily (not at module load) so importing this module — e.g.
// transitively, via render.ts, from a test that never touches a real DOM —
// doesn't itself require `document` to exist.
function ensureVisibilityListener(): void {
  if (listenerAttached || typeof document === "undefined") return;
  listenerAttached = true;
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") tryAcquire();
  });
}

export function enableScreenWakeLock(): void {
  ensureVisibilityListener();
  if (wanted) return;
  wanted = true;
  tryAcquire();
}

export function disableScreenWakeLock(): void {
  wanted = false;
  const held = sentinel;
  sentinel = null;
  held?.release().catch(() => {});
}
