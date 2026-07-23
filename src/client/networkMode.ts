import type { PlayerFacingState } from "../engine/playerView";
import { getNickname } from "./loginGate";
import type { ClientMessage, LobbyPlayer, ServerMessage } from "../shared/protocol";
import { renderBoard } from "./render";

type Screen = "chooser" | "lobby" | "game";

export function startNetworkMode(app: HTMLElement, onExit: () => void): void {
  let socket: WebSocket | null = null;
  let viewerId = "";
  let roomCode = "";
  let roomName = "";
  let hostId = "";
  let lobbyPlayers: LobbyPlayer[] = [];
  let lastView: PlayerFacingState | null = null;
  let errorMessage = "";
  let screen: Screen = "chooser";
  let paused = false;

  function resetToChooser(): void {
    socket?.close();
    socket = null;
    viewerId = "";
    roomCode = "";
    roomName = "";
    hostId = "";
    lobbyPlayers = [];
    lastView = null;
    errorMessage = "";
    paused = false;
    screen = "chooser";
    render();
  }

  // "뒤로가기": leave this room but stay in online-multiplayer flow (create/join again).
  function confirmBack(): void {
    if (confirm("정말 방을 나가시겠어요? 다른 플레이어들과의 연결이 끊어집니다.")) {
      resetToChooser();
    }
  }

  // "✕": leave all the way back to the single/multi mode-select screen.
  function confirmQuit(): void {
    if (confirm("정말 게임을 나가시겠어요? 다른 플레이어들과의 연결이 끊어집니다.")) {
      socket?.close();
      onExit();
    }
  }

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
        roomName = message.roomName;
        viewerId = message.youAre;
        hostId = message.youAre;
        screen = "lobby";
        break;
      case "roomJoined":
        roomCode = message.roomCode;
        roomName = message.roomName;
        viewerId = message.youAre;
        screen = "lobby";
        break;
      case "lobbyUpdate":
        roomCode = message.roomCode;
        roomName = message.roomName;
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
      <p>닉네임: <b>${getNickname()}</b></p>
      <label for="room-name">방 이름 (선택)</label>
      <input type="text" id="room-name" placeholder="예: 금요일 밤 후지플러시" />
      <label for="room-code-input">방 코드 (선택, 비우면 자동 생성)</label>
      <input type="text" id="room-code-input" placeholder="원하는 코드" />
      <button id="create-btn">방 만들기</button>
      <label for="room-code">참가 코드</label>
      <input type="text" id="room-code" placeholder="코드 입력" value="${prefilledCode}" />
      <button id="join-btn">코드로 참가하기</button>
      <button id="back-btn">뒤로</button>
    `;
    app.appendChild(container);

    container.querySelector("#create-btn")!.addEventListener("click", () => {
      const customRoomName = container.querySelector<HTMLInputElement>("#room-name")!.value.trim();
      const customRoomCode = container
        .querySelector<HTMLInputElement>("#room-code-input")!
        .value.trim();
      ensureSocket(() =>
        send({
          type: "createRoom",
          playerName: getNickname(),
          roomName: customRoomName || undefined,
          roomCode: customRoomCode || undefined,
        }),
      );
    });
    container.querySelector("#join-btn")!.addEventListener("click", () => {
      const code = container.querySelector<HTMLInputElement>("#room-code")!.value.trim();
      if (!code) {
        errorMessage = "참가 코드를 입력해주세요.";
        render();
        return;
      }
      ensureSocket(() => send({ type: "joinRoom", roomCode: code, playerName: getNickname() }));
    });
    container.querySelector("#back-btn")!.addEventListener("click", onExit);
  }

  function renderLobby(): void {
    app.innerHTML = "";
    const container = document.createElement("div");
    container.className = "setup";
    const isHost = viewerId === hostId;
    const canStart = isHost && lobbyPlayers.length >= 3;
    container.innerHTML = `
      <h1>${roomName || "대기실"}</h1>
      <div class="room-code">코드: ${roomCode}</div>
      <p>이 코드나 초대 링크를 친구에게 공유하세요 (3~8명 필요)</p>
      ${errorMessage ? `<div class="message">${errorMessage}</div>` : ""}
      <button id="invite-btn">초대 링크 복사</button>
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
      <button id="lobby-back-btn">뒤로</button>
    `;
    app.appendChild(container);
    container
      .querySelector("#start-btn")
      ?.addEventListener("click", () => send({ type: "startGame" }));
    container.querySelector("#invite-btn")!.addEventListener("click", async (e) => {
      const link = `${location.origin}/?room=${encodeURIComponent(roomCode)}`;
      const btn = e.currentTarget as HTMLButtonElement;
      try {
        await navigator.clipboard.writeText(link);
        const original = btn.textContent;
        btn.textContent = "복사됨!";
        setTimeout(() => {
          btn.textContent = original;
        }, 1500);
      } catch {
        errorMessage = `복사 실패, 직접 공유하세요: ${link}`;
        render();
      }
    });
    // Leaving the waiting room (before the game starts) is low-stakes — no
    // confirmation needed, unlike mid-game back/quit.
    container.querySelector("#lobby-back-btn")!.addEventListener("click", resetToChooser);
  }

  function renderGame(): void {
    if (!lastView) return;
    renderBoard(app, lastView, {
      message: errorMessage,
      paused,
      onPlayCard: (_playerId, cardId) => {
        send({ type: "playCard", cardId });
        // Simple wait-for-server guard: disable further input until the next
        // stateUpdate/actionRejected re-renders. No optimistic UI on purpose.
        app
          .querySelectorAll<HTMLButtonElement>(".hand-card, .pass-btn")
          .forEach((btn) => (btn.disabled = true));
      },
      // Leaving a live multiplayer room affects other real players, so both
      // confirm first (unlike local mode, where back is free). Back stays in
      // online-multiplayer flow; quit goes all the way to mode-select.
      onBack: confirmBack,
      onQuit: confirmQuit,
      // Pausing can only dim/disable this client's own screen — the game
      // keeps running for everyone else since it's a shared session.
      onTogglePause: () => {
        paused = !paused;
        render();
      },
    });
  }

  render();
}
