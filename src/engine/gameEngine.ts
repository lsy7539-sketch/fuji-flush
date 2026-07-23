import type { ActiveCard, Card, CardGroup, GameState, Player } from "./types";
import { createDeck, shuffleDeck } from "./deck";

const HAND_SIZE_SMALL = 6; // 3~6 players
const HAND_SIZE_LARGE = 5; // 7~8 players
const LARGE_GROUP_THRESHOLD = 7;

export class GameError extends Error {}

export function getInitialHandSize(playerCount: number): number {
  if (playerCount < 3 || playerCount > 8) {
    throw new GameError(`플레이어 수는 3~8명이어야 합니다. (입력: ${playerCount})`);
  }
  return playerCount >= LARGE_GROUP_THRESHOLD ? HAND_SIZE_LARGE : HAND_SIZE_SMALL;
}

export interface CreateGameOptions {
  shuffle?: (deck: Card[]) => Card[];
}

export function createGame(
  playerDefs: { id: string; name: string }[],
  options: CreateGameOptions = {},
): GameState {
  const handSize = getInitialHandSize(playerDefs.length);
  const shuffle = options.shuffle ?? shuffleDeck;
  const deck = shuffle(createDeck());

  const players: Player[] = playerDefs.map((def) => ({
    id: def.id,
    name: def.name,
    hand: [],
    isWinner: false,
  }));

  let cursor = 0;
  for (let round = 0; round < handSize; round++) {
    for (const player of players) {
      player.hand.push(deck[cursor]);
      cursor++;
    }
  }

  return {
    players,
    drawPile: deck.slice(cursor),
    discardPile: [],
    currentPlayerIndex: 0,
    gameStatus: "IN_PROGRESS",
    round: 1,
    activeCards: [],
    turnCounter: 0,
  };
}

function cloneState(state: GameState): GameState {
  return {
    players: state.players.map((p) => ({ ...p, hand: [...p.hand] })),
    drawPile: [...state.drawPile],
    discardPile: [...state.discardPile],
    currentPlayerIndex: state.currentPlayerIndex,
    gameStatus: state.gameStatus,
    round: state.round,
    activeCards: state.activeCards.map((ac) => ({ ...ac })),
    turnCounter: state.turnCounter,
  };
}

function findPlayer(state: GameState, playerId: string): Player {
  const player = state.players.find((p) => p.id === playerId);
  if (!player) throw new GameError(`알 수 없는 플레이어입니다: ${playerId}`);
  return player;
}

// Cards with the same raw value always merge into one group (Joining Forces).
// A card equal to another group's *total* never joins that group — only
// matching individual values merge (rule 9).
function computeGroups(activeCards: ActiveCard[]): Map<number, CardGroup> {
  const groups = new Map<number, CardGroup>();
  for (const ac of activeCards) {
    const group = groups.get(ac.value);
    if (group) {
      group.cards.push(ac);
      group.totalValue += ac.value;
    } else {
      groups.set(ac.value, { value: ac.value, groupId: null, totalValue: ac.value, cards: [ac] });
    }
  }
  for (const group of groups.values()) {
    group.groupId = group.cards.length > 1 ? `group-${group.value}` : null;
  }
  return groups;
}

function applyGroupIds(activeCards: ActiveCard[], groups: Map<number, CardGroup>): void {
  for (const ac of activeCards) {
    const group = groups.get(ac.value);
    ac.groupId = group && group.cards.length > 1 ? group.groupId : null;
  }
}

export function getActiveGroups(activeCards: ActiveCard[]): CardGroup[] {
  return Array.from(computeGroups(activeCards).values());
}

function drawCardForPlayer(state: GameState, playerId: string): void {
  if (state.drawPile.length === 0) return;
  const card = state.drawPile.shift()!;
  findPlayer(state, playerId).hand.push(card);
}

function removeActiveCard(state: GameState, cardId: string): ActiveCard | undefined {
  const index = state.activeCards.findIndex((ac) => ac.cardId === cardId);
  if (index === -1) return undefined;
  const [removed] = state.activeCards.splice(index, 1);
  return removed;
}

