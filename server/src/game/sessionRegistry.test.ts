import { afterEach, describe, expect, it, vi } from 'vitest';
import type { WebSocket } from 'ws';
import { addSession, broadcastToZone, removeSession, type Session } from './sessionRegistry.js';
import { registerRoom, unregisterRoom } from './World.js';

const ZONE_A = -9001;
const ZONE_B = -9002;
const ROOM_A1 = -9101;
const ROOM_A2 = -9102;
const ROOM_B1 = -9103;

function fakeSocket(): WebSocket {
  return { send: vi.fn() } as unknown as WebSocket;
}

function fakeSession(ws: WebSocket, roomId: number): Session {
  return { ws, accountId: 1, characterId: 1, characterName: 'tester', roomId };
}

describe('broadcastToZone', () => {
  const sessions: Session[] = [];

  afterEach(() => {
    for (const session of sessions) removeSession(session.ws);
    sessions.length = 0;
    unregisterRoom(ROOM_A1);
    unregisterRoom(ROOM_A2);
    unregisterRoom(ROOM_B1);
  });

  it('reaches every session whose room is in the target zone, regardless of which room, and skips other zones', () => {
    registerRoom({ id: ROOM_A1, name: '방A1', description: '', x: 0, y: 0, zoneId: ZONE_A, exits: {} });
    registerRoom({ id: ROOM_A2, name: '방A2', description: '', x: 1, y: 0, zoneId: ZONE_A, exits: {} });
    registerRoom({ id: ROOM_B1, name: '방B1', description: '', x: 0, y: 0, zoneId: ZONE_B, exits: {} });

    const inZoneRoom1 = fakeSession(fakeSocket(), ROOM_A1);
    const inZoneRoom2 = fakeSession(fakeSocket(), ROOM_A2);
    const otherZone = fakeSession(fakeSocket(), ROOM_B1);
    sessions.push(inZoneRoom1, inZoneRoom2, otherZone);
    for (const session of sessions) addSession(session);

    broadcastToZone(ZONE_A, { type: 'text', text: '[보스 출현] 테스트' });

    expect(inZoneRoom1.ws.send).toHaveBeenCalledTimes(1);
    expect(inZoneRoom2.ws.send).toHaveBeenCalledTimes(1);
    expect(otherZone.ws.send).not.toHaveBeenCalled();
  });
});
