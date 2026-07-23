import type { PlayerFacingState } from "../engine/playerView";

export type ClientMessage =
  | { type: "createRoom"; playerName: string; roomName?: string; roomCode?: string }
  | { type: "joinRoom"; roomCode: string; playerName: string }
  | { type: "startGame" }
  | { type: "playCard"; cardId?: string };

export interface LobbyPlayer {
  id: string;
  name: string;
}

export type ServerMessage =
  | { type: "roomCreated"; roomCode: string; roomName: string; youAre: string }
  | { type: "roomJoined"; roomCode: string; roomName: string; youAre: string }
  | { type: "lobbyUpdate"; roomCode: string; roomName: string; hostId: string; players: LobbyPlayer[] }
  | { type: "gameStarted"; view: PlayerFacingState }
  | { type: "stateUpdate"; view: PlayerFacingState }
  | { type: "actionRejected"; reason: string }
  | { type: "errorMessage"; message: string };
