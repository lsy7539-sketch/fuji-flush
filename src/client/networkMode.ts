import type { PlayerFacingState } from "../engine/playerView";
import { showAlert, showConfirm } from "./confirmDialog";
import { getAllianceText, getNickname } from "./loginGate";
import type { ClientMessage, LobbyPlayer, ServerMessage } from "../shared/protocol";
import { renderBoard, showAllianceBanner } from "./render";
import { refreshIconSvg } from "./icons";
import { disableScreenWakeLock } from "./wakeLock";

type Screen = "chooser" | "lobby" | "game" | "connecting";

interface OpenRoom {
  code: string;
  name: string;
  playerCount: number;
  maxPlayers: number;
}

// Persisted across a dropped connection (and even a full page reload within
// the same tab, if the browser discards a backgrounded page) so a fresh
// WebSocket can prove "I'm the same player who was already in this room" —
// see rooms.ts's "reconnect" handling. sessionStorage, not localStorage,
// matching every other per-tab value this app keeps (access code, nickname,
// alliance text) — reconnecting into a room from an unrelated tab/device
// isn't a scenario this needs to support.
const ROOM_SESSION_KEY = "fuji-flush-room-session";
const RECONNECT_RETRY_MS = 3000;

interface SavedRoomSession {
  roomCode: string;
  token: string;
}

function saveRoomSession(code: string, token: string): void {
  sessionStorage.setItem(ROOM_SESSION_KEY, JSON.stringify({ roomCode: code, token }));
}

