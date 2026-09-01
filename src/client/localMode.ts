import { chooseBotMove } from "../ai/botPlayer";
import { showConfirm } from "./confirmDialog";
import { GameError, createGame, playCard, resolveTurnStart } from "../engine/gameEngine";
import { toPlayerView } from "../engine/playerView";
import { computeDiscardEvents, computeDrawEvents, flyCard } from "./drawAnimation";
import { getSpeed, getTiming } from "./speed";
import type { GameState } from "../engine/types";
import { renderBoard } from "./render";

const HUMAN_ID = "human";

const BOT_NAME_POOL = ["카리나", "안유진", "장원영", "수지", "윈터", "미나미", "원이"];

/**
 * @param onBack - "뒤로가기": re-pick the player count (no confirmation, low stakes).
 * @param onHome - "✕": leave to the single/multi mode-select screen (confirmed first).
 */
export function startLocalMode(
  app: HTMLElement,
  playerCount: number,
  onBack: () => void,
  onHome: () => void,
): void {
  let state: GameState = createGame(buildPlayerDefs(playerCount));
  let message = "";
  let paused = false;
  // The viewer's own most recently drawn card, so the hand can mark it — set
  // when it lands (resolveMove) and cleared once the viewer acts on their
  // own turn (they've had a chance to notice it by then).
  let newCardId: string | null = null;
  // Win order for the little "1등 / 2등 / ..." list next to the discard
  // pile — the engine only tracks *whether* someone has won, not in what
  // order, so this is tracked here as it happens (recordNewWinners).
  const winnerOrder: string[] = [];
  const speed = getSpeed();

  function render(): void {
    renderBoard(app, toPlayerView(state, HUMAN_ID), {
      message,
      paused,
      newCardId,
      winnerOrder,
      onPlayCard: handlePlayCard,
      onBack,
      onTogglePause: togglePause,
      onQuit: async () => {
        if (await showConfirm("정말 게임을 나가시겠어요? 진행 상황이 사라집니다.")) {
          onHome();
        }
      },
    });
  }

  // A plain function call (rather than repeating `state.gameStatus ===
  // "FINISHED"` inline) so TS doesn't narrow it away across the awaits in
  // runTurn(), where `state` is reassigned by a call it can't see into.
  function isFinished(): boolean {
    return state.gameStatus === "FINISHED";
  }

  function togglePause(): void {
    paused = !paused;
    render();
    if (!paused) runTurn();
  }

  async function handlePlayCard(playerId: string, cardId?: string): Promise<void> {
    if (paused) return;
    newCardId = null;
    const before = state;
    let after: GameState;
    try {
      after = playCard(state, playerId, cardId);
    } catch (err) {
      if (err instanceof GameError) {
        message = err.message;
        render();
        return;
      }
      throw err;
    }
    const described = describeMove(before, after, playerId);
    message = described.message;
    await resolveMove(before, after);
    const timing = getTiming(speed);
    await sleep(described.notable ? timing.reveal + timing.eventBonus : 0);
    runTurn();
  }

  // Drives whoever's turn it currently is, in two phases (rules 20-26,
  // section 22/45): first, if they already have a card that survived a full
  // round, it resolves on its own — its own message, its own discard
  // animation — *before* anyone picks a new card, never bundled into the
  // same beat as the next play. Only then does the current player (human:
  // wait for a click; bot: think, then play) actually put a new card down.
  async function runTurn(): Promise<void> {
    if (paused || isFinished()) return;
    let current = state.players[state.currentPlayerIndex];

    // A loop, not a single check: resolving one player's push-through can
    // itself advance the turn (rule 14 — their hand was already empty, so
    // clearing this card just won them the game with nothing left to play),
    // which could hand the turn to someone who *also* has a card waiting to
    // resolve the exact same way.
    while (state.activeCards.some((ac) => ac.playerId === current.id)) {
      const before = state;
      const after = resolveTurnStart(state, current.id);
      const described = describeMove(before, after, current.id);
      message = described.message;
      await resolveMove(before, after);
      const timing = getTiming(speed);
      await sleep(timing.reveal + timing.eventBonus);
      if (paused || isFinished()) return;
      current = state.players[state.currentPlayerIndex];
    }

    if (current.id === HUMAN_ID) {
      message = current.hand.length === 0 ? "" : "당신 차례예요! 어떤 카드를 내볼까요? 🎴";
      render();
      return;
    }

    const timing = getTiming(speed);
    message = `${current.name}의 차례입니다...`;
    render();
    await sleep(timing.think);
    if (paused) return;

    const before = state;
    const cardId = chooseBotMove(state, current.id);
    const after = playCard(state, current.id, cardId);
    const described = describeMove(before, after, current.id);
    message = described.message || `${current.name}가 카드를 냈습니다.`;
    await resolveMove(before, after);
    await sleep(timing.reveal + (described.notable ? timing.eventBonus : 0));
    runTurn();
  }

  // Shows the move's result (played card, flush, alliance) immediately, but
  // holds a discarded card on its owner's seat and a newly-drawn card out of
  // its owner's hand until their flying-card animations actually land, so
  // the board on screen doesn't jump ahead of what the player sees happen
  // (rules 20-26 and 35, section 43-44).
  async function resolveMove(before: GameState, after: GameState): Promise<void> {
    recordNewWinners(before, after);
    const discardEvents = computeDiscardEvents(before, after);
    const drawEvents = computeDrawEvents(before, after);

    if (discardEvents.length === 0 && drawEvents.length === 0) {
      state = after;
      render();
      return;
    }

    const discardedCardIds = new Set(discardEvents.map((e) => e.cardId));
    const drawnCardIds = new Set(drawEvents.map((e) => e.cardId));
    const stillOnTable = before.activeCards.filter((ac) => discardedCardIds.has(ac.cardId));
    state = {
      ...after,
      activeCards: [...after.activeCards, ...stillOnTable],
      players: after.players.map((p) => ({
        ...p,
        hand: p.hand.filter((c) => !drawnCardIds.has(c.id)),
      })),
    };
    render();

    const drawPileEl = app.querySelector<HTMLElement>("#draw-pile");
    const discardPileEl = app.querySelector<HTMLElement>("#discard-pile");
    const flights: Promise<void>[] = [];
    if (discardPileEl) {
      for (const e of discardEvents) {
        const fromEl = getSeatEl(e.playerId);
        if (fromEl) flights.push(flyCard(e.value, fromEl, discardPileEl));
      }
    }
    if (drawPileEl) {
      for (const e of drawEvents) {
        const toEl = getSeatEl(e.playerId);
        if (toEl) flights.push(flyCard(e.value, drawPileEl, toEl));
      }
    }
    await Promise.all(flights);

    // Always land the final state once every animation finishes, even if the
    // game got paused mid-flight — otherwise a card would be stuck in limbo
    // (still on the table, or missing from every hand) until it un-pauses.
    const humanDraw = drawEvents.find((e) => e.playerId === HUMAN_ID);
    if (humanDraw) newCardId = humanDraw.cardId;
    state = after;
    render();

    // The render above already marks it (.is-new, from newCardId) in a way
    // that survives every later re-render until the viewer acts — this is
    // just the one-shot arrival pulse on top of that, for this instant only.
    if (humanDraw) {
      app.querySelector<HTMLElement>(`.hand-card[data-card-id="${humanDraw.cardId}"]`)?.classList.add("just-drawn");
    }
  }

  function recordNewWinners(before: GameState, after: GameState): void {
    for (const p of after.players) {
      if (!p.isWinner || winnerOrder.includes(p.id)) continue;
      const wasWinner = before.players.find((b) => b.id === p.id)?.isWinner;
      if (!wasWinner) winnerOrder.push(p.id);
    }
  }

  function getSeatEl(playerId: string): HTMLElement | null {
    return playerId === HUMAN_ID
      ? app.querySelector<HTMLElement>(".my-hand")
      : app.querySelector<HTMLElement>(`.opponent[data-player-id="${playerId}"]`);
  }

  render();
  runTurn();
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Turns a raw before/after state diff into a short Korean sentence describing
 * what just happened, so an AI turn (or the player's own) reads as an event
 * instead of a silent state jump. `notable` marks a flush/alliance/win — those
 * get an extra on-screen hold so the player has time to read them.
 */
export function describeMove(
  before: GameState,
  after: GameState,
  playerId: string,
): { message: string; notable: boolean } {
  const name = (id: string) => after.players.find((p) => p.id === id)?.name ?? before.players.find((p) => p.id === id)?.name ?? id;
  const parts: string[] = [];
  let notable = false;

  // Push-through: the mover already had a card sitting on the table before
  // this call — it (and any ally sharing its value) just survived a full
  // round and got discarded together, no draw for anyone (rules 20-26).
  const ownBefore = before.activeCards.find((ac) => ac.playerId === playerId);
  let pushThroughIds = new Set<string>();
  if (ownBefore) {
    const survivedGroup = before.activeCards.filter((ac) => ac.value === ownBefore.value);
    pushThroughIds = new Set(survivedGroup.map((ac) => ac.cardId));
    const allyNames = survivedGroup.filter((ac) => ac.playerId !== playerId).map((ac) => name(ac.playerId));
    parts.push(
      allyNames.length > 0
        ? `${name(playerId)}와 ${allyNames.join(", ")}의 연합 카드가 살아남아 함께 버려졌습니다.`
        : `${name(playerId)}의 카드가 살아남아 버려졌습니다.`,
    );
    notable = true;

    const groupMemberIds = [playerId, ...survivedGroup.map((ac) => ac.playerId)];
    const newlyWon = [...new Set(groupMemberIds)].filter((id) => {
      const wasWinner = before.players.find((p) => p.id === id)?.isWinner;
      const isWinnerNow = after.players.find((p) => p.id === id)?.isWinner;
      return !wasWinner && isWinnerNow;
    });
    for (const id of newlyWon) parts.push(`🏆 ${name(id)} 승리!`);
  }

  // A new card played this turn?
  if (after.turnCounter > before.turnCounter) {
    const played = after.activeCards.find((ac) => ac.playedAtTurn === after.turnCounter);
    if (played) {
      parts.push(`${name(playerId)}가 ${played.value}를 냈습니다.`);

      const groupNow = after.activeCards.filter((ac) => ac.value === played.value);
      if (groupNow.length > 1) {
        const others = groupNow.filter((ac) => ac.playerId !== playerId).map((ac) => name(ac.playerId));
        parts.push(`🤝 ${others.join(", ")}와 연합! (${played.value} × ${groupNow.length} = ${played.value * groupNow.length})`);
        notable = true;
      }

      const afterIds = new Set(after.activeCards.map((ac) => ac.cardId));
      const flushedIds = before.activeCards
        .filter((ac) => !afterIds.has(ac.cardId) && !pushThroughIds.has(ac.cardId))
        .map((ac) => ({ cardId: ac.cardId, playerId: ac.playerId }));
      if (flushedIds.length > 0) {
        const victimNames = [...new Set(flushedIds.map((ac) => name(ac.playerId)))];
        parts.push(`💥 ${victimNames.join(", ")}의 카드가 밀려났습니다.`);
        notable = true;
      }
    }
  }

  return { message: parts.join(" "), notable };
}

function buildPlayerDefs(playerCount: number): { id: string; name: string }[] {
  const botNames = shuffle(BOT_NAME_POOL);
  const defs = [{ id: HUMAN_ID, name: "나" }];
  for (let i = 1; i < playerCount; i++) {
    defs.push({ id: `bot-${i}`, name: botNames[i - 1] ?? `AI ${i}` });
  }
  return defs;
}

function shuffle<T>(items: T[]): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}
