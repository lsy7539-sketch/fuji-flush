import { getActiveGroups } from "../engine/gameEngine";
import type { PlayerFacingState } from "../engine/playerView";

export interface BoardCallbacks {
  message: string;
  paused: boolean;
  onPlayCard: (playerId: string, cardId?: string) => void;
  onBack: () => void;
  onTogglePause: () => void;
  onQuit: () => void;
}

export function renderBoard(app: HTMLElement, view: PlayerFacingState, callbacks: BoardCallbacks): void {
  app.innerHTML = "";
  const container = document.createElement("div");
  container.className = "board" + (callbacks.paused ? " paused" : "");

  const currentPlayerId = view.players[view.currentPlayerIndex]?.id;
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
      <span class="stat">드로우 <b>${view.drawPileCount}</b></span>
      <span class="stat">버림 <b>${view.discardPileCount}</b></span>
    </div>
    ${callbacks.message ? `<div class="message">${callbacks.message}</div>` : ""}
    ${isFinished ? `<div class="message win">게임 종료!</div>` : ""}
    ${callbacks.paused ? `<div class="message pause">일시정지됨 — ▶ 버튼을 눌러 계속하세요</div>` : ""}
  `;
  container.appendChild(header);

  // Other players sit in a compact strip up top — only their name, turn/win
  // status, and remaining card count. Their hands are never laid out card by
  // card; only the viewer's own hand gets the full spread treatment below.
  const opponents = view.players.filter((p) => p.id !== view.viewerId);
  if (opponents.length > 0) {
    const opponentsEl = document.createElement("div");
    opponentsEl.className = "opponents";
    for (const p of opponents) {
      const isCurrent = p.id === currentPlayerId && !isFinished;
      const badges = [
        p.isWinner ? `<span class="badge badge-win">승리</span>` : "",
        isCurrent && !p.isWinner ? `<span class="badge badge-turn">현재 턴</span>` : "",
      ].join("");

      const chip = document.createElement("div");
      chip.className = "opponent" + (isCurrent ? " current" : "") + (p.isWinner ? " winner" : "");
      chip.innerHTML = `
        <div class="opponent-name"><span>${p.name}</span>${badges}</div>
        <div class="opponent-count"><span class="mini-back"></span>${p.handSize}장</div>
      `;
      opponentsEl.appendChild(chip);
    }
    container.appendChild(opponentsEl);
  }

  const table = document.createElement("div");
  table.className = "table";
  const groups = getActiveGroups(view.activeCards);
  if (groups.length === 0) {
    table.innerHTML = `<div class="empty-table">테이블에 카드가 없습니다</div>`;
  } else {
    for (const group of groups) {
      const groupEl = document.createElement("div");
      groupEl.className = "group" + (group.cards.length > 1 ? " joined" : "");
      const cardsHtml = group.cards
        .map((c) => {
          const owner = view.players.find((p) => p.id === c.playerId)?.name ?? c.playerId;
          return `<div class="active-card"><span class="corner">${c.value}</span><span class="value">${c.value}</span><span class="owner">${owner}</span></div>`;
        })
        .join("");
      groupEl.innerHTML = `
        <div class="group-total"><span class="group-total-value">${group.totalValue}</span></div>
        <div class="group-cards">${cardsHtml}</div>
      `;
      table.appendChild(groupEl);
    }
  }
  container.appendChild(table);

  // The viewer's own hand: the one thing that actually gets laid out nicely.
  const viewer = view.players.find((p) => p.id === view.viewerId);
  if (viewer) {
    const isCurrent = viewer.id === currentPlayerId && !isFinished;
    const canPlay = isCurrent && !viewer.isWinner && !callbacks.paused;

    const handHtml =
      (viewer.cards ?? [])
        .map(
          (card) =>
            `<button class="hand-card" data-card-id="${card.id}" data-player-id="${viewer.id}" ${
              canPlay ? "" : "disabled"
            }>${card.value}</button>`,
        )
        .join("") || `<span class="empty-hand">손패 없음</span>`;

    const badges = [
      viewer.isWinner ? `<span class="badge badge-win">승리</span>` : "",
      isCurrent && !viewer.isWinner ? `<span class="badge badge-turn">현재 턴</span>` : "",
    ].join("");

    const myHandEl = document.createElement("div");
    myHandEl.className =
      "my-hand" + (isCurrent ? " current" : "") + (viewer.isWinner ? " winner" : "");
    myHandEl.innerHTML = `
      <div class="my-hand-header"><span>내 손패</span>${badges}</div>
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
  container.querySelector("#ctrl-back")!.addEventListener("click", callbacks.onBack);
  container.querySelector("#ctrl-pause")!.addEventListener("click", callbacks.onTogglePause);
  container.querySelector("#ctrl-quit")!.addEventListener("click", callbacks.onQuit);
}
