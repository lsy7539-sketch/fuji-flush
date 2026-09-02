import { randomUUID } from "node:crypto";
import type { WebSocket } from "ws";
import { chooseBotMove } from "../ai/botPlayer";
import { GameError, createGame, playCard, resolveTurnStart } from "../engine/gameEngine";
import { toPlayerView } from "../engine/playerView";
import type { GameState } from "../engine/types";
import { BOT_NAME_POOL } from "../shared/botNames";
import type { ClientMessage, RoomStatus, ServerMessage } from "../shared/protocol";
import type { Speed } from "../shared/speed";
import { pool } from "./db";
import { generateRoomCode } from "./roomCode";

const MIN_PLAYERS = 3;
const MAX_PLAYERS = 8;

// How long a dropped connection gets to reconnect (same seat, same hand)
// before the game is ended for everyone else — long enough to cover a
// phone screen locking and coming back, short enough that the rest of the
// room isn't left stuck on a dead player's turn indefinitely.
const RECONNECT_GRACE_MS = 60_000;

// A brief "thinking" pause before a server-run AI seat plays — instant
// would feel like a glitch to the real people watching. The host picks
// one of these when starting the game (see startGame's `speed` param);
// there's no per-viewer setting the way 혼자하기 has, since a room can
// have several real players — one shared pace for the whole room instead.
// Mirrors client/speed.ts's own `think` values for the same 5 levels.
const BOT_THINK_MS_BY_SPEED: Record<Speed, number> = {
  veryslow: 3600,
  slow: 2600,
  normal: 1500,
  fast: 700,
  veryfast: 350,
};
const DEFAULT_BOT_THINK_MS = BOT_THINK_MS_BY_SPEED.normal;

interface RoomPlayer {
  id: string;
  name: string;
  socket: WebSocket | null;
  connected: boolean;
  // Server-run seat (see "addBot") — never has a real socket, never drops,
  // never needs a reconnect token.
  isBot: boolean;
  // Proves "I'm the same player who was in this seat" across a fresh
  // WebSocket after a drop — see the "reconnect" client message.
  reconnectToken: string;
  disconnectTimer: ReturnType<typeof setTimeout> | null;
}

interface Room {
  code: string;
  name: string;
  hostPlayerId: string;
  players: RoomPlayer[];
  state: GameState | null;
  status: RoomStatus;
  startedAt: number | null;
  // Set once, from startGame's `speed` param — see BOT_THINK_MS_BY_SPEED.
  botThinkMs: number;
}

// Single in-memory registry — rooms disappear on server restart. Acceptable for a
// hobby project on a free host; documented as a known limitation, not a bug.
const rooms = new Map<string, Room>();
let nextPlayerNumber = 1;

export interface RoomSummary {
  code: string;
  name: string;
  status: Room["status"];
  hostName: string;
  players: string[];
}

// For the admin panel's "현재 접속중" view (server.ts's GET /api/admin/online).
// Only ever reflects players in an actual 같이하기 room — this is the one
// thing the server can honestly know about who's "connected" at all, since
// login is a stateless code check with no server-side session, and a
// WebSocket only opens once someone actually creates/joins a room (not just
// while they're sitting on 혼자하기 or a menu screen).
export function listConnectedRooms(): RoomSummary[] {
  return [...rooms.values()].map((room) => ({
    code: room.code,
    name: room.name,
    status: room.status,
    hostName: room.players.find((p) => p.id === room.hostPlayerId)?.name ?? "",
    players: room.players.map((p) => p.name),
  }));
}

export interface OpenRoom {
  code: string;
  name: string;
  playerCount: number;
  maxPlayers: number;
}

// For the 같이하기 chooser's room-browser (server.ts's GET /api/rooms) — a
// public, unauthenticated listing (just like a room code itself, this isn't
// sensitive: anyone already past login can see it, same trust boundary the
// rest of this simple app uses). Only rooms someone could actually join
// right now: still in LOBBY (not started, not finished) and not full —
// joinRoom below would reject either case anyway.
export function listOpenRooms(): OpenRoom[] {
  return [...rooms.values()]
    .filter((room) => room.status === "LOBBY" && room.players.length < MAX_PLAYERS)
    .map((room) => ({
      code: room.code,
      name: room.name,
      playerCount: room.players.length,
      maxPlayers: MAX_PLAYERS,
    }));
}

