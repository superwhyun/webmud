import type { WebSocket } from 'ws';
import type { RoomSnapshot } from '@mud/shared';
import { db } from '../db/client.js';
import type { CommandContext } from './commands/context.js';
import { DIRECTION_LABELS } from './directions.js';
import { getMobsInRoom } from './MobManager.js';
import { getSessionsInRoom } from './sessionRegistry.js';
import { getRoom } from './World.js';
import { send } from './wsUtil.js';

interface RoomItemQueryRow {
  name: string;
  quantity: number;
}

export function buildRoomSnapshot(roomId: number, viewerWs?: WebSocket): RoomSnapshot | undefined {
  const room = getRoom(roomId);
  if (!room) return undefined;

  const exits = Object.keys(room.exits).map((direction) => ({
    direction,
    label: DIRECTION_LABELS[direction] ?? direction,
  }));

  const items = db
    .prepare(
      `SELECT i.name, ri.quantity FROM room_items ri JOIN items i ON i.id = ri.item_id WHERE ri.room_id = ?`,
    )
    .all(roomId) as RoomItemQueryRow[];

  const mobs = getMobsInRoom(roomId).map((mob) => ({ name: mob.name, hp: mob.hp, maxHp: mob.maxHp }));

  const players = getSessionsInRoom(roomId)
    .filter((session) => session.ws !== viewerWs)
    .map((session) => session.characterName);

  return { name: room.name, description: room.description, exits, items, mobs, players };
}

export function sendRoomSnapshot(ctx: CommandContext): void {
  const snapshot = buildRoomSnapshot(ctx.session.roomId, ctx.session.ws);
  if (snapshot) ctx.send({ type: 'room', room: snapshot });
}

export function broadcastRoomSnapshot(roomId: number): void {
  for (const session of getSessionsInRoom(roomId)) {
    const snapshot = buildRoomSnapshot(roomId, session.ws);
    if (snapshot) send(session.ws, { type: 'room', room: snapshot });
  }
}
