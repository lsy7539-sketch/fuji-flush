import { getActiveGroups } from "../engine/gameEngine";
import type { PlayerFacingState } from "../engine/playerView";
import type { Card } from "../engine/types";
import { getHandSort, setHandSort, sortByValue } from "./handSort";

export interface BoardCallbacks {
  message: string;
  paused: boolean;
  /** id of a hand card the viewer just drew, to highlight — cleared by the
   *  caller once it's no longer "new" (e.g. once they act on their turn). */
  newCardId?: string | null;
  /** player ids in the order they won, for the "1등 / 2등" list by the
   *  discard pile — the engine only tracks whether someone won, not when. */
  winnerOrder?: string[];
  /** "초보자 전용 게임하기" — just a header label + a hint that the view
   *  itself already has every hand revealed (view.players[].cards is
   *  non-null for opponents too, via toPlayerView's revealAll option). */
  beginnerMode?: boolean;
  /** true while localMode.ts is holding on an explanation waiting for
   *  "다음 ▶" — disables the hand so a click can't sneak a move in before
   *  the viewer has actually advanced past what they're reading. */
  beginnerGated?: boolean;
  /** state for the ◀ 뒤로 / 다음 ▶ buttons (beginner mode only). */
  beginnerNav?: { canBack: boolean; canNext: boolean };
  onPlayCard: (playerId: string, cardId?: string) => void;
  onBack: () => void;
  onTogglePause: () => void;
  onQuit: () => void;
  onBeginnerBack?: () => void;
  onBeginnerNext?: () => void;
}

