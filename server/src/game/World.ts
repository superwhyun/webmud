import { db } from '../db/client.js';

export interface RoomData {
  id: number;
  name: string;
  description: string;
  exits: Record<string, number>;
}

interface RoomRow {
  id: number;
  name: string;
  description: string;
}

interface RoomExitRow {
  room_id: number;
  direction: string;
  target_room_id: number;
}

const rooms = new Map<number, RoomData>();

export function loadWorld(): void {
  rooms.clear();

  const roomRows = db.prepare('SELECT id, name, description FROM rooms').all() as RoomRow[];
  for (const row of roomRows) {
    rooms.set(row.id, { id: row.id, name: row.name, description: row.description, exits: {} });
  }

  const exitRows = db
    .prepare('SELECT room_id, direction, target_room_id FROM room_exits')
    .all() as RoomExitRow[];
  for (const row of exitRows) {
    const room = rooms.get(row.room_id);
    if (room) room.exits[row.direction] = row.target_room_id;
  }
}

export function getRoom(id: number): RoomData | undefined {
  return rooms.get(id);
}

/** Registers a room created after startup (e.g. a newly founded village) without a full reload. */
export function registerRoom(room: RoomData): void {
  rooms.set(room.id, room);
}

/** Removes a dynamically registered room (e.g. a disbanded village's anchor room). */
export function unregisterRoom(roomId: number): void {
  rooms.delete(roomId);
}

export function updateRoom(id: number, patch: { name?: string; description?: string }): void {
  const room = rooms.get(id);
  if (!room) return;
  if (patch.name !== undefined) room.name = patch.name;
  if (patch.description !== undefined) room.description = patch.description;
}

export function addExit(roomId: number, direction: string, targetRoomId: number): void {
  const room = rooms.get(roomId);
  if (room) room.exits[direction] = targetRoomId;
}

export function removeExit(roomId: number, direction: string): void {
  const room = rooms.get(roomId);
  if (room) delete room.exits[direction];
}

loadWorld();
