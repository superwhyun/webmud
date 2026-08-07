import { Router } from 'express';
import { z } from 'zod';
import { db } from '../db/client.js';
import { requireAuth, requireBuilder } from '../auth/middleware.js';
import { broadcastRoomSnapshot } from '../game/roomSnapshot.js';
import { addExit, getRoom, registerRoom, removeExit, setExitBlocked, unregisterRoom, updateRoom } from '../game/World.js';
import { canDeleteRoom } from './roomGuard.js';
import { type CardinalDirection, reconcileExits } from './exitReconciler.js';

export const builderRouter = Router();

builderRouter.use(requireAuth, requireBuilder);

const CARDINAL_DIRECTIONS = ['north', 'south', 'east', 'west'] as const;

/** Village anchor rooms live outside the cardinal grid (accessed via `travel`/`leave`, not N/S/E/W) and are excluded from the builder's grid entirely. */
const NON_VILLAGE_ROOMS_SQL = 'id NOT IN (SELECT room_id FROM villages)';

const roomCreateSchema = z.object({
  name: z.string().min(1, '방 이름을 입력하세요.').max(50, '방 이름은 50자 이하여야 합니다.'),
  description: z.string().min(1, '방 설명을 입력하세요.').max(500, '설명은 500자 이하여야 합니다.'),
  x: z.number().int(),
  y: z.number().int(),
});

const roomPatchSchema = z.object({
  name: z.string().min(1, '방 이름을 입력하세요.').max(50, '방 이름은 50자 이하여야 합니다.').optional(),
  description: z.string().min(1, '방 설명을 입력하세요.').max(500, '설명은 500자 이하여야 합니다.').optional(),
  x: z.number().int().optional(),
  y: z.number().int().optional(),
});

const exitBlockSchema = z.object({
  roomId: z.number().int(),
  direction: z.enum(CARDINAL_DIRECTIONS),
  blocked: z.boolean(),
});

interface RoomRow {
  id: number;
  name: string;
  description: string;
  x: number;
  y: number;
}

interface RoomExitRow {
  room_id: number;
  direction: string;
  target_room_id: number;
  blocked: number;
}

/** Recomputes the N/S/E/W exit graph from grid positions (excluding village rooms) and applies the diff to the DB, World.ts, and connected clients. */
function applyExitReconciliation(): void {
  const roomRows = db
    .prepare(`SELECT id, x, y FROM rooms WHERE ${NON_VILLAGE_ROOMS_SQL}`)
    .all() as { id: number; x: number; y: number }[];
  const exitRows = db
    .prepare(
      `SELECT room_id, direction, target_room_id FROM room_exits WHERE direction IN ('north','south','east','west')`,
    )
    .all() as { room_id: number; direction: CardinalDirection; target_room_id: number }[];

  const diff = reconcileExits(
    roomRows,
    exitRows.map((row) => ({ roomId: row.room_id, direction: row.direction, targetRoomId: row.target_room_id })),
  );

  const upsertStmt = db.prepare(
    `INSERT INTO room_exits (room_id, direction, target_room_id, blocked) VALUES (?, ?, ?, 0)
     ON CONFLICT(room_id, direction) DO UPDATE SET target_room_id = excluded.target_room_id, blocked = 0`,
  );
  const removeStmt = db.prepare('DELETE FROM room_exits WHERE room_id = ? AND direction = ?');

  const affectedRoomIds = new Set<number>();

  for (const upsert of diff.toUpsert) {
    upsertStmt.run(upsert.roomId, upsert.direction, upsert.targetRoomId);
    addExit(upsert.roomId, upsert.direction, upsert.targetRoomId, false);
    affectedRoomIds.add(upsert.roomId);
  }

  for (const removal of diff.toRemove) {
    removeStmt.run(removal.roomId, removal.direction);
    removeExit(removal.roomId, removal.direction);
    affectedRoomIds.add(removal.roomId);
  }

  for (const roomId of affectedRoomIds) broadcastRoomSnapshot(roomId);
}

