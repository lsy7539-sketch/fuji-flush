import { getActiveGroups } from "../engine/gameEngine";
import type { PlayerFacingState } from "../engine/playerView";
import { getHandSort, setHandSort, sortByValue } from "./handSort";

export interface BoardCallbacks {
  message: string;
  paused: boolean;
  /** id of a hand card the viewer just drew, to highlight — cleared by the
   *  caller once it's no longer "new" (e.g. once they act on their turn). */
  newCardId?: string | null;
  onPlayCard: (playerId: string, cardId?: string) => void;
  onBack: () => void;
  onTogglePause: () => void;
  onQuit: () => void;
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
      <h1>Fuji Flush</h1>
      <div class="game-controls">
        <button class="ctrl-btn" id="ctrl-back" title="뒤로가기" aria-label="뒤로가기">←</button>
        <button class="ctrl-btn" id="ctrl-pause" title="${callbacks.paused ? "계속하기" : "일시정지"}" aria-label="일시정지">${
          callbacks.paused ? "▶" : "⏸"
        }</button>
        <button class="ctrl-btn ctrl-quit" id="ctrl-quit" title="나가기" aria-label="나가기">✕</button>
      </div>
    </div>
    <div class="stats">
      ${
        !isFinished
          ? `<span class="stat stat-turn">지금은 <b>${currentPlayer?.id === view.viewerId ? "나" : currentPlayer?.name}</b>의 차례</span>`
          : ""
      }
    </div>
  `;
  container.appendChild(header);

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
      const badges = [p.isWinner ? `<span class="badge badge-win">승리</span>` : ""].join("");

      const chip = document.createElement("div");
      chip.className = "opponent" + (isCurrent ? " current" : "") + (p.isWinner ? " winner" : "");
      chip.dataset.playerId = p.id;
      chip.innerHTML = `
        ${isCurrent ? `<span class="turn-flag">현재 턴</span>` : ""}
        <div class="opponent-name"><span>${p.name}</span>${badges}</div>
        <div class="opponent-count"><span class="mini-back"></span>${p.handSize}장</div>
        ${renderSeatCards(view, p.id)}
      `;
      opponentsEl.appendChild(chip);
    }
    container.appendChild(opponentsEl);
  }

  // The running commentary sits centered right above the table, not up in
  // the header — it's describing what just happened on the table, so it
  // reads better anchored to it than to the title bar.
  if (callbacks.message || isFinished || callbacks.paused) {
    const commentary = document.createElement("div");
    commentary.className = "table-message";
    commentary.innerHTML = `
      ${callbacks.message ? `<div class="message">${callbacks.message}</div>` : ""}
      ${isFinished ? `<div class="message win">게임 종료!</div>` : ""}
      ${callbacks.paused ? `<div class="message pause">일시정지됨 — ▶ 버튼을 눌러 계속하세요</div>` : ""}
    `;
    container.appendChild(commentary);
  }

  // Draw pile / discard pile sit on the table itself, between everyone's
  // seats and the viewer's own hand — a fixed landmark the draw animation
  // flies cards out of (see #draw-pile in drawAnimation.ts).
  const centerTable = document.createElement("div");
  centerTable.className = "center-table";
  centerTable.innerHTML = `
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
          ? `<div class="seat-card"><span class="value">${view.topDiscard.value}</span></div>`
          : `<div class="pile-empty">-</div>`
      }
      <span class="pile-count">${view.discardPileCount}</span>
    </div>
  `;
  container.appendChild(centerTable);

  // The viewer's own hand: the one thing that actually gets laid out nicely.
  const viewer = view.players.find((p) => p.id === view.viewerId);
  if (viewer) {
    const isCurrent = viewer.id === currentPlayerId && !isFinished;
    const canPlay = isCurrent && !viewer.isWinner && !callbacks.paused;
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

    const badges = [viewer.isWinner ? `<span class="badge badge-win">승리</span>` : ""].join("");

    const myHandEl = document.createElement("div");
    myHandEl.className =
      "my-hand" + (isCurrent ? " current" : "") + (viewer.isWinner ? " winner" : "");
    myHandEl.innerHTML = `
      ${isCurrent ? `<span class="turn-flag">현재 턴</span>` : ""}
      <div class="my-hand-header">
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
  container.querySelector("#ctrl-back")!.addEventListener("click", callbacks.onBack);
  container.querySelector("#ctrl-pause")!.addEventListener("click", callbacks.onTogglePause);
  container.querySelector("#ctrl-quit")!.addEventListener("click", callbacks.onQuit);
}

// A player's own active card(s), shown right on their seat (or above their
// hand, for the viewer) instead of in one shared table area — a joined
// (Joining Forces) card additionally carries the group's combined POWER so
// it's clear why it survived or flushed something (rules 11-19).
function renderSeatCards(view: PlayerFacingState, playerId: string): string {
  const own = view.activeCards.filter((ac) => ac.playerId === playerId);
  if (own.length === 0) return "";
  const groups = getActiveGroups(view.activeCards);

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

  return `<div class="seat-cards">${cardsHtml}</div>`;
}
