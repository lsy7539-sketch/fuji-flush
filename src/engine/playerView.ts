import type { ActiveCard, Card, GameState, GameStatus } from "./types";

export interface HandView {
  id: string;
  name: string;
  isWinner: boolean;
  cards: Card[] | null;
  handSize: number;
}

export interface PlayerFacingState {
  viewerId: string;
  players: HandView[];
  drawPileCount: number;
  discardPileCount: number;
  currentPlayerIndex: number;
  gameStatus: GameStatus;
  round: number;
  activeCards: ActiveCard[];
  turnCounter: number;
}

/**
 * Redacts a GameState down to what one specific player is allowed to see:
 * their own hand in full, everyone else's hand as a count only. Active
 * cards on the table are already public once played, so they pass through
 * unchanged.
 */
export function toPlayerView(state: GameState, viewerId: string): PlayerFacingState {
  return {
    viewerId,
    players: state.players.map((player) => ({
      id: player.id,
      name: player.name,
      isWinner: player.isWinner,
      cards: player.id === viewerId ? [...player.hand] : null,
      handSize: player.hand.length,
    })),
    drawPileCount: state.drawPile.length,
    discardPileCount: state.discardPile.length,
    currentPlayerIndex: state.currentPlayerIndex,
    gameStatus: state.gameStatus,
    round: state.round,
    activeCards: state.activeCards.map((ac) => ({ ...ac })),
    turnCounter: state.turnCounter,
  };
}
