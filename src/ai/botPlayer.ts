import { getActiveGroups, playCard } from "../engine/gameEngine";
import type { GameState } from "../engine/types";

interface Candidate {
  cardId: string;
  cardValue: number;
  ownTotal: number;
  isSafe: boolean;
}

/**
 * Picks a card for a bot to play. Uses `playCard` itself as a pure dry-run
 * simulator per candidate card, rather than re-deriving flush/Joining-Forces
 * math here — the engine is the single source of truth for those rules.
 *
 * "Safe" means: after this play resolves, nothing else left on the table
 * already outranks the group this card ends up in (i.e. nothing is
 * positioned to flush it before the bot's own next turn). Among safe
 * options the lowest card is kept to hoard higher cards for later; when
 * nothing is safe, the option with the highest resulting group total is
 * the least-bad choice.
 */
export function chooseBotMove(state: GameState, playerId: string): string | undefined {
  const bot = state.players.find((p) => p.id === playerId);
  if (!bot || bot.hand.length === 0) return undefined;

  const candidates: Candidate[] = bot.hand.map((card) => {
    const result = playCard(state, playerId, card.id);
    const groups = getActiveGroups(result.activeCards);
    const ownGroup = groups.find((g) => g.cards.some((ac) => ac.cardId === card.id))!;
    const isSafe = groups.every((g) => g === ownGroup || g.totalValue < ownGroup.totalValue);
    return { cardId: card.id, cardValue: card.value, ownTotal: ownGroup.totalValue, isSafe };
  });

  const safeCandidates = candidates.filter((c) => c.isSafe);
  if (safeCandidates.length > 0) {
    return safeCandidates.reduce((lowest, c) => (c.cardValue < lowest.cardValue ? c : lowest))
      .cardId;
  }

  return candidates.reduce((best, c) => (c.ownTotal > best.ownTotal ? c : best)).cardId;
}