function send(socket: WebSocket | null, message: ServerMessage): void {
  if (socket && socket.readyState === socket.OPEN) {
    socket.send(JSON.stringify(message));
  }
}

function toLobbyPlayers(room: Room) {
  return room.players.map((p) => ({ id: p.id, name: p.name, isBot: p.isBot }));
}

function broadcastLobby(room: Room): void {
  const message: ServerMessage = {
    type: "lobbyUpdate",
    roomCode: room.code,
    roomName: room.name,
    hostId: room.hostPlayerId,
    players: toLobbyPlayers(room),
  };
  for (const p of room.players) send(p.socket, message);
}

// Every player gets their OWN redacted view — never one shared state blob.
// This is the actual hand-secrecy boundary, not just a UI nicety.
function broadcastState(room: Room, kind: "gameStarted" | "stateUpdate"): void {
  if (!room.state) return;
  for (const p of room.players) {
    send(p.socket, { type: kind, view: toPlayerView(room.state, p.id) });
  }
}

function findRoomBySocket(socket: WebSocket): { room: Room; player: RoomPlayer } | undefined {
  for (const room of rooms.values()) {
    const player = room.players.find((p) => p.socket === socket);
    if (player) return { room, player };
  }
  return undefined;
}

function findRoomAndPlayerByToken(
  roomCode: string,
  token: string,
): { room: Room; player: RoomPlayer } | undefined {
  const room = rooms.get(roomCode.toUpperCase());
  if (!room) return undefined;
  const player = room.players.find((p) => p.reconnectToken === token);
  return player ? { room, player } : undefined;
}

function makePlayerId(): string {
  return `player-${nextPlayerNumber++}`;
}

// The seat is unrecoverable — either the grace period ran out on a dropped
// connection, or the player left on purpose (see "leaveGame"). The game
// can't continue without that seat, so it ends here instead of leaving
// everyone else stuck waiting on a turn that will never come.
function endGameDueToDeparture(room: Room, leavingPlayer: RoomPlayer): void {
  if (!rooms.has(room.code)) return; // already torn down (e.g. timer + explicit leave raced)
  for (const p of room.players) {
    if (p.disconnectTimer) clearTimeout(p.disconnectTimer);
    if (p.id !== leavingPlayer.id) {
      send(p.socket, { type: "playerLeft", playerName: leavingPlayer.name });
    }
  }
  room.status = "FINISHED";
  rooms.delete(room.code);
}

export function handleConnection(socket: WebSocket): void {
  socket.on("message", (raw: { toString(): string }) => {
    let message: ClientMessage;
    try {
      message = JSON.parse(raw.toString());
    } catch {
      send(socket, { type: "errorMessage", message: "잘못된 메시지 형식입니다." });
      return;
    }
    try {
      handleMessage(socket, message);
    } catch (err) {
      send(socket, {
        type: "errorMessage",
        message: err instanceof Error ? err.message : String(err),
      });
    }
  });

  socket.on("close", () => {
    const found = findRoomBySocket(socket);
    if (!found) return;
    const { room, player } = found;

    if (room.status === "IN_PROGRESS") {
      // Give them a window to reconnect into the same seat instead of
      // immediately ending the game — see RECONNECT_GRACE_MS.
      player.connected = false;
      player.socket = null;
      player.disconnectTimer = setTimeout(() => {
        endGameDueToDeparture(room, player);
      }, RECONNECT_GRACE_MS);
      return;
    }

    // LOBBY (or a game that already legitimately FINISHED) — no seat worth
    // preserving, same immediate-removal behavior as before reconnect existed.
    room.players = room.players.filter((p) => p.id !== player.id);
    if (room.players.length === 0) {
      rooms.delete(room.code);
      return;
    }
    if (room.hostPlayerId === player.id) {
      room.hostPlayerId = room.players[0].id;
    }
    if (room.status === "LOBBY") {
      broadcastLobby(room);
    }
  });
}

