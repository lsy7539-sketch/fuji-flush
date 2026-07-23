import { getActiveGroups } from "../engine/gameEngine";
import type { PlayerFacingState } from "../engine/playerView";

export interface BoardCallbacks {
  message: string;
  onPlayCard: (playerId: string, cardId?: string) => void;
}

export function renderBoard(app: HTMLElement, view: PlayerFacingState, callbacks: BoardCallbacks): void {
  app.innerHTML = "";
  const container = document.createElement("div");
  container.className = "board";

  const header = document.createElement("div");
  header.className = "header";
  header.innerHTML = `
    <h1>Fuji Flush</h1>
    <div class="stats">
      <span class="stat">드로우 <b>${view.drawPileCount}</b></span>
      <span class="stat">버림 <b>${view.discardPileCount}</b></span>
    </div>
    ${callbacks.message ? `<div class="message">${callbacks.message}</div>` : ""}
    ${view.gameStatus === "FINISHED" ? `<div class="message win">게임 종료!</div>` : ""}
  `;
  container.appendChild(header);

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

  const currentPlayerId = view.players[view.currentPlayerIndex]?.id;

  const playersEl = document.createElement("div");
  playersEl.className = "players";
  view.players.forEach((p) => {
    const isCurrent = p.id === currentPlayerId && view.gameStatus !== "FINISHED";
    const isViewer = p.id === view.viewerId;
    const canPlay = isCurrent && isViewer && !p.isWinner;

    const playerEl = document.createElement("div");
    playerEl.className =
      "player" + (isCurrent ? " current" : "") + (p.isWinner ? " winner" : "");

    let handHtml: string;
    if (p.cards) {
      handHtml =
        p.cards
          .map(
            (card) =>
              `<button class="hand-card" data-card-id="${card.id}" data-player-id="${p.id}" ${
                canPlay ? "" : "disabled"
              }>${card.value}</button>`,
          )
          .join("") || `<span class="empty-hand">손패 없음</span>`;
    } else {
      handHtml =
        Array.from({ length: p.handSize }, () => `<div class="card-back"></div>`).join("") ||
        `<span class="empty-hand">손패 없음</span>`;
    }

    const badges = [
      p.isWinner ? `<span class="badge badge-win">승리</span>` : "",
      isCurrent && !p.isWinner ? `<span class="badge badge-turn">현재 턴</span>` : "",
      isViewer ? `<span class="badge badge-you">나</span>` : "",
    ].join("");

    playerEl.innerHTML = `
      <div class="player-name"><span>${p.name}</span>${badges}</div>
      <div class="hand">${handHtml}</div>
      ${
        canPlay && p.handSize === 0
          ? `<button class="pass-btn" data-player-id="${p.id}">턴 진행</button>`
          : ""
      }
    `;
    playersEl.appendChild(playerEl);
  });
  container.appendChild(playersEl);

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
}
