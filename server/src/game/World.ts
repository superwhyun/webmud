import { db } from '../db/client.js';

export interface RoomExit {
  targetRoomId: number;
  blocked: boolean;
}

export interface RoomData {
  id: number;
  name: string;
  description: string;
  x: number;
  y: number;
  zoneId: number;
  exits: Record<string, RoomExit>;
}

interface RoomRow {
  id: number;
  name: string;
  description: string;
  x: number;
  y: number;
  zone_id: number;
}

interface RoomExitRow {
  room_id: number;
  direction: string;
  target_room_id: number;
  blocked: number;
}

const rooms = new Map<number, RoomData>();

export function loadWorld(): void {
  rooms.clear();

  const roomRows = db.prepare('SELECT id, name, description, x, y, zone_id FROM rooms').all() as RoomRow[];
  for (const row of roomRows) {
    rooms.set(row.id, {
      id: row.id,
      name: row.name,
      description: row.description,
      x: row.x,
      y: row.y,
      zoneId: row.zone_id,
      exits: {},
    });
  }

  const exitRows = db
    .prepare('SELECT room_id, direction, target_room_id, blocked FROM room_exits')
    .all() as RoomExitRow[];
  for (const row of exitRows) {
    const room = rooms.get(row.room_id);
    if (room) room.exits[row.direction] = { targetRoomId: row.target_room_id, blocked: Boolean(row.blocked) };
  }
}

export function getRoom(id: number): RoomData | undefined {
  return rooms.get(id);
}

export function getAllRooms(): RoomData[] {
  return [...rooms.values()];
}

/** Registers a room created after startup (e.g. a newly founded village or a builder-created room) without a full reload. */
export function registerRoom(room: RoomData): void {
  rooms.set(room.id, room);
}

/** Removes a dynamically registered room (e.g. a disbanded village's anchor room). */
export function unregisterRoom(roomId: number): void {
  rooms.delete(roomId);
}

export function updateRoom(id: number, patch: { name?: string; description?: string; x?: number; y?: number }): void {
  const room = rooms.get(id);
  if (!room) return;
  if (patch.name !== undefined) room.name = patch.name;
  if (patch.description !== undefined) room.description = patch.description;
  if (patch.x !== undefined) room.x = patch.x;
  if (patch.y !== undefined) room.y = patch.y;
}

export function addExit(roomId: number, direction: string, targetRoomId: number, blocked = false): void {
  const room = rooms.get(roomId);
  if (room) room.exits[direction] = { targetRoomId, blocked };
}

export function removeExit(roomId: number, direction: string): void {
  const room = rooms.get(roomId);
  if (room) delete room.exits[direction];
}

export function setExitBlocked(roomId: number, direction: string, blocked: boolean): void {
  const room = rooms.get(roomId);
  const exit = room?.exits[direction];
  if (exit) exit.blocked = blocked;
}

loadWorld();