function handleMessage(socket: WebSocket, message: ClientMessage): void {
  switch (message.type) {
    case "createRoom":
      return createRoom(socket, message.playerName, message.roomName);
    case "joinRoom":
      return joinRoom(socket, message.roomCode, message.playerName);
    case "reconnect":
      return reconnect(socket, message.roomCode, message.token);
    case "leaveGame":
      return leaveGame(socket);
    case "addBot":
      return addBot(socket);
    case "removeBot":
      return removeBot(socket, message.playerId);
    case "startGame":
      return startGame(socket, message.speed);
    case "playCard":
      return handlePlayCard(socket, message.cardId);
    case "shoutAlliance":
      return shoutAlliance(socket, message.text);
  }
}

function createRoom(socket: WebSocket, playerName: string, roomName: string | undefined): void {
  const code = generateRoomCode((c) => rooms.has(c));
  const playerId = makePlayerId();
  const reconnectToken = randomUUID();
  const room: Room = {
    code,
    name: roomName?.trim() || `${playerName || "Player"}의 방`,
    hostPlayerId: playerId,
    players: [
      {
        id: playerId,
        name: playerName || "Player",
        socket,
        connected: true,
        isBot: false,
        reconnectToken,
        disconnectTimer: null,
      },
    ],
    state: null,
    status: "LOBBY",
    startedAt: null,
    botThinkMs: DEFAULT_BOT_THINK_MS,
  };
  rooms.set(code, room);
  send(socket, { type: "roomCreated", roomCode: code, roomName: room.name, youAre: playerId, reconnectToken });
  broadcastLobby(room);
}

function joinRoom(socket: WebSocket, roomCode: string, playerName: string): void {
  const room = rooms.get(roomCode.toUpperCase());
  if (!room) throw new Error("존재하지 않는 방 코드입니다.");
  if (room.status !== "LOBBY") throw new Error("이미 시작된 게임입니다.");
  if (room.players.length >= MAX_PLAYERS) throw new Error("방이 가득 찼습니다.");

  const playerId = makePlayerId();
  const reconnectToken = randomUUID();
  room.players.push({
    id: playerId,
    name: playerName || "Player",
    socket,
    connected: true,
    isBot: false,
    reconnectToken,
    disconnectTimer: null,
  });
  send(socket, { type: "roomJoined", roomCode: room.code, roomName: room.name, youAre: playerId, reconnectToken });
  broadcastLobby(room);
}

function reconnect(socket: WebSocket, roomCode: string, token: string): void {
  const found = findRoomAndPlayerByToken(roomCode, token);
  if (!found) {
    send(socket, {
      type: "errorMessage",
      message: "재접속에 실패했어요 — 방을 다시 찾아 참가해주세요.",
    });
    return;
  }
  const { room, player } = found;
  if (player.disconnectTimer) {
    clearTimeout(player.disconnectTimer);
    player.disconnectTimer = null;
  }
  player.socket = socket;
  player.connected = true;

  send(socket, {
    type: "reconnected",
    roomCode: room.code,
    roomName: room.name,
    youAre: player.id,
    hostId: room.hostPlayerId,
    status: room.status,
    players: toLobbyPlayers(room),
  });
  if (room.state) {
    send(socket, { type: "stateUpdate", view: toPlayerView(room.state, player.id) });
  }
}

// The explicit "I'm leaving on purpose" signal (← / ✕ during an active
// game) — ends things immediately instead of waiting out the reconnect
// grace period for what isn't actually a dropped connection.
function leaveGame(socket: WebSocket): void {
  const found = findRoomBySocket(socket);
  if (!found) return;
  const { room, player } = found;
  if (room.status === "IN_PROGRESS") {
    endGameDueToDeparture(room, player);
  }
}

// First unused name in the shared idol pool; once that's exhausted (a full
// 8-seat room could in principle want more bots than the pool has names
// for) falls back to a plain numbered label rather than erroring out.
function pickBotName(room: Room): string {
  const taken = new Set(room.players.map((p) => p.name));
  const free = BOT_NAME_POOL.find((name) => !taken.has(name));
  if (free) return free;
  let n = 1;
  while (taken.has(`AI ${n}`)) n++;
  return `AI ${n}`;
}