export function renderBoard(app: HTMLElement, view: PlayerFacingState, callbacks: BoardCallbacks): void {
  app.innerHTML = "";
  const container = document.createElement("div");
  container.className = "board" + (callbacks.paused ? " paused" : "");

  const currentPlayer = view.players[view.currentPlayerIndex];
  const currentPlayerId = currentPlayer?.id;
  const isFinished = view.gameStatus === "FINISHED";

  const header = document.createElement("div");
  header.className = "header";
  header.innerHTML = `
    <div class="header-top">
      <h1>Fuji Flush${callbacks.beginnerMode ? " · 초보자 모드" : ""}</h1>
      <div class="game-controls">
        <button class="ctrl-btn" id="ctrl-back" title="뒤로가기" aria-label="뒤로가기">←</button>
        <button class="ctrl-btn" id="ctrl-pause" title="${callbacks.paused ? "계속하기" : "일시정지"}" aria-label="일시정지">${
          callbacks.paused ? "▶" : "⏸"
        }</button>
        <button class="ctrl-btn ctrl-quit" id="ctrl-quit" title="나가기" aria-label="나가기">✕</button>
      </div>
    </div>
  `;
  container.appendChild(header);

  // Balances the spacer below the hand (see the bottom of this function) —
  // together they pull the opponents row down and the hand up, so both
  // converge toward the center-table group instead of sticking to the top
  // and bottom edges of the screen.
  container.appendChild(Object.assign(document.createElement("div"), { className: "board-spacer" }));

  // Other players sit in a compact strip up top — name, turn/win status,
  // remaining card count, and (rule 7-15) whatever card(s) they currently
  // have down on the table, shown attached to their own seat rather than in
  // one shared pile, so it's visually clear whose card is whose.
  const opponents = view.players.filter((p) => p.id !== view.viewerId);
  if (opponents.length > 0) {
    const opponentsEl = document.createElement("div");
    opponentsEl.className = "opponents";
    for (const p of opponents) {
      const isCurrent = p.id === currentPlayerId && !isFinished;
      const badges = [winnerBadge(p.id, p.isWinner, callbacks.winnerOrder)].join("");

      const chip = document.createElement("div");
      chip.className = "opponent" + (isCurrent ? " current" : "") + (p.isWinner ? " winner" : "");
      chip.dataset.playerId = p.id;
      chip.innerHTML = `
        <div class="opponent-name"><span>${p.name}</span>${badges}</div>
        <div class="opponent-count">${p.handSize}장</div>
        ${p.cards ? renderOpponentHand(p.cards) : renderMiniBackFan(p.handSize)}
        ${renderSeatCards(view, p.id)}
        ${p.handSize === 1 ? `<span class="last-card-flag">1장 남음!</span>` : ""}
        ${isCurrent ? `<span class="turn-tag">turn!</span>` : ""}
      `;
      opponentsEl.appendChild(chip);
    }
    container.appendChild(opponentsEl);
  }

  // Flexible spacers (not fixed gaps) around the center-table/message group —
  // on a tall mobile screen, .board fills the viewport (see CSS) and these
  // grow to absorb the leftover space, so the draw/discard piles land
  // centered in the middle instead of clinging to the opponents row, and the
  // viewer's own hand gets pushed toward the bottom instead of sitting right
  // underneath. On a short/desktop screen where there's no slack to absorb,
  // they just collapse to ~0 and change nothing.
  container.appendChild(Object.assign(document.createElement("div"), { className: "board-spacer" }));

  // Draw pile / discard pile sit on the table itself, between everyone's
  // seats and the viewer's own hand — a fixed landmark the draw animation
  // flies cards out of (see #draw-pile in drawAnimation.ts). Whose turn it
  // is sits to the left of the piles (one fixed spot, always visible,
  // instead of a badge on whichever opponent chip may be scrolled off
  // screen); the win-order list sits to the right of the discard pile.
  const centerTable = document.createElement("div");
  centerTable.className = "center-table";
  centerTable.innerHTML = `
    ${
      !isFinished
        ? `
      <div class="turn-indicator">
        <span class="turn-indicator-label">현재 턴</span>
        <span class="turn-indicator-name">${currentPlayer?.id === view.viewerId ? "나" : currentPlayer?.name}</span>
      </div>`
        : ""
    }
    <div class="pile draw-pile" id="draw-pile">
      <div class="pile-cards">
        <span class="pile-card-back"></span>
        <span class="pile-card-back"></span>
      </div>
      <span class="pile-count">${view.drawPileCount}</span>
    </div>
    <div class="pile discard-pile" id="discard-pile">
      ${
        view.topDiscard
          ? `<div class="pile-top-card"><span>${view.topDiscard.value}</span></div>`
          : `<div class="pile-empty">-</div>`
      }
      <span class="pile-count">${view.discardPileCount}</span>
    </div>
    ${!isFinished ? renderWinnerList(view, callbacks.winnerOrder) : ""}
  `;
  container.appendChild(centerTable);

  // The running commentary sits centered right above the viewer's own
  // table/hand — below the piles, not up in the header — since it's
  // describing what just happened, and that's the thing they're about to
  // act on next.
  if (callbacks.message || isFinished || callbacks.paused) {
    const commentary = document.createElement("div");
    commentary.className = "table-message";
    commentary.innerHTML = `
      ${callbacks.message ? `<div class="message">${formatMessage(callbacks.message)}</div>` : ""}
      ${
        callbacks.beginnerMode && callbacks.beginnerNav
          ? `
        <div class="beginner-nav">
          <button type="button" id="beginner-back" ${callbacks.beginnerNav.canBack ? "" : "disabled"}>◀ 뒤로</button>
          <button type="button" id="beginner-next" ${callbacks.beginnerNav.canNext ? "" : "disabled"}>다음 ▶</button>
        </div>`
          : ""
      }
      ${isFinished ? `<div class="message win">게임 종료!</div>` : ""}
      ${isFinished ? renderFinalRanking(view, callbacks.winnerOrder) : ""}
      ${callbacks.paused ? `<div class="message pause">일시정지됨 — ▶ 버튼을 눌러 계속하세요</div>` : ""}
    `;
    container.appendChild(commentary);
    commentary.querySelector("#beginner-back")?.addEventListener("click", () => callbacks.onBeginnerBack?.());
    commentary.querySelector("#beginner-next")?.addEventListener("click", () => callbacks.onBeginnerNext?.());
  }

  container.appendChild(Object.assign(document.createElement("div"), { className: "board-spacer" }));

  // The viewer's own hand: the one thing that actually gets laid out nicely.
  const viewer = view.players.find((p) => p.id === view.viewerId);
  if (viewer) {
    const isCurrent = viewer.id === currentPlayerId && !isFinished;
    const canPlay = isCurrent && !viewer.isWinner && !callbacks.paused && !callbacks.beginnerGated;
    const handSort = getHandSort();
    const sortedCards = sortByValue(viewer.cards ?? [], handSort);

    const handHtml =
      sortedCards
        .map(
          (card) =>
            `<button class="hand-card${card.id === callbacks.newCardId ? " is-new" : ""}" data-card-id="${card.id}" data-player-id="${viewer.id}" ${
              canPlay ? "" : "disabled"
            }>${card.value}</button>`,
        )
        .join("") || `<span class="empty-hand">손패 없음</span>`;

    const badges = [winnerBadge(viewer.id, viewer.isWinner, callbacks.winnerOrder)].join("");

    const myHandEl = document.createElement("div");
    myHandEl.className =
      "my-hand" + (isCurrent ? " current" : "") + (viewer.isWinner ? " winner" : "");
    myHandEl.innerHTML = `
      ${isCurrent ? `<span class="turn-flag">현재 턴</span>` : ""}
      <div class="my-hand-header">
        <button class="shout-alliance-btn" id="shout-alliance-btn" type="button" title="연합!! 외치기">🤝 연합!</button>
        ${badges}
        <div class="toggle-group sort-toggle" role="group" aria-label="손패 정렬">
          <button class="toggle-btn${handSort === "asc" ? " active" : ""}" data-sort-option="asc">낮은순</button>
          <button class="toggle-btn${handSort === "desc" ? " active" : ""}" data-sort-option="desc">높은순</button>
        </div>
      </div>
      ${renderSeatCards(view, viewer.id)}
      <div class="hand">${handHtml}</div>
      ${
        canPlay && viewer.handSize === 0
          ? `<button class="pass-btn" data-player-id="${viewer.id}">턴 진행</button>`
          : ""
      }
    `;
    container.appendChild(myHandEl);
  }

  // Balances the spacer above the opponents row — pulls the hand up off the
  // bottom edge to meet it, both converging on the center-table group.
  container.appendChild(Object.assign(document.createElement("div"), { className: "board-spacer" }));

  app.appendChild(container);

  container.querySelectorAll<HTMLButtonElement>(".hand-card").forEach((btn) => {
    btn.addEventListener("click", () => {
      callbacks.onPlayCard(btn.dataset.playerId!, btn.dataset.cardId);
    });
  });
  container.querySelectorAll<HTMLButtonElement>(".pass-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      callbacks.onPlayCard(btn.dataset.playerId!, undefined);
    });
  });
  container.querySelectorAll<HTMLButtonElement>(".toggle-btn[data-sort-option]").forEach((btn) => {
    btn.addEventListener("click", () => {
      setHandSort(btn.dataset.sortOption as "asc" | "desc");
      renderBoard(app, view, callbacks);
    });
  });
  container.querySelector("#shout-alliance-btn")?.addEventListener("click", shoutAlliance);
  container.querySelector("#ctrl-back")!.addEventListener("click", callbacks.onBack);
  container.querySelector("#ctrl-pause")!.addEventListener("click", callbacks.onTogglePause);
  container.querySelector("#ctrl-quit")!.addEventListener("click", callbacks.onQuit);
}

