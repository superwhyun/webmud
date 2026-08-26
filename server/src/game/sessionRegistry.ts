import type { WebSocket } from 'ws';
import type { ServerMessage } from '@mud/shared';
import { getRoom } from './World.js';
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

/** 보스 출현/처치처럼 방 하나가 아니라 존 전체에 알려야 할 때 쓴다. */
export function broadcastToZone(zoneId: number, message: ServerMessage): void {
  for (const session of sessions.values()) {
    if (getRoom(session.roomId)?.zoneId === zoneId) send(session.ws, message);
  }
}
