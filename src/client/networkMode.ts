import type { PlayerFacingState } from "../engine/playerView";
import type { ClientMessage, LobbyPlayer, ServerMessage } from "../shared/protocol";
import { renderBoard } from "./render";

type Screen = "chooser" | "lobby" | "game";

export function startNetworkMode(app: HTMLElement): void {
  let socket: WebSocket | null = null;
  let viewerId = "";
  let roomCode = "";
  let hostId = "";
  let lobbyPlayers: LobbyPlayer[] = [];
  let lastView: PlayerFacingState | null = null;
  let errorMessage = "";
  let screen: Screen = "chooser";

  function send(message: ClientMessage): void {
    socket?.send(JSON.stringify(message));
  }

  function ensureSocket(onOpen: () => void): void {
    if (socket && socket.readyState === WebSocket.OPEN) {
      onOpen();
      return;
    }
    const proto = location.protocol === "https:" ? "wss" : "ws";
    const ws = new WebSocket(`${proto}://${location.host}/ws`);
    ws.addEventListener("open", onOpen, { once: true });
    ws.addEventListener("message", (event) => {
      handleServerMessage(JSON.parse(event.data as string));
    });
    ws.addEventListener("close", () => {
      errorMessage = "서버와의 연결이 끊어졌습니다.";
      render();
    });
    socket = ws;
  }

  function handleServerMessage(message: ServerMessage): void {
    switch (message.type) {
      case "roomCreated":
        roomCode = message.roomCode;
        viewerId = message.youAre;
        hostId = message.youAre;
        screen = "lobby";
        break;
      case "roomJoined":
        roomCode = message.roomCode;
        viewerId = message.youAre;
        screen = "lobby";
        break;
      case "lobbyUpdate":
        roomCode = message.roomCode;
        hostId = message.hostId;
        lobbyPlayers = message.players;
        screen = "lobby";
        break;
      case "gameStarted":
      case "stateUpdate":
        lastView = message.view;
        errorMessage = "";
        screen = "game";
        break;
      case "actionRejected":
        errorMessage = message.reason;
        break;
      case "errorMessage":
        errorMessage = message.message;
        break;
    }
    render();
  }

  function render(): void {
    if (screen === "chooser") renderChooser();
    else if (screen === "lobby") renderLobby();
    else renderGame();
  }

  function renderChooser(): void {
    app.innerHTML = "";
    const container = document.createElement("div");
    container.className = "setup";
    const prefilledCode = new URLSearchParams(location.search).get("room") ?? "";
    container.innerHTML = `
      <h1>Fuji Flush · 온라인 멀티플레이</h1>
      ${errorMessage ? `<div class="message">${errorMessage}</div>` : ""}
      <label for="player-name">닉네임</label>
      <input type="text" id="player-name" value="플레이어" />
      <button id="create-btn">방 만들기</button>
      <label for="room-code">참가 코드</label>
      <input type="text" id="room-code" placeholder="코드 입력" value="${prefilledCode}" />
      <button id="join-btn">코드로 참가하기</button>
      <button id="back-btn">뒤로</button>
    `;
    app.appendChild(container);

    const nameInput = container.querySelector<HTMLInputElement>("#player-name")!;
    container.querySelector("#create-btn")!.addEventListener("click", () => {
      const name = nameInput.value.trim() || "플레이어";
      ensureSocket(() => send({ type: "createRoom", playerName: name }));
    });
    container.querySelector("#join-btn")!.addEventListener("click", () => {
      const name = nameInput.value.trim() || "플레이어";
      const code = container.querySelector<HTMLInputElement>("#room-code")!.value.trim();
      if (!code) {
        errorMessage = "참가 코드를 입력해주세요.";
        render();
        return;
      }
      ensureSocket(() => send({ type: "joinRoom", roomCode: code, playerName: name }));
    });
    container.querySelector("#back-btn")!.addEventListener("click", () => location.reload());
  }

  function renderLobby(): void {
    app.innerHTML = "";
    const container = document.createElement("div");
    container.className = "setup";
    const isHost = viewerId === hostId;
    const canStart = isHost && lobbyPlayers.length >= 3;
    container.innerHTML = `
      <h1>대기실</h1>
      <div class="room-code">코드: ${roomCode}</div>
      <p>이 코드를 친구에게 공유하세요 (3~8명 필요)</p>
      ${errorMessage ? `<div class="message">${errorMessage}</div>` : ""}
      <ul class="lobby-players">
        ${lobbyPlayers
          .map(
            (p) =>
              `<li>${p.name}${p.id === hostId ? " (방장)" : ""}${
                p.id === viewerId ? " (나)" : ""
              }</li>`,
          )
          .join("")}
      </ul>
      ${
        isHost
          ? `<button id="start-btn" ${canStart ? "" : "disabled"}>게임 시작${
              canStart ? "" : " (최소 3명 필요)"
            }</button>`
          : `<p>방장이 게임을 시작하기를 기다리는 중...</p>`
      }
    `;
    app.appendChild(container);
    container
      .querySelector("#start-btn")
      ?.addEventListener("click", () => send({ type: "startGame" }));
  }

  function renderGame(): void {
    if (!lastView) return;
    renderBoard(app, lastView, {
      message: errorMessage,
      onPlayCard: (_playerId, cardId) => {
        send({ type: "playCard", cardId });
        // Simple wait-for-server guard: disable further input until the next
        // stateUpdate/actionRejected re-renders. No optimistic UI on purpose.
        app
          .querySelectorAll<HTMLButtonElement>(".hand-card, .pass-btn")
          .forEach((btn) => (btn.disabled = true));
      },
    });
  }

  render();
}