// Purely for fun — a big "연합!!!" banner the viewer can trigger themselves
// any time, unrelated to whether an actual alliance is happening on the
// table. A fixed overlay (like the flying-card animation) so it plays over
// whatever's on screen and removes itself when done.
function shoutAlliance(): void {
  const banner = document.createElement("div");
  banner.className = "alliance-banner";
  banner.innerHTML = `<span class="alliance-banner-text">🤝 연합!!! 🤝</span>`;
  document.body.appendChild(banner);
  setTimeout(() => banner.remove(), 1400);
}

// Breaks a message onto a new line after each sentence (., !, or ? followed
// by a space) instead of leaving it as one dense wrapped paragraph — mainly
// for describeMoveForBeginner's longer, multi-sentence explanations, but
// harmless (a no-op) on the normal short one-liners. Splitting on commas
// too was considered, but victim/ally name lists ("카리나, 안유진의 카드가
// 밀려났습니다") use commas mid-clause, not as sentence boundaries, so that
// would fragment those. A trailing fragment that doesn't itself end in
// sentence punctuation (a closing "(...)", or a decorative emoji like the
// 🎴 at the end of the turn prompts) is folded back onto the line before it
// instead of standing alone.
function formatMessage(text: string): string {
  const sentences = text.split(/(?<=[.!?])\s+/).filter(Boolean);
  if (sentences.length > 1 && !/[.!?]$/.test(sentences[sentences.length - 1])) {
    const last = sentences.pop()!;
    sentences[sentences.length - 1] += ` ${last}`;
  }
  return sentences.join("<br>");
}

