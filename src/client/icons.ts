// Small shared SVG icons used by more than one screen.

export function refreshIconSvg(): string {
  // A blocky pixel-donut ring reads as an ambiguous blob at 18px (tried it),
  // so unlike the other menu icons this one is a plain smooth glyph — a
  // circular arrow needs a real curve + arrowhead to actually read as
  // "refresh" rather than "circle with a bite out of it".
  return `
<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
  <path
    fill="currentColor"
    d="M17.65 6.35A7.96 7.96 0 0 0 12 4a8 8 0 1 0 7.75 10h-2.08A6 6 0 1 1 12 6a5.96 5.96 0 0 1 4.22 1.78L13 11h7V4l-2.35 2.35z"
  />
</svg>`;
}