function checkWinners(state: GameState): void {
  for (const player of state.players) {
    if (player.isWinner) continue;
    const hasActiveCard = state.activeCards.some((ac) => ac.playerId === player.id);
    if (player.hand.length === 0 && !hasActiveCard) {
      player.isWinner = true;
    }
  }
  if (state.players.every((p) => p.isWinner)) {
    state.gameStatus = "FINISHED";
  }
}

function advanceTurn(state: GameState): void {
  if (state.gameStatus === "FINISHED") return;
  const total = state.players.length;
  let candidate = state.currentPlayerIndex;
  for (let i = 0; i < total; i++) {
    candidate = (candidate + 1) % total;
    if (!state.players[candidate].isWinner) {
      state.currentPlayerIndex = candidate;
      return;
    }
  }
  state.gameStatus = "FINISHED";
}

/**
 * Resolves one player's turn.
 *
 * `cardId` is optional because a player whose last active card survives to
 * push-through while their hand is already empty has nothing left to play —
 * they win right there (rule 14) instead of reaching step 2.
 */
export function playCard(state: GameState, playerId: string, cardId?: string): GameState {
  const next = cloneState(state);
  const currentPlayer = next.players[next.currentPlayerIndex];

  if (!currentPlayer || currentPlayer.id !== playerId) {
    throw new GameError(`지금은 ${currentPlayer?.id ?? "알 수 없음"}의 차례입니다.`);
  }
  if (currentPlayer.isWinner) {
    throw new GameError(`${playerId}는 이미 승리하여 더 이상 플레이할 수 없습니다.`);
  }

  // Step 1: push-through cleanup of this player's surviving active card, if any.
  const existingActive = next.activeCards.find((ac) => ac.playerId === playerId);
  if (existingActive) {
    removeActiveCard(next, existingActive.cardId);
    next.discardPile.push({ id: existingActive.cardId, value: existingActive.value });
  }

  if (currentPlayer.hand.length === 0) {
    checkWinners(next);
    advanceTurn(next);
    return next;
  }

  if (!cardId) {
    throw new GameError(`${playerId}는 낼 카드를 선택해야 합니다.`);
  }
  const cardIndex = currentPlayer.hand.findIndex((c) => c.id === cardId);
  if (cardIndex === -1) {
    throw new GameError(`${playerId}의 손패에 카드 ${cardId}가 없습니다.`);
  }

  // Step 2: play the chosen card.
  const [playedCard] = currentPlayer.hand.splice(cardIndex, 1);
  next.turnCounter += 1;
  next.activeCards.push({
    cardId: playedCard.id,
    playerId,
    value: playedCard.value,
    playedAtTurn: next.turnCounter,
    groupId: null,
  });

  // Step 3: recompute groups (Joining Forces merges same-value cards only).
  let groups = computeGroups(next.activeCards);
  applyGroupIds(next.activeCards, groups);
  const referenceGroup = groups.get(playedCard.value)!;

  // Step 4: any other group whose total is strictly lower gets flushed.
  const toFlush: ActiveCard[] = [];
  for (const group of groups.values()) {
    if (group.value === referenceGroup.value) continue;
    if (group.totalValue < referenceGroup.totalValue) {
      toFlush.push(...group.cards);
    }
  }

  // Step 5: flush + draw replacement for each flushed card's owner.
  for (const ac of toFlush) {
    removeActiveCard(next, ac.cardId);
    next.discardPile.push({ id: ac.cardId, value: ac.value });
    drawCardForPlayer(next, ac.playerId);
  }
  groups = computeGroups(next.activeCards);
  applyGroupIds(next.activeCards, groups);

  // Step 6: win-condition check (may resolve multiple simultaneous winners).
  checkWinners(next);

  // Step 7: advance to the next player who hasn't already won.
  advanceTurn(next);

  return next;
}