function addBot(socket: WebSocket): void {
  const found = findRoomBySocket(socket);
  if (!found) throw new Error("참가한 방이 없습니다.");
  const { room, player } = found;
  if (room.hostPlayerId !== player.id) throw new Error("방장만 AI를 추가할 수 있습니다.");
  if (room.status !== "LOBBY") throw new Error("이미 시작된 게임입니다.");
  if (room.players.length >= MAX_PLAYERS) throw new Error("방이 가득 찼습니다.");

  room.players.push({
    id: makePlayerId(),
    name: pickBotName(room),
    socket: null,
    connected: true,
    isBot: true,
    reconnectToken: "",
    disconnectTimer: null,
  });
  broadcastLobby(room);
}

function removeBot(socket: WebSocket, botId: string): void {
  const found = findRoomBySocket(socket);
  if (!found) throw new Error("참가한 방이 없습니다.");
  const { room, player } = found;
  if (room.hostPlayerId !== player.id) throw new Error("방장만 AI를 제거할 수 있습니다.");
  if (room.status !== "LOBBY") throw new Error("이미 시작된 게임입니다.");
  const target = room.players.find((p) => p.id === botId);
  if (!target || !target.isBot) throw new Error("해당 AI를 찾을 수 없습니다.");

  room.players = room.players.filter((p) => p.id !== botId);
  if (room.hostPlayerId === botId) {
    room.hostPlayerId = room.players[0]?.id ?? room.hostPlayerId;
  }
  broadcastLobby(room);
}

// Mirrors localMode.ts's runTurn loop. playCard already resolves a
// survived push-through card for whoever it's currently calling playCard
// *as* — but that rule actually fires the instant a turn begins, not
// whenever that player eventually gets around to submitting their next
// move. Without this, a card that survived push-through into someone's
// turn just sits there looking un-discarded to everyone else for however
// long that player takes to act, instead of clearing right away like it
// does in 혼자하기 (which calls resolveTurnStart eagerly, in this same
// spot in its own turn loop).
//
// A loop, not a single check, for the same reason localMode.ts's is: one
// resolution can itself advance the turn (an already-empty-handed owner
// just won) straight to someone else in the exact same situation.
function resolvePendingTurnStarts(room: Room): void {
  while (room.state) {
    const current = room.state.players[room.state.currentPlayerIndex];
    if (!current || !room.state.activeCards.some((ac) => ac.playerId === current.id)) return;
    room.state = resolveTurnStart(room.state, current.id);
    if (room.state.gameStatus === "FINISHED") {
      room.status = "FINISHED";
      recordMatch(room).catch((err) => console.error("전적 기록 실패:", err));
      return;
    }
  }
}

// After any move (a real player's, or a bot's own previous one), check
// whether the seat that's now up is a server-run one and, if so, play it
// a beat later — recursing afterward so a run of consecutive bot turns
// (nothing but bots left, or a push-through handing the turn to another
// bot) keeps going on its own until a real person's turn comes up.
function maybeScheduleBotMove(room: Room): void {
  if (!room.state || room.status !== "IN_PROGRESS") return;
  const currentId = room.state.players[room.state.currentPlayerIndex]?.id;
  const bot = room.players.find((p) => p.id === currentId);
  if (!bot?.isBot) return;

  setTimeout(() => {
    // The room may have been torn down (departure, or the game already
    // finished some other way) while this was waiting.
    if (!rooms.has(room.code) || room.status !== "IN_PROGRESS" || !room.state) return;

    const cardId = chooseBotMove(room.state, bot.id);
    room.state = playCard(room.state, bot.id, cardId);

    if (room.state.gameStatus === "FINISHED") {
      room.status = "FINISHED";
      recordMatch(room).catch((err) => console.error("전적 기록 실패:", err));
    } else {
      resolvePendingTurnStarts(room);
    }
    broadcastState(room, "stateUpdate");
    maybeScheduleBotMove(room);
  }, room.botThinkMs);
}

