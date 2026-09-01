import { chooseBotMove } from "../ai/botPlayer";
import { showConfirm } from "./confirmDialog";
import { GameError, createGame, getActiveGroups, playCard, resolveTurnStart } from "../engine/gameEngine";
import { toPlayerView } from "../engine/playerView";
import { computeDiscardEvents, computeDrawEvents, flyCard } from "./drawAnimation";
import { getSpeed, getTiming, type Timing } from "./speed";
import type { GameState } from "../engine/types";
import { renderBoard } from "./render";

const HUMAN_ID = "human";

const BOT_NAME_POOL = ["카리나", "안유진", "장원영", "수지", "윈터", "미나미", "원이"];

// "초보자 전용 게임하기"'s opening explanation, shown one step at a time via
// 다음 ▶ (see runTurn's HUMAN_ID branch) instead of all at once — context
// first (why the numbers matter, why alliances matter), then the mechanics,
// then finally letting them pick a card.
const BEGINNER_INTRO_STEPS = [
  "👋 카드 구성부터 알아둘까요? 숫자가 낮을수록 카드가 많고(2는 16장이나 있어요), 높을수록 적어요 — 16~20은 딱 1장씩뿐이에요.",
  "이 게임은 모두가 손패를 다 낼 때까지 계속되기 때문에, 혼자서는 버거운 큰 수의 카드를 이기려면 같은 숫자끼리 연합해서 힘을 합치는 게 중요해요!",
  "차례마다 손패에서 카드 1장을 내요. 더 높은 숫자를 내면 테이블의 낮은 카드를 밀어내고(Flush), 상대는 새 카드를 받아요.",
  "같은 숫자를 내면 서로 연합해서 힘(POWER)을 합쳐요. 손패를 가장 먼저 다 없애면 승리!",
  "카드를 하나 골라볼까요? 🎴",
];

/**
 * @param friendNames - names picked in the setup screen's friend picker, to
 *   use for the first however-many AI seats instead of the random idol pool
 *   (main.ts caps this at playerCount - 1 already, but buildPlayerDefs below
 *   re-caps it too so this function doesn't depend on that).
 * @param beginnerMode - "초보자 전용 게임하기": reveals every hand
 *   (toPlayerView's revealAll) and swaps in describeMoveForBeginner's longer,
 *   case-by-case explanations in place of describeMove's terse ones. Still
 *   the viewer's own real game — they play their own cards same as always.
 * @param onBack - "뒤로가기": re-pick the player count (no confirmation, low stakes).
 * @param onHome - "✕": leave to the single/multi mode-select screen (confirmed first).
 */
