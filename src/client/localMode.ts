import { chooseBotMove } from "../ai/botPlayer";
import { GameError, createGame, playCard } from "../engine/gameEngine";
import { toPlayerView } from "../engine/playerView";
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
  const speed = getSpeed();

  function render(): void {
    renderBoard(app, toPlayerView(state, HUMAN_ID), {
      message,
      paused,
      onPlayCard: handlePlayCard,
      onBack,
      onTogglePause: togglePause,
      onQuit: () => {
        if (confirm("정말 게임을 나가시겠어요? 진행 상황이 사라집니다.")) {
          onHome();
        }
      },
    });
  }

  function togglePause(): void {
    paused = !paused;
    render();
    if (!paused) scheduleBotTurnIfNeeded();
  }

  function handlePlayCard(playerId: string, cardId?: string): void {
    if (paused) return;
    const before = state;
    try {
      state = playCard(state, playerId, cardId);
    } catch (err) {
      if (err instanceof GameError) {
        message = err.message;
        render();
        return;
      }
      throw err;
    }
    const described = describeMove(before, state, playerId);
    message = described.message;
    render();
    const timing = getTiming(speed);
    const holdMs = described.notable ? timing.reveal + timing.eventBonus : 0;
    setTimeout(scheduleBotTurnIfNeeded, holdMs);
  }

  function scheduleBotTurnIfNeeded(): void {
    if (paused || state.gameStatus === "FINISHED") return;
    const current = state.players[state.currentPlayerIndex];
    if (current.id === HUMAN_ID) return;

    const timing = getTiming(speed);
    message = `${current.name}의 차례입니다...`;
    render();

    setTimeout(() => {
      if (paused) return;
      const before = state;
      const cardId = chooseBotMove(state, current.id);
      state = playCard(state, current.id, cardId);
      const described = describeMove(before, state, current.id);
      message = described.message || `${current.name}가 카드를 냈습니다.`;
      render();
      const holdMs = timing.reveal + (described.notable ? timing.eventBonus : 0);
      setTimeout(scheduleBotTurnIfNeeded, holdMs);
    }, timing.think);
  }

  render();
  scheduleBotTurnIfNeeded();
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
