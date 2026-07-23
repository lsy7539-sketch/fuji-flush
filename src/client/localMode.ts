import { chooseBotMove } from "../ai/botPlayer";
import { GameError, createGame, playCard } from "../engine/gameEngine";
import { toPlayerView } from "../engine/playerView";
import type { GameState } from "../engine/types";
import { renderBoard } from "./render";

const HUMAN_ID = "human";
const BOT_MOVE_DELAY_MS = 500;

const BOT_NAME_POOL = ["카리나", "안유진", "장원영", "수지", "윈터", "미나미", "원이"];

export function startLocalMode(app: HTMLElement, playerCount: number): void {
  let state: GameState = createGame(buildPlayerDefs(playerCount));
  let message = "";

  function render(): void {
    renderBoard(app, toPlayerView(state, HUMAN_ID), {
      message,
      onPlayCard: handlePlayCard,
    });
  }

  function handlePlayCard(playerId: string, cardId?: string): void {
    try {
      state = playCard(state, playerId, cardId);
      message = "";
    } catch (err) {
      if (err instanceof GameError) {
        message = err.message;
        render();
        return;
      }
      throw err;
    }
    render();
    scheduleBotTurnIfNeeded();
  }

  function scheduleBotTurnIfNeeded(): void {
    if (state.gameStatus === "FINISHED") return;
    const current = state.players[state.currentPlayerIndex];
    if (current.id === HUMAN_ID) return;

    setTimeout(() => {
      const cardId = chooseBotMove(state, current.id);
      state = playCard(state, current.id, cardId);
      message = "";
      render();
      scheduleBotTurnIfNeeded();
    }, BOT_MOVE_DELAY_MS);
  }

  render();
  scheduleBotTurnIfNeeded();
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
