import type { PlayerFacingState } from "../engine/playerView";

export type ClientMessage =
  | { type: "createRoom"; playerName: string; roomName?: string }
  | { type: "joinRoom"; roomCode: string; playerName: string }
  // Resumes an existing seat after a dropped connection (see rooms.ts's
  // reconnect grace period) — token comes from the roomCreated/roomJoined/
  // reconnected response that first put the player in that seat.
  | { type: "reconnect"; roomCode: string; token: string }
  // Sent right before a deliberate leave (← / ✕) during an active game, so
  // the server can end it and notify the other players immediately instead
  // of waiting out the reconnect grace period for what isn't a dropped
  // connection at all.
  | { type: "leaveGame" }
  // Host-only, LOBBY only — fills an open seat with a server-driven AI
  // player (rooms.ts runs its turns with the same chooseBotMove used by
  // 혼자하기, on a short delay). Lets a room start and play with as few as
  // one real person in it.
  | { type: "addBot" }
  | { type: "removeBot"; playerId: string }
  | { type: "startGame" }
  | { type: "playCard"; cardId?: string }
  | { type: "shoutAlliance"; text?: string };

export interface LobbyPlayer {
  id: string;
  name: string;
  isBot: boolean;
}

export type RoomStatus = "LOBBY" | "IN_PROGRESS" | "FINISHED";

export type ServerMessage =
  | { type: "roomCreated"; roomCode: string; roomName: string; youAre: string; reconnectToken: string }
  | { type: "roomJoined"; roomCode: string; roomName: string; youAre: string; reconnectToken: string }
  | { type: "lobbyUpdate"; roomCode: string; roomName: string; hostId: string; players: LobbyPlayer[] }
  | { type: "gameStarted"; view: PlayerFacingState }
  | { type: "stateUpdate"; view: PlayerFacingState }
  | { type: "actionRejected"; reason: string }
  | { type: "errorMessage"; message: string }
  | { type: "allianceShouted"; text?: string }
  | {
      type: "reconnected";
      roomCode: string;
      roomName: string;
      youAre: string;
      hostId: string;
      status: RoomStatus;
      players: LobbyPlayer[];
    }
  // Broadcast to whoever's left when a player's seat is given up for good
  // (their reconnect grace period ran out, or they left on purpose) during
  // an active game — the game can't continue without that seat, so it ends
  // here rather than leaving everyone else's turn stuck waiting forever.
  | { type: "playerLeft"; playerName: string };