builderRouter.get('/rooms', (_req, res) => {
  const roomRows = db
    .prepare(`SELECT id, name, description, x, y FROM rooms WHERE ${NON_VILLAGE_ROOMS_SQL}`)
    .all() as RoomRow[];
  const exitRows = db
    .prepare('SELECT room_id, direction, target_room_id, blocked FROM room_exits')
    .all() as RoomExitRow[];

  const exitsByRoom = new Map<number, { direction: string; targetRoomId: number; blocked: boolean }[]>();
  for (const row of exitRows) {
    const list = exitsByRoom.get(row.room_id) ?? [];
    list.push({ direction: row.direction, targetRoomId: row.target_room_id, blocked: Boolean(row.blocked) });
    exitsByRoom.set(row.room_id, list);
  }

  const rooms = roomRows.map((room) => ({ ...room, exits: exitsByRoom.get(room.id) ?? [] }));
  res.json({ rooms });
});

builderRouter.post('/rooms', (req, res) => {
  const parsed = roomCreateSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' });
    return;
  }

  const { name, description, x, y } = parsed.data;

  const occupied = db
    .prepare(`SELECT 1 FROM rooms WHERE x = ? AND y = ? AND ${NON_VILLAGE_ROOMS_SQL}`)
    .get(x, y);
  if (occupied) {
    res.status(409).json({ error: '이미 그 위치에 방이 있습니다.' });
    return;
  }

  const info = db
    .prepare('INSERT INTO rooms (name, description, x, y) VALUES (?, ?, ?, ?)')
    .run(name, description, x, y);
  const id = Number(info.lastInsertRowid);
  registerRoom({ id, name, description, x, y, exits: {} });

  applyExitReconciliation();

  const created = getRoom(id)!;
  res.status(201).json({
    room: {
      id: created.id,
      name: created.name,
      description: created.description,
      x: created.x,
      y: created.y,
      exits: Object.entries(created.exits).map(([direction, exit]) => ({
        direction,
        targetRoomId: exit.targetRoomId,
        blocked: exit.blocked,
      })),
    },
  });
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

  const { name, description, x, y } = parsed.data;
  if (name === undefined && description === undefined && x === undefined && y === undefined) {
    res.status(400).json({ error: '수정할 내용이 없습니다.' });
    return;
  }

  if (x !== undefined && y !== undefined) {
    const occupied = db
      .prepare(`SELECT 1 FROM rooms WHERE x = ? AND y = ? AND id != ? AND ${NON_VILLAGE_ROOMS_SQL}`)
      .get(x, y, id);
    if (occupied) {
      res.status(409).json({ error: '이미 그 위치에 방이 있습니다.' });
      return;
    }
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
  if (x !== undefined) {
    fields.push('x = ?');
    values.push(x);
  }
  if (y !== undefined) {
    fields.push('y = ?');
    values.push(y);
  }
  values.push(id);

  db.prepare(`UPDATE rooms SET ${fields.join(', ')} WHERE id = ?`).run(...values);
  updateRoom(id, { name, description, x, y });

  if (x !== undefined || y !== undefined) {
    applyExitReconciliation();
  } else {
    broadcastRoomSnapshot(id);
  }

  const updated = getRoom(id)!;
  res.json({
    room: { id: updated.id, name: updated.name, description: updated.description, x: updated.x, y: updated.y },
  });
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

builderRouter.patch('/exits/block', (req, res) => {
  const parsed = exitBlockSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' });
    return;
  }

  const { roomId, direction, blocked } = parsed.data;
  const room = getRoom(roomId);
  if (!room?.exits[direction]) {
    res.status(404).json({ error: '출구를 찾을 수 없습니다.' });
    return;
  }

  db.prepare('UPDATE room_exits SET blocked = ? WHERE room_id = ? AND direction = ?').run(
    blocked ? 1 : 0,
    roomId,
    direction,
  );
  setExitBlocked(roomId, direction, blocked);
  broadcastRoomSnapshot(roomId);

  res.json({ roomId, direction, blocked });
});