function loadRoomSession(): SavedRoomSession | null {
  try {
    const raw = sessionStorage.getItem(ROOM_SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return typeof parsed?.roomCode === "string" && typeof parsed?.token === "string" ? parsed : null;
  } catch {
    return null;
  }
}

function clearRoomSession(): void {
  sessionStorage.removeItem(ROOM_SESSION_KEY);
}

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
  let connectingMessage = "";
  let paused = false;
  let openRooms: OpenRoom[] = [];
  // Set right before every deliberate socket.close() (resetToChooser,
  // confirmQuit) — the WS "close" listener uses this to tell "I chose to
  // leave" apart from an actual dropped connection, which is the only case
  // that should trigger an auto-reconnect attempt.
  let deliberateClose = false;
  let reconnecting = false;
  let reconnectIntervalId: ReturnType<typeof setInterval> | null = null;
  // A ?room= invite link used to just prefill the code input — now that
  // there's no manual code entry, it instead auto-joins once, right away.
  // The flag stops a rejected/failed attempt from retrying forever every
  // time render() re-enters the chooser.
  let autoJoinAttempted = false;

  // Only called at points that actually enter the chooser (not from inside
  // renderChooser itself) — otherwise every re-render would refire the
  // fetch, which itself triggers a re-render, looping.
  async function refreshOpenRooms(): Promise<void> {
    try {
      const res = await fetch("/api/rooms");
      if (screen !== "chooser") return; // left the screen before this resolved
      if (res.ok) {
        const data = await res.json();
        openRooms = data.rooms;
        render();
      }
    } catch {
      // Leaves whatever list was already showing — the chooser's own
      // refresh button is the retry path, no need to surface an error for
      // what's a background convenience fetch.
    }
  }

  function stopReconnectLoop(): void {
    if (reconnectIntervalId !== null) {
      clearInterval(reconnectIntervalId);
      reconnectIntervalId = null;
    }
    reconnecting = false;
  }

  function tryReconnectOnce(): void {
    const saved = loadRoomSession();
    if (!saved) {
      stopReconnectLoop();
      return;
    }
    // An attempt is already connecting or connected — let it resolve
    // instead of piling on another WebSocket.
    if (socket && (socket.readyState === WebSocket.CONNECTING || socket.readyState === WebSocket.OPEN)) {
      return;
    }
    ensureSocket(() => send({ type: "reconnect", roomCode: saved.roomCode, token: saved.token }));
  }

  function startReconnectLoop(): void {
    if (reconnecting) return;
    reconnecting = true;
    screen = "connecting";
    connectingMessage = "연결이 끊어졌어요. 다시 연결하는 중...";
    render();
    tryReconnectOnce();
    reconnectIntervalId = setInterval(tryReconnectOnce, RECONNECT_RETRY_MS);
  }

  // Reconnect attempts definitively failed (room's gone, grace period
  // expired) — nothing left to retry, so fall back to a normal chooser.
  function giveUpReconnecting(message: string): void {
    stopReconnectLoop();
    clearRoomSession();
    roomCode = "";
    roomName = "";
    hostId = "";
    lobbyPlayers = [];
    lastView = null;
    errorMessage = message;
    screen = "chooser";
    render();
    refreshOpenRooms();
  }

  function resetToChooser(): void {
    deliberateClose = true;
    stopReconnectLoop();
    clearRoomSession();
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
    refreshOpenRooms();
  }

  // "뒤로가기": leave this room but stay in online-multiplayer flow (create/join again).
  async function confirmBack(): Promise<void> {
    if (await showConfirm("정말 방을 나가시겠어요? 다른 플레이어들과의 연결이 끊어집니다.")) {
      if (screen === "game") send({ type: "leaveGame" });
      resetToChooser();
    }
  }

  // "✕": leave all the way back to the single/multi mode-select screen.
  async function confirmQuit(): Promise<void> {
    if (await showConfirm("정말 게임을 나가시겠어요? 다른 플레이어들과의 연결이 끊어집니다.")) {
      if (screen === "game") send({ type: "leaveGame" });
      deliberateClose = true;
      stopReconnectLoop();
      clearRoomSession();
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
    deliberateClose = false;
    const proto = location.protocol === "https:" ? "wss" : "ws";
    const ws = new WebSocket(`${proto}://${location.host}/ws`);
    ws.addEventListener("open", onOpen, { once: true });
    ws.addEventListener("message", (event) => {
      handleServerMessage(JSON.parse(event.data as string));
    });
    ws.addEventListener("close", () => {
      if (deliberateClose) return;
      // Only a live game (or its waiting room) is worth automatically
      // reconnecting into — the chooser/room-browser has nothing to resume.
      if (screen === "game" || screen === "lobby" || screen === "connecting") {
        startReconnectLoop();
      }
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
        saveRoomSession(message.roomCode, message.reconnectToken);
        screen = "lobby";
        break;
      case "roomJoined":
        roomCode = message.roomCode;
        roomName = message.roomName;
        viewerId = message.youAre;
        saveRoomSession(message.roomCode, message.reconnectToken);
        screen = "lobby";
        break;
      case "reconnected":
        stopReconnectLoop();
        roomCode = message.roomCode;
        roomName = message.roomName;
        viewerId = message.youAre;
        hostId = message.hostId;
        lobbyPlayers = message.players;
        errorMessage = "";
        // IN_PROGRESS is immediately followed by a stateUpdate (rooms.ts's
        // reconnect handler sends both) which will flip this to "game" —
        // LOBBY has nothing else coming, so land there directly.
        screen = message.status === "LOBBY" ? "lobby" : "game";
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
        if (reconnecting || screen === "connecting") {
          giveUpReconnecting(message.message);
          return;
        }
        errorMessage = message.message;
        break;
      case "allianceShouted":
        // Relayed from another player's (or our own echoed-back) 🤝 연합!
        // click — see rooms.ts's shoutAlliance. Doesn't change any state
        // that render() would reflect, so skip the re-render below.
        showAllianceBanner(message.text);
        return;
      case "playerLeft":
        stopReconnectLoop();
        clearRoomSession();
        showAlert(`${message.playerName}의 접속이 종료되어 게임을 종료합니다.`).then(() => {
          roomCode = "";
          roomName = "";
          hostId = "";
          lobbyPlayers = [];
          lastView = null;
          errorMessage = "";
          screen = "chooser";
          render();
          refreshOpenRooms();
        });
        return;
    }
    render();
  }

  function render(): void {
    // chooser/lobby/connecting are short cards like every other .setup
    // screen — center them vertically the same way; the board is full
    // layout, not a card, so it gets normal top-aligned document flow.
    document.body.classList.toggle("center-screen", screen !== "game");
    if (screen === "chooser") renderChooser();
    else if (screen === "lobby") renderLobby();
    else if (screen === "connecting") renderConnecting();
    else renderGame();
  }

  function joinRoomByCode(code: string): void {
    ensureSocket(() => send({ type: "joinRoom", roomCode: code, playerName: getNickname() }));
  }

  function renderConnecting(): void {
    disableScreenWakeLock();
    app.innerHTML = "";
    const container = document.createElement("div");
    container.className = "setup";
    container.innerHTML = `<h1>Fuji Flush · 같이하기</h1><p></p>`;
    container.querySelector("p")!.textContent = connectingMessage;
    app.appendChild(container);
  }

  function renderChooser(): void {
    disableScreenWakeLock();
    const prefilledCode = new URLSearchParams(location.search).get("room") ?? "";
    if (prefilledCode && !autoJoinAttempted) {
      autoJoinAttempted = true;
      // One-shot — a later page refresh shouldn't try to rejoin the same
      // room automatically (they may have deliberately left it).
      history.replaceState(null, "", location.pathname);
      screen = "connecting";
      connectingMessage = "초대받은 방에 참가하는 중...";
      render();
      joinRoomByCode(prefilledCode);
      return;
    }

    app.innerHTML = "";
    const container = document.createElement("div");
    container.className = "setup";
    const roomListHtml =
      openRooms.length > 0
        ? openRooms
            .map(
              (r) => `
              <li>
                <span class="code-value">${r.name}</span>
                <span class="code-date">${r.playerCount}/${r.maxPlayers}명</span>
                <button class="room-join-btn" data-room-code="${r.code}">참가하기</button>
              </li>
            `,
            )
            .join("")
        : `<li class="code-empty">현재 참가할 수 있는 방이 없어요.</li>`;
    container.innerHTML = `
      <h1>Fuji Flush · 같이하기</h1>
      ${errorMessage ? `<div class="message">${errorMessage}</div>` : ""}
      <p>닉네임: <b>${getNickname()}</b></p>
      <label for="room-name">방 이름 (선택)</label>
      <input type="text" id="room-name" placeholder="예: 금요일 밤 후지플러시" />
      <button id="create-btn">방 만들기</button>
      <div class="open-rooms-header">
        <label>참가할 수 있는 방</label>
        <button type="button" id="rooms-refresh-btn" class="icon-refresh-btn" aria-label="새로고침" title="새로고침">${refreshIconSvg()}</button>
      </div>
      <ul class="code-list">${roomListHtml}</ul>
      <button id="back-btn" class="back-btn-compact">← 뒤로</button>
    `;
    app.appendChild(container);

    container.querySelector("#create-btn")!.addEventListener("click", () => {
      const customRoomName = container.querySelector<HTMLInputElement>("#room-name")!.value.trim();
      ensureSocket(() =>
        send({
          type: "createRoom",
          playerName: getNickname(),
          roomName: customRoomName || undefined,
        }),
      );
    });
    container.querySelectorAll<HTMLButtonElement>(".room-join-btn").forEach((btn) => {
      btn.addEventListener("click", () => joinRoomByCode(btn.dataset.roomCode!));
    });
    container.querySelector("#rooms-refresh-btn")!.addEventListener("click", refreshOpenRooms);
    container.querySelector("#back-btn")!.addEventListener("click", onExit);
  }

  function renderLobby(): void {
    disableScreenWakeLock();
    app.innerHTML = "";
    const container = document.createElement("div");
    container.className = "setup";
    const isHost = viewerId === hostId;
    const canStart = isHost && lobbyPlayers.length >= 3;
    const canAddBot = isHost && lobbyPlayers.length < 8;
    container.innerHTML = `
      <h1>${roomName || "대기실"}</h1>
      <p>친구는 같이하기 화면에서 이 방을 찾아 바로 참가할 수 있어요 — 초대 링크로 보내도 돼요 (3~8명 필요, AI로 채워도 돼요)</p>
      ${errorMessage ? `<div class="message">${errorMessage}</div>` : ""}
      <button id="invite-btn">초대 링크 복사</button>
      ${isHost ? `<button type="button" id="add-bot-btn" ${canAddBot ? "" : "disabled"}>🤖 AI 추가</button>` : ""}
      <ul class="lobby-players">
        ${lobbyPlayers
          .map(
            (p) => `
              <li>
                <span>${p.name}${p.isBot ? " 🤖" : ""}${p.id === hostId ? " (방장)" : ""}${
                  p.id === viewerId ? " (나)" : ""
                }</span>
                ${isHost && p.isBot ? `<button type="button" class="remove-bot-btn" data-bot-id="${p.id}">제거</button>` : ""}
              </li>
            `,
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
      <button id="lobby-back-btn" class="back-btn-compact">← 뒤로</button>
    `;
    app.appendChild(container);
    container
      .querySelector("#start-btn")
      ?.addEventListener("click", () => send({ type: "startGame" }));
    container.querySelector("#add-bot-btn")?.addEventListener("click", () => send({ type: "addBot" }));
    container.querySelectorAll<HTMLButtonElement>(".remove-bot-btn").forEach((btn) => {
      btn.addEventListener("click", () => send({ type: "removeBot", playerId: btn.dataset.botId! }));
    });
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
      // Doesn't show the banner itself — waits for the server to echo it
      // back (see handleServerMessage's "allianceShouted" case) so every
      // player in the room, sender included, sees it at the same moment.
      onShoutAlliance: () => send({ type: "shoutAlliance", text: getAllianceText() }),
      // Pausing can only dim/disable this client's own screen — the game
      // keeps running for everyone else since it's a shared session.
      onTogglePause: () => {
        paused = !paused;
        render();
      },
    });
  }

  const savedSession = loadRoomSession();
  if (savedSession) {
    screen = "connecting";
    connectingMessage = "다시 연결하는 중...";
    render();
    startReconnectLoop();
  } else {
    render();
    refreshOpenRooms();
  }
}
