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
  /** the most recently discarded card, face up — discards are already public
   *  once played, so showing the top of the pile leaks nothing. */
  topDiscard: Card | null;
  currentPlayerIndex: number;
  gameStatus: GameStatus;
  round: number;
  activeCards: ActiveCard[];
  turnCounter: number;
}

export interface PlayerViewOptions {
  /** "초보자 전용 게임하기" (localMode.ts) — shows every hand face-up so a
   *  beginner can see the whole table, not just their own cards. Never used
   *  for the server's own toPlayerView calls (rooms.ts), where hiding other
   *  players' hands is a real security boundary, not just a UI choice. */
  revealAll?: boolean;
}

/**
 * Redacts a GameState down to what one specific player is allowed to see:
 * their own hand in full, everyone else's hand as a count only (unless
 * `revealAll` is set — see PlayerViewOptions). Active cards on the table are
 * already public once played, so they pass through unchanged.
 */
export function toPlayerView(
  state: GameState,
  viewerId: string,
  options: PlayerViewOptions = {},
): PlayerFacingState {
  return {
    viewerId,
    players: state.players.map((player) => ({
      id: player.id,
      name: player.name,
      isWinner: player.isWinner,
      cards: player.id === viewerId || options.revealAll ? [...player.hand] : null,
      handSize: player.hand.length,
    })),
    drawPileCount: state.drawPile.length,
    discardPileCount: state.discardPile.length,
    topDiscard: state.discardPile.length > 0 ? { ...state.discardPile[state.discardPile.length - 1] } : null,
    currentPlayerIndex: state.currentPlayerIndex,
    gameStatus: state.gameStatus,
    round: state.round,
    activeCards: state.activeCards.map((ac) => ({ ...ac })),
    turnCounter: state.turnCounter,
  };
}
