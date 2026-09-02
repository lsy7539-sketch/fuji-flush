const FLY_DURATION_MS = 550;

/**
 * Animates a single card flying from `fromEl` to `toEl` — the draw pile to a
 * seat when a card is drawn, or a seat to the discard pile when one is
 * discarded (Flush or a successful push-through). Purely cosmetic: a fixed
 * overlay appended to <body> so it survives the next renderBoard() wiping out
 * the board underneath it. Resolves once the animation has finished and the
 * overlay element has been removed.
 *
 * @param value - the face to show, or `null` for a face-down card back —
 *   used in 같이하기 (networkMode.ts) when animating an *opponent's* draw,
 *   since their new card's identity is redacted same as everyone else's
 *   hidden hand; showing a real value there would leak it.
 * @param speedMultiplier - 1 = normal; e.g. 0.5 doubles the duration, for
 *   "초보자 전용 게임하기"'s slower flushed-card animation (localMode.ts).
 */
export function flyCard(
  value: number | null,
  fromEl: HTMLElement,
  toEl: HTMLElement,
  speedMultiplier = 1,
): Promise<void> {
  const duration = FLY_DURATION_MS / speedMultiplier;
  const fromRect = fromEl.getBoundingClientRect();
  const toRect = toEl.getBoundingClientRect();

  const card = document.createElement("div");
  card.className = value === null ? "flying-card face-down" : "flying-card";
  if (value !== null) card.textContent = String(value);
  card.style.left = `${fromRect.left + fromRect.width / 2}px`;
  card.style.top = `${fromRect.top + fromRect.height / 2}px`;
  document.body.appendChild(card);

  const dx = toRect.left + toRect.width / 2 - (fromRect.left + fromRect.width / 2);
  const dy = toRect.top + toRect.height / 2 - (fromRect.top + fromRect.height / 2);

  return new Promise((resolve) => {
    requestAnimationFrame(() => {
      card.style.transition = `transform ${duration}ms ease, opacity ${duration}ms ease`;
      card.style.transform = `translate(-50%, -50%) translate(${dx}px, ${dy}px) scale(0.85)`;
      card.style.opacity = "0.2";
    });
    setTimeout(() => {
      card.remove();
      resolve();
    }, duration);
  });
}

export interface DrawEvent {
  playerId: string;
  cardId: string;
  /** null = the drawn card's identity isn't known to us — see
   *  computeDrawEventsForView, used when the "hand" we're diffing is
   *  someone else's redacted one. */
  value: number | null;
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

/**
 * Same idea as computeDrawEvents, but for 같이하기's own redacted
 * PlayerFacingState (networkMode.ts) instead of a full GameState — only the
 * viewer's own `cards` are ever populated (everyone else's is `null`, a real
 * security boundary, not just a UI choice — see playerView.ts), so an
 * opponent's draw can only ever be detected as "their handSize went up by
 * N", with no way to know which N cards. Those become `value: null` events
 * (flyCard renders those as a face-down card back).
 */
export function computeDrawEventsForView(
  before: { players: { id: string; cards: { id: string; value: number }[] | null; handSize: number }[] },
  after: { players: { id: string; cards: { id: string; value: number }[] | null; handSize: number }[] },
  viewerId: string,
): DrawEvent[] {
  const events: DrawEvent[] = [];
  for (const p of after.players) {
    const beforePlayer = before.players.find((b) => b.id === p.id);
    if (p.id === viewerId && p.cards) {
      const beforeIds = new Set(beforePlayer?.cards?.map((c) => c.id) ?? []);
      for (const c of p.cards) {
        if (!beforeIds.has(c.id)) events.push({ playerId: p.id, cardId: c.id, value: c.value });
      }
      continue;
    }
    const delta = p.handSize - (beforePlayer?.handSize ?? 0);
    for (let i = 0; i < delta; i++) {
      events.push({ playerId: p.id, cardId: `${p.id}-hidden-draw-${i}`, value: null });
    }
  }
  return events;
}

export interface DiscardEvent {
  playerId: string;
  cardId: string;
  value: number;
}

/**
 * Finds every active (table) card present before a move and gone after it —
 * a Flush victim's card, or a push-through survivor's own card — regardless
 * of *why* it left, so the seat-to-discard-pile animation always has
 * something concrete to fly.
 */
export function computeDiscardEvents(
  before: { activeCards: { cardId: string; playerId: string; value: number }[] },
  after: { activeCards: { cardId: string; playerId: string; value: number }[] },
): DiscardEvent[] {
  const afterIds = new Set(after.activeCards.map((ac) => ac.cardId));
  return before.activeCards
    .filter((ac) => !afterIds.has(ac.cardId))
    .map((ac) => ({ playerId: ac.playerId, cardId: ac.cardId, value: ac.value }));
}
