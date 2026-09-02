import type { PlayerFacingState } from "../engine/playerView";
import { showAlert, showConfirm } from "./confirmDialog";
import { computeDiscardEvents, computeDrawEventsForView, flyCard } from "./drawAnimation";
import { getAllianceText, getNickname } from "./loginGate";
import type { ClientMessage, LobbyPlayer, ServerMessage } from "../shared/protocol";
import { renderBoard, showAllianceBanner } from "./render";
import { refreshIconSvg } from "./icons";
import { getSpeed } from "./speed";
import { bindSpeedScale, renderSpeedScale } from "./speedScale";
import type { Speed } from "../shared/speed";
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
  // Who's finished so far, in the order they did — the engine only tracks
  // *whether* someone has won (view.players[].isWinner), not in what order,
  // so this is built up here as it happens (recordNewWinners), same as
  // localMode.ts's identical winnerOrder. Drives the "1등"/"2등" badges
  // (render.ts's winnerBadge) — without it every winner just reads a
  // generic "승리" instead of their actual placement.
  let winnerOrder: string[] = [];
  // Set once a drawn card lands (see resolveNetworkMove) and cleared the
  // moment the viewer plays their own next card — mirrors localMode.ts's
  // identical newCardId, driving render.ts's ".is-new" marker the same way
  // in both modes.
  let newCardId: string | null = null;
  // Every incoming gameStarted/stateUpdate is animated by diffing it
  // against whatever came before (see resolveNetworkMove) — chaining them
  // through this promise instead of handling each independently keeps them
  // strictly in arrival order and never overlapping, even if the server
  // broadcasts faster (e.g. a fast AI pace) than one animation takes to
  // play out.
  let animationChain: Promise<void> = Promise.resolve();
  let errorMessage = "";
  let screen: Screen = "chooser";
  let connectingMessage = "";
  let paused = false;
  let openRooms: OpenRoom[] = [];
  // Only the host's choice actually matters (see startGame's `speed` param
  // — it paces AI seats, and only the host can start) — defaults to
  // whatever 혼자하기 last used, purely as a familiar starting point, not a
  // shared preference between the two modes.
  let lobbySpeed: Speed = getSpeed();
  // Set right before every deliberate socket.close() (resetToChooser,
  // confirmQuit) — the WS "close" listener uses this to tell "I chose to
  // leave" apart from an actual dropped connection, which is the only case
  // that should trigger an auto-reconnect attempt.
  let deliberateClose = false;
  let reconnecting = false;
  let reconnectIntervalId: ReturnType<typeof setInterval> | null = null;
  // True only for the one-shot, invisible "do I still have a room from
  // before?" check on first opening 같이하기 (see the bottom of this
  // function) — as opposed to `reconnecting`, which is the loud retry loop
  // for a connection that was actively dropped mid-session. A stale
  // sessionStorage record (the tab was closed without going through ← / ✕,
  // or the room ended on its own after everyone else left) is expected and
  // not an error worth surfacing — the person opening 같이하기 fresh never
  // asked to rejoin anything, so failing here should be silent.
  let pendingSilentResume = false;
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
    newCardId = null;
    animationChain = Promise.resolve();
    winnerOrder = [];
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
    newCardId = null;
    animationChain = Promise.resolve();
    winnerOrder = [];
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
      if (pendingSilentResume) {
        pendingSilentResume = false;
        clearRoomSession();
        return;
      }
      // Only a live game (or its waiting room) is worth automatically
      // reconnecting into — the chooser/room-browser has nothing to resume.
      if (screen === "game" || screen === "lobby" || screen === "connecting") {
        startReconnectLoop();
      }
    });
    socket = ws;
  }

  function getSeatEl(playerId: string): HTMLElement | null {
    return playerId === viewerId
      ? app.querySelector<HTMLElement>(".my-hand")
      : app.querySelector<HTMLElement>(`.opponent[data-player-id="${playerId}"]`);
  }

  // Mirrors localMode.ts's identical function — appends anyone who just
  // transitioned from not-a-winner to a-winner, in the order it's noticed.
  function recordNewWinners(before: PlayerFacingState, after: PlayerFacingState): void {
    for (const p of after.players) {
      if (!p.isWinner || winnerOrder.includes(p.id)) continue;
      const wasWinner = before.players.find((b) => b.id === p.id)?.isWinner;
      if (!wasWinner) winnerOrder.push(p.id);
    }
  }

  // Mirrors localMode.ts's resolveMove, adapted for a redacted
  // PlayerFacingState (only the viewer's own hand has real card identities
  // — see computeDrawEventsForView) instead of a full GameState. Diffs
  // `lastView` against the freshly arrived `after`, stages an intermediate
  // view that holds discarded cards on the table and withholds newly drawn
  // ones until their fly animation lands, then settles on the real state.
  async function resolveNetworkMove(after: PlayerFacingState): Promise<void> {
    const before = lastView;
    if (before) recordNewWinners(before, after);
    if (!before) {
      // Nothing to diff against (the very first view a fresh game/reconnect
      // sends) — just show it, same as localMode.ts never animates the
      // initial deal either.
      lastView = after;
      screen = "game";
      render();
      return;
    }

    const discardEvents = computeDiscardEvents(before, after);
    const drawEvents = computeDrawEventsForView(before, after, viewerId);

    if (discardEvents.length === 0 && drawEvents.length === 0) {
      lastView = after;
      screen = "game";
      render();
      return;
    }

    const discardedCardIds = new Set(discardEvents.map((e) => e.cardId));
    const drawCountByPlayer = new Map<string, number>();
    for (const e of drawEvents) drawCountByPlayer.set(e.playerId, (drawCountByPlayer.get(e.playerId) ?? 0) + 1);
    const drawnViewerCardIds = new Set(
      drawEvents.filter((e) => e.playerId === viewerId).map((e) => e.cardId),
    );
    const stillOnTable = before.activeCards.filter((ac) => discardedCardIds.has(ac.cardId));

    lastView = {
      ...after,
      activeCards: [...after.activeCards, ...stillOnTable],
      players: after.players.map((p) => {
        const pendingDraws = drawCountByPlayer.get(p.id) ?? 0;
        if (pendingDraws === 0) return p;
        return {
          ...p,
          handSize: Math.max(0, p.handSize - pendingDraws),
          cards: p.cards ? p.cards.filter((c) => !drawnViewerCardIds.has(c.id)) : p.cards,
        };
      }),
    };
    screen = "game";
    render();

    const drawPileEl = app.querySelector<HTMLElement>("#draw-pile");
    const discardPileEl = app.querySelector<HTMLElement>("#discard-pile");
    const flights: Promise<void>[] = [];
    if (discardPileEl) {
      for (const e of discardEvents) {
        const fromEl = getSeatEl(e.playerId);
        if (fromEl) flights.push(flyCard(e.value, fromEl, discardPileEl));
      }
    }
    if (drawPileEl) {
      for (const e of drawEvents) {
        const toEl = getSeatEl(e.playerId);
        if (toEl) flights.push(flyCard(e.value, drawPileEl, toEl));
      }
    }
    await Promise.all(flights);

    // Land the real state once every animation finishes, even if the
    // player navigated mid-flight — screen may no longer be "game" (e.g.
    // they backed out), in which case there's nothing left to show this on.
    const viewerDraw = drawEvents.find((e) => e.playerId === viewerId);
    if (viewerDraw) newCardId = viewerDraw.cardId;
    lastView = after;
    if (screen === "game") {
      render();
      if (viewerDraw) {
        app.querySelector<HTMLElement>(`.hand-card[data-card-id="${viewerDraw.cardId}"]`)?.classList.add("just-drawn");
      }
    }
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
        pendingSilentResume = false;
        roomCode = message.roomCode;
        roomName = message.roomName;
        viewerId = message.youAre;
        hostId = message.hostId;
        lobbyPlayers = message.players;
        errorMessage = "";
        // IN_PROGRESS is immediately followed by a stateUpdate (rooms.ts's
        // reconnect handler sends both), which resolveNetworkMove would
        // otherwise animate as one giant diff against however things stood
        // before the drop — clearing it here makes that update land as a
        // plain snap instead, same as any other fresh view.
        lastView = null;
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
      case "stateUpdate": {
        errorMessage = "";
        // No seat left worth reconnecting into once it's actually over —
        // clears this proactively instead of only on an explicit ← / ✕,
        // so a tab closed straight from the results screen doesn't leave a
        // stale session behind for next time.
        if (message.view.gameStatus === "FINISHED") clearRoomSession();
        const view = message.view;
        animationChain = animationChain.then(() => resolveNetworkMove(view));
        return; // resolveNetworkMove renders on its own once it's done
      }
      case "actionRejected":
        errorMessage = message.reason;
        break;
      case "errorMessage":
        if (pendingSilentResume) {
          // The stale session didn't pan out — quietly forget it. The
          // person is already looking at (or about to see) the normal
          // chooser, which never mentioned trying this in the first place.
          pendingSilentResume = false;
          clearRoomSession();
          return;
        }
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
          newCardId = null;
          animationChain = Promise.resolve();
    winnerOrder = [];
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
      ${isHost ? `<button type="button" id="add-bot-btn" ${canAddBot ? "" : "disabled"}>+ 🤖 AI 추가</button>` : ""}
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
          ? `
            <label>게임 진행 속도 (AI가 있을 때만 적용돼요)</label>
            ${renderSpeedScale(lobbySpeed)}
            <button id="start-btn" ${canStart ? "" : "disabled"}>게임 시작${
              canStart ? "" : " (최소 3명 필요)"
            }</button>`
          : `<p>방장이 게임을 시작하기를 기다리는 중...</p>`
      }
      <button id="lobby-back-btn" class="back-btn-compact">← 뒤로</button>
    `;
    app.appendChild(container);
    if (isHost) {
      bindSpeedScale(container, (s) => {
        lobbySpeed = s;
        renderLobby();
      });
    }
    container
      .querySelector("#start-btn")
      ?.addEventListener("click", () => send({ type: "startGame", speed: lobbySpeed }));
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
      newCardId,
      winnerOrder,
      onPlayCard: (_playerId, cardId) => {
        newCardId = null;
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

  render();
  refreshOpenRooms();
  // A leftover room-session record from before (see saveRoomSession) might
  // still be resumable (a real drop mid-game, tab reloaded) or might just
  // be stale (the room ended on its own after this tab closed without
  // going through ← / ✕, which is the only place that clears it) — there's
  // no way to tell which without asking the server, so ask quietly instead
  // of blocking the chooser on it or surfacing a failure the person never
  // triggered themselves.
  const savedSession = loadRoomSession();
  if (savedSession) {
    pendingSilentResume = true;
    ensureSocket(() => send({ type: "reconnect", roomCode: savedSession.roomCode, token: savedSession.token }));
  }
}
