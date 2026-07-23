import { chooseBotMove } from "../ai/botPlayer";
import { GameError, createGame, playCard } from "../engine/gameEngine";
import { toPlayerView } from "../engine/playerView";
import type { GameState } from "../engine/types";
import { renderBoard } from "./render";

const HUMAN_ID = "human";
const BOT_MOVE_DELAY_MS = 500;

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
  const defs = [{ id: HUMAN_ID, name: "나" }];
  for (let i = 1; i < playerCount; i++) {
    defs.push({ id: `bot-${i}`, name: `AI ${i}` });
  }
  return defs;
}