function startGame(socket: WebSocket, speed: Speed | undefined): void {
  const found = findRoomBySocket(socket);
  if (!found) throw new Error("참가한 방이 없습니다.");
  const { room, player } = found;
  if (room.hostPlayerId !== player.id) throw new Error("방장만 게임을 시작할 수 있습니다.");
  if (room.players.length < MIN_PLAYERS) throw new Error(`최소 ${MIN_PLAYERS}명이 필요합니다.`);
  if (room.status !== "LOBBY") throw new Error("이미 시작되었습니다.");

  if (speed && speed in BOT_THINK_MS_BY_SPEED) {
    room.botThinkMs = BOT_THINK_MS_BY_SPEED[speed];
  }
  room.state = createGame(room.players.map((p) => ({ id: p.id, name: p.name })));
  // "복불복" 시작 — 혼자하기(localMode.ts)와 동일하게, 턴 순서(회전 방향) 자체는
  // 참가 순서대로 고정하되 누가 맨 처음 낼지는 매 게임 무작위로 정한다. 방장이
  // 항상 먼저 시작하지 않도록.
  room.state.currentPlayerIndex = Math.floor(Math.random() * room.state.players.length);
  room.status = "IN_PROGRESS";
  room.startedAt = Date.now();
  broadcastState(room, "gameStarted");
  maybeScheduleBotMove(room);
}

function handlePlayCard(socket: WebSocket, cardId: string | undefined): void {
  const found = findRoomBySocket(socket);
  if (!found) throw new Error("참가한 방이 없습니다.");
  const { room, player } = found;
  if (!room.state || room.status !== "IN_PROGRESS") {
    throw new Error("아직 게임이 시작되지 않았습니다.");
  }

  try {
    room.state = playCard(room.state, player.id, cardId);
  } catch (err) {
    if (err instanceof GameError) {
      send(socket, { type: "actionRejected", reason: err.message });
      return;
    }
    throw err;
  }

  if (room.state.gameStatus === "FINISHED") {
    room.status = "FINISHED";
    // Fire-and-forget: recording history shouldn't delay the game-over
    // broadcast everyone is waiting on.
    recordMatch(room).catch((err) => console.error("전적 기록 실패:", err));
  } else {
    resolvePendingTurnStarts(room);
  }
  broadcastState(room, "stateUpdate");
  maybeScheduleBotMove(room);
}

// Purely for fun (see render.ts's showAllianceBanner) — relayed to every
// player in the room instead of just showing locally, so a 🤝 연합! click
// is a shared moment everyone in the game sees at the same time rather
// than something only the clicker notices on their own screen. The text
// is the shouter's own customized phrase (profile.ts) — trusted the same
// way a player's display name already is, but still capped here since
// it's about to be broadcast to everyone else's browser regardless of what
// the client claims it validated.
const MAX_ALLIANCE_TEXT_LENGTH = 12;

function shoutAlliance(socket: WebSocket, text: string | undefined): void {
  const found = findRoomBySocket(socket);
  if (!found) return;
  const trimmed = typeof text === "string" ? text.trim().slice(0, MAX_ALLIANCE_TEXT_LENGTH) : undefined;
  const message: ServerMessage = { type: "allianceShouted", text: trimmed || undefined };
  for (const p of found.room.players) send(p.socket, message);
}

// Stats/rankings are a future feature (CLAUDE.md TODO) — this just makes
// sure the raw data is captured as games finish, so nothing has to be
// backfilled later. No-op without a real DB (local dev fallback).
async function recordMatch(room: Room): Promise<void> {
  if (!room.state || !pool) return;
  const finishedAt = Date.now();
  const result = await pool.query(
    `INSERT INTO matches (room_name, room_code, started_at, finished_at, player_count)
     VALUES ($1, $2, $3, $4, $5) RETURNING id`,
    [room.name, room.code, room.startedAt ?? finishedAt, finishedAt, room.state.players.length],
  );
  const matchId = result.rows[0].id;
  for (const p of room.state.players) {
    await pool.query(
      `INSERT INTO match_players (match_id, player_name, is_winner, final_hand_size)
       VALUES ($1, $2, $3, $4)`,
      [matchId, p.name, p.isWinner, p.hand.length],
    );
  }
}
