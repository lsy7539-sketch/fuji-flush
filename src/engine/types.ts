export interface Card {
  id: string;
  value: number;
}

export type GameStatus = "WAITING" | "IN_PROGRESS" | "FINISHED";

export interface ActiveCard {
  cardId: string;
  playerId: string;
  value: number;
  playedAtTurn: number;
  groupId: string | null;
}

export interface Player {
  id: string;
  name: string;
  hand: Card[];
  isWinner: boolean;
}

export interface GameState {
  players: Player[];
  drawPile: Card[];
  discardPile: Card[];
  currentPlayerIndex: number;
  gameStatus: GameStatus;
  round: number;
  activeCards: ActiveCard[];
  turnCounter: number;
}

// A group is derived, not persisted: cards sharing the same raw `value`
// always form one group (see gameEngine.computeGroups). groupId is
// recomputed deterministically as `group-<value>` whenever a group has
// 2+ members, so it never needs to be tracked across turns.
export interface CardGroup {
  value: number;
  groupId: string | null;
  totalValue: number;
  cards: ActiveCard[];
}
