// The speed picker's "numbered coordinate axis" look (see main.ts's
// original 혼자하기 version) — pulled out here so 같이하기's lobby (host
// picks a pace before starting) can render the exact same widget instead
// of a second copy of this markup.
import { SPEED_ORDER, type Speed } from "../shared/speed";

// Only the 3 anchor points carry a word — 2 and 4 are just numbered dots
// between them, read off the number-line rather than named individually.
const ANCHOR_LABELS: Partial<Record<Speed, string>> = {
  veryslow: "느리게",
  normal: "보통",
  veryfast: "빠르게",
};

const ARIA_LABELS: Record<Speed, string> = {
  veryslow: "느리게",
  slow: "조금 느리게",
  normal: "보통",
  fast: "조금 빠르게",
  veryfast: "빠르게",
};

export function renderSpeedScale(current: Speed): string {
  return `
    <div class="speed-scale" role="group" aria-label="게임 진행 속도">
      ${SPEED_ORDER.map(
        (s, i) => `<span class="speed-num${s === current ? " active" : ""}" style="grid-column:${i + 1}">${i + 1}</span>`,
      ).join("")}
      ${SPEED_ORDER.map(
        (s, i) =>
          `<button type="button" class="speed-dot${s === current ? " active" : ""}" data-speed-option="${s}" aria-label="${ARIA_LABELS[s]}" style="grid-column:${i + 1}"></button>`,
      ).join("")}
      ${SPEED_ORDER.map(
        (s, i) =>
          `<span class="speed-anchor-label${s === current ? " active" : ""}" style="grid-column:${i + 1}">${ANCHOR_LABELS[s] ?? ""}</span>`,
      ).join("")}
    </div>
  `;
}

// Wires up whatever .speed-dot buttons renderSpeedScale's output produced,
// inside the given container.
export function bindSpeedScale(container: ParentNode, onSelect: (speed: Speed) => void): void {
  container.querySelectorAll<HTMLButtonElement>(".speed-dot[data-speed-option]").forEach((btn) => {
    btn.addEventListener("click", () => onSelect(btn.dataset.speedOption as Speed));
  });
}