export function startLocalMode(
  app: HTMLElement,
  playerCount: number,
  friendNames: string[],
  beginnerMode: boolean,
  onBack: () => void,
  onHome: () => void,
): void {
  let state: GameState = createGame(buildPlayerDefs(playerCount, friendNames));
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
  const describe = beginnerMode ? describeMoveForBeginner : describeMove;
  // Shown once, the very first time it's the viewer's turn in beginner mode
  // — after that the ordinary "내 차례예요" prompt is enough, since
  // describeMoveForBeginner is already explaining each case as it comes up.
  let shownBeginnerIntro = false;
  // Beginner mode's "thinking" pause before a bot's move is revealed still
  // runs on a timer (there's nothing to read yet), just slowed to 0.7x
  // playback speed like everything else here — but the pause *after* a
  // message appears is no longer a timer at all, see holdMessage below.
  const BEGINNER_TIMING_SCALE = 1 / 0.7;
  function timingFor(speedSetting: typeof speed): Timing {
    const base = getTiming(speedSetting);
    if (!beginnerMode) return base;
    return {
      think: Math.round(base.think * BEGINNER_TIMING_SCALE),
      reveal: Math.round(base.reveal * BEGINNER_TIMING_SCALE),
      eventBonus: Math.round(base.eventBonus * BEGINNER_TIMING_SCALE),
    };
  }

  // Beginner mode's message log — every explanation shown gets appended
  // here, so "◀ 뒤로" can re-display an earlier one without touching game
  // state. beginnerLogIndex is whichever entry is currently on screen.
  const beginnerLog: string[] = [];
  let beginnerLogIndex = -1;
  // Set while holdMessage is waiting on "다음 ▶" — the gate itself. Also
  // doubles as "don't let the human sneak a card in right now": state may
  // already have moved on to their turn under the hood (resolveMove already
  // applied it) before they've actually pressed 다음 on the message
  // explaining *why*.
  let resolveBeginnerNext: (() => void) | null = null;

  function pushBeginnerLog(msg: string): void {
    if (!msg) return;
    beginnerLog.push(msg);
    beginnerLogIndex = beginnerLog.length - 1;
  }

  // Used for other players' turns (bot moves, push-through resolutions) —
  // in beginner mode, logs the current message and waits for an explicit
  // "다음 ▶" click (see beginnerNext) instead of a timeout, since that's
  // something the viewer is learning about, not something they already did
  // themselves (see handlePlayCard, which never gates). Normal mode is
  // untouched: still just sleeps, scaled by notability as before.
  async function holdMessage(notable: boolean): Promise<void> {
    if (beginnerMode) {
      pushBeginnerLog(message);
      await new Promise<void>((resolve) => {
        resolveBeginnerNext = resolve;
        render();
      });
      return;
    }
    const timing = timingFor(speed);
    await sleep(notable ? timing.reveal + timing.eventBonus : 0);
  }

  function beginnerBack(): void {
    if (beginnerLogIndex <= 0) return;
    beginnerLogIndex -= 1;
    message = beginnerLog[beginnerLogIndex];
    render();
  }

  function beginnerNext(): void {
    if (beginnerLogIndex < beginnerLog.length - 1) {
      // Already-seen ground — just page forward through it, no game state
      // touched.
      beginnerLogIndex += 1;
      message = beginnerLog[beginnerLogIndex];
      render();
      return;
    }
    // Caught up to the latest — release whatever's waiting at the gate, if
    // anything (a no-op otherwise, e.g. it's genuinely the human's own turn
    // and there's nothing to advance).
    const resolve = resolveBeginnerNext;
    resolveBeginnerNext = null;
    resolve?.();
  }

  function render(): void {
    renderBoard(app, toPlayerView(state, HUMAN_ID, { revealAll: beginnerMode }), {
      message,
      paused,
      newCardId,
      winnerOrder,
      beginnerMode,
      beginnerGated: resolveBeginnerNext !== null,
      beginnerNav: beginnerMode
        ? {
            canBack: beginnerLogIndex > 0,
            canNext: beginnerLogIndex < beginnerLog.length - 1 || resolveBeginnerNext !== null,
          }
        : undefined,
      onPlayCard: handlePlayCard,
      onBack,
      onTogglePause: togglePause,
      onBeginnerBack: beginnerBack,
      onBeginnerNext: beginnerNext,
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
    // If a beginner-mode gate is currently open, the awaited holdMessage()
    // call already owns resuming the flow (via 다음 ▶) — calling runTurn()
    // here too would start a second, overlapping run.
    if (!paused && !resolveBeginnerNext) runTurn();
  }

  async function handlePlayCard(playerId: string, cardId?: string): Promise<void> {
    if (paused || resolveBeginnerNext) return;
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
    const described = describe(before, after, playerId);
    message = described.message;
    await resolveMove(before, after);
    // The viewer's own move never gates on 다음 ▶, even in beginner mode —
    // they already know what they just did; only *other* players' turns are
    // worth pausing on. Still logged (for 뒤로 later) and still held on
    // screen for a moment, just via a timer instead of a click.
    if (beginnerMode) {
      pushBeginnerLog(message);
      const timing = timingFor(speed);
      await sleep(timing.reveal + (described.notable ? timing.eventBonus : 0));
    } else {
      const timing = timingFor(speed);
      await sleep(described.notable ? timing.reveal + timing.eventBonus : 0);
    }
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
      const described = describe(before, after, current.id);
      message = described.message;
      await resolveMove(before, after);
      await holdMessage(true);
      if (paused || isFinished()) return;
      current = state.players[state.currentPlayerIndex];
    }

    if (current.id === HUMAN_ID) {
      if (current.hand.length === 0) {
        message = "";
        render();
        return;
      }
      if (beginnerMode && !shownBeginnerIntro) {
        shownBeginnerIntro = true;
        // Paged one step at a time via 다음 ▶ (holdMessage), same as any
        // other beginner-mode explanation — dumping all of this at once was
        // too much to take in before the game had even started. Only the
        // last step goes un-gated, since picking a card is itself how the
        // viewer says "I've read this."
        for (let i = 0; i < BEGINNER_INTRO_STEPS.length - 1; i++) {
          message = BEGINNER_INTRO_STEPS[i];
          await holdMessage(true);
        }
        message = BEGINNER_INTRO_STEPS[BEGINNER_INTRO_STEPS.length - 1];
        pushBeginnerLog(message);
        render();
        return;
      }
      message = beginnerMode
        ? "내 차례예요! 어떤 카드를 내야 좋을까요??? 🎴"
        : "내 차례예요! 어떤 카드를 내볼까요? 🎴";
      render();
      return;
    }

    message = `${current.name}의 차례입니다...`;
    render();
    await sleep(timingFor(speed).think);
    if (paused) return;

    const before = state;
    const cardId = chooseBotMove(state, current.id);
    const after = playCard(state, current.id, cardId);
    const described = describe(before, after, current.id);
    message = described.message || `${current.name}가 카드를 냈습니다.`;
    await resolveMove(before, after);
    await holdMessage(described.notable);
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
      // A discard flight is always a card getting flushed/pushed out — slow
      // it down in beginner mode so it's actually visible happening, not
      // just a blur (draw flights stay normal speed; nothing to explain there).
      for (const e of discardEvents) {
        const fromEl = getSeatEl(e.playerId);
        if (fromEl) flights.push(flyCard(e.value, fromEl, discardPileEl, beginnerMode ? 0.5 : 1));
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

interface MoveAnalysis {
  playerName: string;
  /** the mover already had a card on the table that just survived a full
   *  round (rules 20-26) — it (and any ally sharing its value) gets
   *  discarded together here, no draw for anyone. */
  pushThrough: { value: number; allyNames: string[] } | null;
  /** players (mover or ally) whose hand hit 0 from the push-through discard
   *  above — rule 33: can happen on someone else's turn. */
  newlyWon: { id: string; name: string }[];
  /** a new card played this turn, if any. */
  played: { value: number } | null;
  alliance: { otherNames: string[]; groupSize: number; power: number } | null;
  /** each flushed victim's owner (deduped) and the value that got flushed. */
  flushed: { name: string; value: number }[];
  /** other groups already on the table that were high enough to block a
   *  flush — only populated when the play caused neither a flush nor an
   *  alliance (see analyzeMove). */
  blockers: { names: string[]; value: number; totalValue: number; joined: boolean }[];
}

// Shared by describeMove and describeMoveForBeginner so the two presentation
// layers can never drift apart on *what* happened — only on how verbosely
// they say it.
function analyzeMove(before: GameState, after: GameState, playerId: string): MoveAnalysis {
  const name = (id: string) => after.players.find((p) => p.id === id)?.name ?? before.players.find((p) => p.id === id)?.name ?? id;

  const ownBefore = before.activeCards.find((ac) => ac.playerId === playerId);
  let pushThroughIds = new Set<string>();
  let pushThrough: MoveAnalysis["pushThrough"] = null;
  let newlyWon: MoveAnalysis["newlyWon"] = [];
  if (ownBefore) {
    const survivedGroup = before.activeCards.filter((ac) => ac.value === ownBefore.value);
    pushThroughIds = new Set(survivedGroup.map((ac) => ac.cardId));
    const allyNames = survivedGroup.filter((ac) => ac.playerId !== playerId).map((ac) => name(ac.playerId));
    pushThrough = { value: ownBefore.value, allyNames };

    const groupMemberIds = [playerId, ...survivedGroup.map((ac) => ac.playerId)];
    newlyWon = [...new Set(groupMemberIds)]
      .filter((id) => {
        const wasWinner = before.players.find((p) => p.id === id)?.isWinner;
        const isWinnerNow = after.players.find((p) => p.id === id)?.isWinner;
        return !wasWinner && isWinnerNow;
      })
      .map((id) => ({ id, name: name(id) }));
  }

  let played: MoveAnalysis["played"] = null;
  let alliance: MoveAnalysis["alliance"] = null;
  const flushed: MoveAnalysis["flushed"] = [];
  // Populated only when the play caused neither a flush nor an alliance —
  // whatever's already on the table (excluding the mover's own group) with
  // value high enough to have blocked it, so describeMoveForBeginner can
  // say *why* nothing happened instead of leaving a beginner to wonder.
  const blockers: MoveAnalysis["blockers"] = [];
  if (after.turnCounter > before.turnCounter) {
    const playedCard = after.activeCards.find((ac) => ac.playedAtTurn === after.turnCounter);
    if (playedCard) {
      played = { value: playedCard.value };

      const groupNow = after.activeCards.filter((ac) => ac.value === playedCard.value);
      if (groupNow.length > 1) {
        const others = groupNow.filter((ac) => ac.playerId !== playerId).map((ac) => name(ac.playerId));
        alliance = { otherNames: others, groupSize: groupNow.length, power: playedCard.value * groupNow.length };
      }

      const afterIds = new Set(after.activeCards.map((ac) => ac.cardId));
      const seenOwners = new Set<string>();
      for (const ac of before.activeCards) {
        if (afterIds.has(ac.cardId) || pushThroughIds.has(ac.cardId) || seenOwners.has(ac.playerId)) continue;
        seenOwners.add(ac.playerId);
        flushed.push({ name: name(ac.playerId), value: ac.value });
      }

      if (!alliance && flushed.length === 0) {
        for (const g of getActiveGroups(after.activeCards)) {
          if (g.value === playedCard.value) continue;
          blockers.push({
            names: g.cards.map((ac) => name(ac.playerId)),
            value: g.value,
            totalValue: g.totalValue,
            joined: g.cards.length > 1,
          });
        }
      }
    }
  }

  return { playerName: name(playerId), pushThrough, newlyWon, played, alliance, flushed, blockers };
}

/**
 * Turns a raw before/after state diff into a short Korean sentence describing
 * what just happened, so an AI turn (or the player's own) reads as an event
 * instead of a silent state jump. `notable` marks a flush/alliance/win — those
 * get an extra on-screen hold so the player has time to read them.
 */
export function describeMove(before: GameState, after: GameState, playerId: string): { message: string; notable: boolean } {
  const a = analyzeMove(before, after, playerId);
  const parts: string[] = [];
  let notable = false;

  if (a.pushThrough) {
    parts.push(
      a.pushThrough.allyNames.length > 0
        ? `${a.playerName}와 ${a.pushThrough.allyNames.join(", ")}의 연합 카드가 살아남아 함께 버려졌습니다.`
        : `${a.playerName}의 카드가 살아남아 버려졌습니다.`,
    );
    notable = true;
    for (const w of a.newlyWon) parts.push(`🏆 ${w.name} 승리!`);
  }

  if (a.played) {
    parts.push(`${a.playerName}가 ${a.played.value}를 냈습니다.`);
    if (a.alliance) {
      parts.push(`🤝 ${a.alliance.otherNames.join(", ")}와 연합! (${a.played.value} × ${a.alliance.groupSize} = ${a.alliance.power})`);
      notable = true;
    }
    if (a.flushed.length > 0) {
      parts.push(`💥 ${a.flushed.map((f) => f.name).join(", ")}의 카드가 밀려났습니다.`);
      notable = true;
    }
  }

  return { message: parts.join(" "), notable };
}

// "나" (the human player's own name) irregularly contracts with the subject
// particle to "내가", rather than following the usual 이/가 pattern every
// other name gets — used only by describeMoveForBeginner below.
function subjectForm(name: string): string {
  return name === "나" ? "내가" : `${name}이(가)`;
}

/**
 * Same underlying event as describeMove, but spelled out for someone who
 * doesn't know the rules yet ("초보자 전용 게임하기") — each case says *why*
 * something happened and what it means, not just that it happened.
 */
export function describeMoveForBeginner(
  before: GameState,
  after: GameState,
  playerId: string,
): { message: string; notable: boolean } {
  const a = analyzeMove(before, after, playerId);
  const parts: string[] = [];
  let notable = false;

  if (a.pushThrough) {
    const whoseCard =
      a.pushThrough.allyNames.length > 0
        ? `${a.playerName}와(과) 연합했던 ${a.pushThrough.allyNames.join(", ")}의 ${a.pushThrough.value}`
        : `${a.playerName}의 ${a.pushThrough.value}`;
    parts.push(
      `${whoseCard} 카드가 테이블을 한 바퀴 도는 동안 아무한테도 안 밀리고 살아남았어요! 그래서 버려지는데, 이번엔 새 카드를 받지 않아요 — 손패가 실제로 줄어드는 유일한 순간이에요.`,
    );
    notable = true;
    for (const w of a.newlyWon) {
      parts.push(`🏆 ${w.name}은(는) 이걸로 손패가 0장이 됐어요 — 자기 차례가 아니어도 그 자리에서 바로 승리해요!`);
    }
  }

  if (a.played) {
    parts.push(`${subjectForm(a.playerName)} ${a.played.value}을(를) 냈어요.`);
    if (a.alliance) {
      parts.push(
        `🤝 같은 숫자를 낸 ${a.alliance.otherNames.join(", ")}와(과) 연합했어요! 힘을 합치면 POWER는 ${a.played.value} × ${a.alliance.groupSize} = ${a.alliance.power} — 이보다 낮은 카드나 연합은 전부 밀려나요.`,
      );
      notable = true;
    }
    if (a.flushed.length > 0) {
      const victims = a.flushed.map((f) => `${f.name}의 ${f.value}`).join(", ");
      // When an alliance is what caused the flush, it's the alliance's
      // POWER that beat the victim, not the raw card value just played —
      // saying "6이 더 높아서" when a 6+6 alliance (POWER 12) flushed a 10
      // would be simply wrong.
      const winningValue = a.alliance ? a.alliance.power : a.played.value;
      const reason = a.alliance ? `연합 POWER(${winningValue})가` : `${winningValue}이(가)`;
      parts.push(`💥 ${reason} 더 높아서 ${victims}을(를) 밀어냈어요! 밀려난 사람은 드로우 더미에서 새 카드를 한 장 받아요.`);
      notable = true;
    }
    if (!a.alliance && a.flushed.length === 0 && a.blockers.length > 0) {
      // Nothing happened — but a beginner watching a string of "냈어요."
      // with no consequence could easily read that as "you must always
      // play higher," so spell out that a lower (or equal) card is a
      // perfectly normal, safe move.
      const blockerDesc = a.blockers
        .map((b) => (b.joined ? `${b.names.join(", ")}의 ${b.value} 연합(POWER ${b.totalValue})` : `${b.names[0]}의 ${b.value}`))
        .join(", ");
      parts.push(`${blockerDesc}이(가) 더 높거나 같아서, 아무 카드도 밀려나지 않았어요! 낮은 카드를 내는 것도 안전한 선택이에요.`);
      notable = true;
    }
  }

  return { message: parts.join(" "), notable };
}

// Picked friends fill the AI seats first; whatever's left over (including
// all of them, if no friends were picked) falls back to the random idol
// pool exactly as before.
function buildPlayerDefs(playerCount: number, friendNames: string[]): { id: string; name: string }[] {
  const seatCount = playerCount - 1;
  const chosenFriends = friendNames.slice(0, seatCount);
  const idolNames = shuffle(BOT_NAME_POOL).slice(0, seatCount - chosenFriends.length);
  const botNames = [...chosenFriends, ...idolNames];
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
