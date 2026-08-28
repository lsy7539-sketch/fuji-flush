const FLY_DURATION_MS = 550;

/**
 * Animates a single card flying from `fromEl` (the draw pile) to `toEl` (the
 * drawing player's seat, or the viewer's own hand) — purely cosmetic, a fixed
 * overlay appended to <body> so it survives the next renderBoard() wiping out
 * the board underneath it. Resolves once the animation has finished and the
 * overlay element has been removed.
 */
export function flyCardToPlayer(value: number, fromEl: HTMLElement, toEl: HTMLElement): Promise<void> {
  const fromRect = fromEl.getBoundingClientRect();
  const toRect = toEl.getBoundingClientRect();

  const card = document.createElement("div");
  card.className = "flying-card";
  card.textContent = String(value);
  card.style.left = `${fromRect.left + fromRect.width / 2}px`;
  card.style.top = `${fromRect.top + fromRect.height / 2}px`;
  document.body.appendChild(card);

  const dx = toRect.left + toRect.width / 2 - (fromRect.left + fromRect.width / 2);
  const dy = toRect.top + toRect.height / 2 - (fromRect.top + fromRect.height / 2);

  return new Promise((resolve) => {
    requestAnimationFrame(() => {
      card.style.transition = `transform ${FLY_DURATION_MS}ms ease, opacity ${FLY_DURATION_MS}ms ease`;
      card.style.transform = `translate(-50%, -50%) translate(${dx}px, ${dy}px) scale(0.85)`;
      card.style.opacity = "0.2";
    });
    setTimeout(() => {
      card.remove();
      resolve();
    }, FLY_DURATION_MS);
  });
}

export interface DrawEvent {
  playerId: string;
  cardId: string;
  value: number;
}

/**
 * Diffs two GameState-shaped hand lists to find exactly which cards are new
 * in `after` (present by id in `after` but not `before`) for each player —
 * robust even when the same player both played a card (removed from hand)
 * and drew one (added) in the same transition, since it compares card
 * identity rather than hand-size deltas.
 */
export function computeDrawEvents(
  before: { players: { id: string; hand: { id: string; value: number }[] }[] },
  after: { players: { id: string; hand: { id: string; value: number }[] }[] },
): DrawEvent[] {
  const events: DrawEvent[] = [];
  for (const p of after.players) {
    const beforeIds = new Set(before.players.find((b) => b.id === p.id)?.hand.map((c) => c.id) ?? []);
    for (const c of p.hand) {
      if (!beforeIds.has(c.id)) events.push({ playerId: p.id, cardId: c.id, value: c.value });
    }
  }
  return events;
}
