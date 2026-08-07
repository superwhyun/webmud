import type { WebSocket } from 'ws';
import type { ServerMessage } from '@mud/shared';
import { send } from './wsUtil.js';

export interface Session {
  ws: WebSocket;
  accountId: number;
  characterId: number;
  characterName: string;
  roomId: number;
}

const sessions = new Map<WebSocket, Session>();

export function addSession(session: Session): void {
  sessions.set(session.ws, session);
}

export function removeSession(ws: WebSocket): void {
  sessions.delete(ws);
}

export function getSession(ws: WebSocket): Session | undefined {
  return sessions.get(ws);
}

export function getSessionsInRoom(roomId: number): Session[] {
  return [...sessions.values()].filter((session) => session.roomId === roomId);
}

export function getAllSessions(): Session[] {
  return [...sessions.values()];
}

export function getSessionByCharacterName(characterName: string): Session | undefined {
  return [...sessions.values()].find((session) => session.characterName === characterName);
}

export function broadcastToRoom(roomId: number, message: ServerMessage, excludeWs?: WebSocket): void {
  for (const session of getSessionsInRoom(roomId)) {
    if (session.ws === excludeWs) continue;
    send(session.ws, message);
  }
}
