import { Router } from 'express';
import { z } from 'zod';
import { DIRECTION_VALUES, OPPOSITE_DIRECTION } from '@mud/shared';
import { db } from '../db/client.js';
import { requireAuth, requireBuilder } from '../auth/middleware.js';
import { broadcastRoomSnapshot } from '../game/roomSnapshot.js';
import { addExit, getRoom, registerRoom, removeExit, unregisterRoom, updateRoom } from '../game/World.js';
import { canDeleteRoom } from './roomGuard.js';

export const builderRouter = Router();

builderRouter.use(requireAuth, requireBuilder);

const roomSchema = z.object({
  name: z.string().min(1, '방 이름을 입력하세요.').max(50, '방 이름은 50자 이하여야 합니다.'),
  description: z.string().min(1, '방 설명을 입력하세요.').max(500, '설명은 500자 이하여야 합니다.'),
});

const roomPatchSchema = z.object({
  name: z.string().min(1, '방 이름을 입력하세요.').max(50, '방 이름은 50자 이하여야 합니다.').optional(),
  description: z.string().min(1, '방 설명을 입력하세요.').max(500, '설명은 500자 이하여야 합니다.').optional(),
});

const directionEnum = z.enum(DIRECTION_VALUES as [string, ...string[]], { message: '올바른 방향이 아닙니다.' });

const exitCreateSchema = z.object({
  roomId: z.number().int(),
  direction: directionEnum,
  targetRoomId: z.number().int(),
  bidirectional: z.boolean().optional(),
});

const exitDeleteSchema = z.object({
  roomId: z.number().int(),
  direction: directionEnum,
  alsoReverse: z.boolean().optional(),
});

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

builderRouter.get('/rooms', (_req, res) => {
  const roomRows = db.prepare('SELECT id, name, description FROM rooms').all() as RoomRow[];
  const exitRows = db
    .prepare('SELECT room_id, direction, target_room_id FROM room_exits')
    .all() as RoomExitRow[];

  const exitsByRoom = new Map<number, { direction: string; targetRoomId: number }[]>();
  for (const row of exitRows) {
    const list = exitsByRoom.get(row.room_id) ?? [];
    list.push({ direction: row.direction, targetRoomId: row.target_room_id });
    exitsByRoom.set(row.room_id, list);
  }

  const rooms = roomRows.map((room) => ({ ...room, exits: exitsByRoom.get(room.id) ?? [] }));
  res.json({ rooms });
});

builderRouter.post('/rooms', (req, res) => {
  const parsed = roomSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' });
    return;
  }

  const { name, description } = parsed.data;
  const info = db.prepare('INSERT INTO rooms (name, description) VALUES (?, ?)').run(name, description);
  const id = Number(info.lastInsertRowid);
  registerRoom({ id, name, description, exits: {} });

  res.status(201).json({ room: { id, name, description, exits: [] } });
});

builderRouter.patch('/rooms/:id', (req, res) => {
  const id = Number(req.params.id);
  if (!getRoom(id)) {
    res.status(404).json({ error: '방을 찾을 수 없습니다.' });
    return;
  }

  const parsed = roomPatchSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' });
    return;
  }

  const { name, description } = parsed.data;
  if (name === undefined && description === undefined) {
    res.status(400).json({ error: '수정할 내용이 없습니다.' });
    return;
  }

  const fields: string[] = [];
  const values: (string | number)[] = [];
  if (name !== undefined) {
    fields.push('name = ?');
    values.push(name);
  }
  if (description !== undefined) {
    fields.push('description = ?');
    values.push(description);
  }
  values.push(id);

  db.prepare(`UPDATE rooms SET ${fields.join(', ')} WHERE id = ?`).run(...values);
  updateRoom(id, { name, description });
  broadcastRoomSnapshot(id);

  const updated = getRoom(id)!;
  res.json({ room: { id: updated.id, name: updated.name, description: updated.description } });
});

builderRouter.delete('/rooms/:id', (req, res) => {
  const id = Number(req.params.id);
  const check = canDeleteRoom(id);
  if (!check.allowed) {
    res.status(409).json({ error: check.reason });
    return;
  }

  db.prepare('DELETE FROM rooms WHERE id = ?').run(id);
  unregisterRoom(id);
  res.status(204).send();
});

builderRouter.post('/exits', (req, res) => {
  const parsed = exitCreateSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' });
    return;
  }

  const { roomId, direction, targetRoomId, bidirectional } = parsed.data;
  if (!getRoom(roomId) || !getRoom(targetRoomId)) {
    res.status(404).json({ error: '방을 찾을 수 없습니다.' });
    return;
  }

  const existing = db.prepare('SELECT 1 FROM room_exits WHERE room_id = ? AND direction = ?').get(roomId, direction);
  if (existing) {
    res.status(409).json({ error: '이미 해당 방향에 출구가 있습니다.' });
    return;
  }

  db.prepare('INSERT INTO room_exits (room_id, direction, target_room_id) VALUES (?, ?, ?)').run(
    roomId,
    direction,
    targetRoomId,
  );
  addExit(roomId, direction, targetRoomId);
  broadcastRoomSnapshot(roomId);

  let reverseCreated = false;
  if (bidirectional) {
    const opposite = OPPOSITE_DIRECTION[direction];
    const reverseExisting = db
      .prepare('SELECT 1 FROM room_exits WHERE room_id = ? AND direction = ?')
      .get(targetRoomId, opposite);
    if (!reverseExisting) {
      db.prepare('INSERT INTO room_exits (room_id, direction, target_room_id) VALUES (?, ?, ?)').run(
        targetRoomId,
        opposite,
        roomId,
      );
      addExit(targetRoomId, opposite, roomId);
      broadcastRoomSnapshot(targetRoomId);
      reverseCreated = true;
    }
  }

  res.status(201).json({ direction, targetRoomId, reverseCreated });
});

builderRouter.delete('/exits', (req, res) => {
  const parsed = exitDeleteSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' });
    return;
  }

  const { roomId, direction, alsoReverse } = parsed.data;
  const room = getRoom(roomId);
  const targetRoomId = room?.exits[direction];

  db.prepare('DELETE FROM room_exits WHERE room_id = ? AND direction = ?').run(roomId, direction);
  removeExit(roomId, direction);
  broadcastRoomSnapshot(roomId);

  if (alsoReverse && targetRoomId !== undefined) {
    const opposite = OPPOSITE_DIRECTION[direction];
    db.prepare('DELETE FROM room_exits WHERE room_id = ? AND direction = ?').run(targetRoomId, opposite);
    removeExit(targetRoomId, opposite);
    broadcastRoomSnapshot(targetRoomId);
  }

  res.status(204).send();
});
