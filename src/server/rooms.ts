import type { WebSocket } from "ws";
import { GameError, createGame, playCard } from "../engine/gameEngine";
import { toPlayerView } from "../engine/playerView";
import type { GameState } from "../engine/types";
import type { ClientMessage, ServerMessage } from "../shared/protocol";
import { db } from "./db";
import { generateRoomCode } from "./roomCode";

const MIN_PLAYERS = 3;
const MAX_PLAYERS = 8;

interface RoomPlayer {
  id: string;
  name: string;
  socket: WebSocket;
}

interface Room {
  code: string;
  name: string;
  hostPlayerId: string;
  players: RoomPlayer[];
  state: GameState | null;
  status: "LOBBY" | "IN_PROGRESS" | "FINISHED";
  startedAt: number | null;
}

// Single in-memory registry — rooms disappear on server restart. Acceptable for a
// hobby project on a free host; documented as a known limitation, not a bug.
const rooms = new Map<string, Room>();
let nextPlayerNumber = 1;

function send(socket: WebSocket, message: ServerMessage): void {
  if (socket.readyState === socket.OPEN) {
    socket.send(JSON.stringify(message));
  }
}

function broadcastLobby(room: Room): void {
  const message: ServerMessage = {
    type: "lobbyUpdate",
    roomCode: room.code,
    roomName: room.name,
    hostId: room.hostPlayerId,
    players: room.players.map((p) => ({ id: p.id, name: p.name })),
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

function makePlayerId(): string {
  return `player-${nextPlayerNumber++}`;
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
    // A player dropping mid-game leaves their seat stuck — no reconnection support
    // in this MVP (documented stretch goal in CLAUDE.md).
  });
}

function handleMessage(socket: WebSocket, message: ClientMessage): void {
  switch (message.type) {
    case "createRoom":
      return createRoom(socket, message.playerName, message.roomName, message.roomCode);
    case "joinRoom":
      return joinRoom(socket, message.roomCode, message.playerName);
    case "startGame":
      return startGame(socket);
    case "playCard":
      return handlePlayCard(socket, message.cardId);
  }
}

function createRoom(
  socket: WebSocket,
  playerName: string,
  roomName: string | undefined,
  customCode: string | undefined,
): void {
  let code: string;
  if (customCode && customCode.trim()) {
    code = customCode.trim().toUpperCase();
    if (rooms.has(code)) throw new Error("이미 사용 중인 방 코드입니다.");
  } else {
    code = generateRoomCode((c) => rooms.has(c));
  }

  const playerId = makePlayerId();
  const room: Room = {
    code,
    name: roomName?.trim() || `${playerName || "Player"}의 방`,
    hostPlayerId: playerId,
    players: [{ id: playerId, name: playerName || "Player", socket }],
    state: null,
    status: "LOBBY",
    startedAt: null,
  };
  rooms.set(code, room);
  send(socket, { type: "roomCreated", roomCode: code, roomName: room.name, youAre: playerId });
  broadcastLobby(room);
}

function joinRoom(socket: WebSocket, roomCode: string, playerName: string): void {
  const room = rooms.get(roomCode.toUpperCase());
  if (!room) throw new Error("존재하지 않는 방 코드입니다.");
  if (room.status !== "LOBBY") throw new Error("이미 시작된 게임입니다.");
  if (room.players.length >= MAX_PLAYERS) throw new Error("방이 가득 찼습니다.");

  const playerId = makePlayerId();
  room.players.push({ id: playerId, name: playerName || "Player", socket });
  send(socket, { type: "roomJoined", roomCode: room.code, roomName: room.name, youAre: playerId });
  broadcastLobby(room);
}

function startGame(socket: WebSocket): void {
  const found = findRoomBySocket(socket);
  if (!found) throw new Error("참가한 방이 없습니다.");
  const { room, player } = found;
  if (room.hostPlayerId !== player.id) throw new Error("방장만 게임을 시작할 수 있습니다.");
  if (room.players.length < MIN_PLAYERS) throw new Error(`최소 ${MIN_PLAYERS}명이 필요합니다.`);
  if (room.status !== "LOBBY") throw new Error("이미 시작되었습니다.");

  room.state = createGame(room.players.map((p) => ({ id: p.id, name: p.name })));
  room.status = "IN_PROGRESS";
  room.startedAt = Date.now();
  broadcastState(room, "gameStarted");
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
  }
  broadcastState(room, "stateUpdate");
}

// Stats/rankings are a future feature (CLAUDE.md TODO) — this just makes
// sure the raw data is captured as games finish, so nothing has to be
// backfilled later.
async function recordMatch(room: Room): Promise<void> {
  if (!room.state) return;
  const finishedAt = Date.now();
  const result = await db.execute({
    sql: `INSERT INTO matches (room_name, room_code, started_at, finished_at, player_count)
          VALUES (?, ?, ?, ?, ?)`,
    args: [room.name, room.code, room.startedAt ?? finishedAt, finishedAt, room.state.players.length],
  });
  const matchId = result.lastInsertRowid;
  if (matchId === undefined) return;
  for (const p of room.state.players) {
    await db.execute({
      sql: `INSERT INTO match_players (match_id, player_name, is_winner, final_hand_size)
            VALUES (?, ?, ?, ?)`,
      args: [matchId, p.name, p.isWinner ? 1 : 0, p.hand.length],
    });
  }
}