// A finished player's seat/hand badge — "1등"/"2등"/etc rather than a bare
// "승리", since by the time the whole game ends *everyone* has isWinner
// true (checkWinners only flips gameStatus to FINISHED once every player
// has emptied their hand — see gameEngine.ts), so labeling the very last
// person to finish "승리" read as wrong. Falls back to the old "승리" text
// only if winnerOrder isn't available (e.g. online multiplayer doesn't
// track it yet) or hasn't caught up to this player.
function winnerBadge(playerId: string, isWinner: boolean, winnerOrder: string[] | undefined): string {
  if (!isWinner) return "";
  const place = winnerOrder?.indexOf(playerId);
  const label = place !== undefined && place !== -1 ? `${place + 1}등` : "승리";
  return `<span class="badge badge-win">${label}</span>`;
}

// "1등 · 이름" down to however many have finished, next to the discard pile
// — shown only while the game is still IN_PROGRESS (see renderFinalRanking
// for the FINISHED state, where everyone has already finished).
function renderWinnerList(view: PlayerFacingState, winnerOrder: string[] | undefined): string {
  if (!winnerOrder || winnerOrder.length === 0) return "";
  const rows = winnerOrder
    .map((id, i) => {
      const name = view.players.find((p) => p.id === id)?.name ?? id;
      return `<li>${i + 1}등 · ${name}</li>`;
    })
    .join("");
  return `<ul class="winner-list">${rows}</ul>`;
}

// The engine only sets gameStatus to FINISHED once *every* player has won
// (checkWinners in gameEngine.ts), so by then winnerOrder already holds the
// full 1st-to-last placement — this is the round's final results table,
// shown prominently instead of the small in-progress winner-list above.
function renderFinalRanking(view: PlayerFacingState, winnerOrder: string[] | undefined): string {
  if (!winnerOrder || winnerOrder.length === 0) return "";
  const rows = winnerOrder
    .map((id, i) => {
      const name = view.players.find((p) => p.id === id)?.name ?? id;
      return `
        <li class="final-rank-row${i === 0 ? " first" : ""}">
          <span class="final-rank-place">${i + 1}등</span>
          <span class="final-rank-name">${name}</span>
        </li>
      `;
    })
    .join("");
  return `<ol class="final-ranking">${rows}</ol>`;
}

// Remaining hand size as that many card backs (fanned with overlap), right
// below the "N장" count, rather than making the number the only cue. Always
// renders the wrapper (even with zero backs) and reserves its height in CSS
// — otherwise a 0-hand opponent is missing this whole row and every seat's
// played card below it starts at a different Y than a 1+-hand opponent's,
// which reads as the cards themselves being different sizes even though
// they're not.
function renderMiniBackFan(count: number): string {
  return `<div class="mini-back-fan">${`<span class="mini-back"></span>`.repeat(count)}</div>`;
}

// "초보자 전용 게임하기" — an opponent's real hand (view.players[].cards is
// non-null there only when toPlayerView was called with revealAll), shown
// face-up in place of the usual mini-back-fan count.
function renderOpponentHand(cards: Card[]): string {
  const chips = cards.map((c) => `<span class="mini-hand-card">${c.value}</span>`).join("");
  return `<div class="opponent-hand">${chips}</div>`;
}

// A player's own active card(s), shown right on their seat (or above their
// hand, for the viewer) instead of in one shared table area — a joined
// (Joining Forces) card additionally carries the group's combined POWER so
// it's clear why it survived or flushed something (rules 11-19).
function renderSeatCards(view: PlayerFacingState, playerId: string): string {
  const own = view.activeCards.filter((ac) => ac.playerId === playerId);
  const groups = getActiveGroups(view.activeCards);

  // Always the same reserved height, card or not — otherwise every seat
  // (and the whole opponents row / table) resizes and re-levels itself
  // depending on who currently has a card down, which reads as the table
  // itself changing size rather than just a card appearing or leaving.
  const cardsHtml = own
    .map((ac) => {
      const group = groups.find((g) => g.value === ac.value)!;
      const joined = group.cards.length > 1;
      return `
        <div class="seat-card${joined ? " joined" : ""}">
          <span class="value">${ac.value}</span>
          ${joined ? `<span class="power-badge">${group.value}×${group.cards.length}=${group.totalValue}</span>` : ""}
        </div>
      `;
    })
    .join("");

  return `<div class="seat-cards${own.length === 0 ? " empty" : ""}">${cardsHtml}</div>`;
}
