import { z } from 'zod';
import { db } from '../db/client.js';
import { broadcastRoomSnapshot } from '../game/roomSnapshot.js';
import { addExit, getRoom, registerRoom, removeExit, unregisterRoom, updateRoom } from '../game/World.js';
import { builderRouter } from './router.js';
import { canDeleteRoom } from './roomGuard.js';
import { type CardinalDirection, reconcileExits } from './exitReconciler.js';

/** Village anchor rooms live outside the cardinal grid (accessed via `travel`/`leave`, not N/S/E/W) and are excluded from the builder's grid entirely. */
const NON_VILLAGE_ROOMS_SQL = 'id NOT IN (SELECT room_id FROM villages)';

const roomCreateSchema = z.object({
  name: z.string().min(1, '방 이름을 입력하세요.').max(50, '방 이름은 50자 이하여야 합니다.'),
  description: z.string().min(1, '방 설명을 입력하세요.').max(500, '설명은 500자 이하여야 합니다.'),
  x: z.number().int(),
  y: z.number().int(),
  zoneId: z.number().int(),
});

const roomPatchSchema = z.object({
  name: z.string().min(1, '방 이름을 입력하세요.').max(50, '방 이름은 50자 이하여야 합니다.').optional(),
  description: z.string().min(1, '방 설명을 입력하세요.').max(500, '설명은 500자 이하여야 합니다.').optional(),
  x: z.number().int().optional(),
  y: z.number().int().optional(),
});

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

/**
 * Recomputes the N/S/E/W exit graph from grid positions within one zone (excluding village rooms)
 * and applies the diff to the DB, World.ts, and connected clients. Scoped to a single zone_id so
 * that rooms in different zones never get treated as grid-adjacent to each other, and so editing
 * one zone never touches another zone's cardinal exits.
 */
function applyExitReconciliation(zoneId: number): void {
  const roomRows = db
    .prepare(`SELECT id, x, y FROM rooms WHERE zone_id = ? AND ${NON_VILLAGE_ROOMS_SQL}`)
    .all(zoneId) as { id: number; x: number; y: number }[];
  const exitRows = db
    .prepare(
      `SELECT room_id, direction, target_room_id FROM room_exits
       WHERE direction IN ('north','south','east','west') AND room_id IN (SELECT id FROM rooms WHERE zone_id = ?)`,
    )
    .all(zoneId) as { room_id: number; direction: CardinalDirection; target_room_id: number }[];

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

/** Lightweight cross-zone room list for portal target pickers — no coordinates/exits needed. */
builderRouter.get('/rooms/all', (_req, res) => {
  const rows = db
    .prepare(
      `SELECT rooms.id as id, rooms.name as name, rooms.zone_id as zoneId, zones.name as zoneName
       FROM rooms JOIN zones ON zones.id = rooms.zone_id
       WHERE rooms.id NOT IN (SELECT room_id FROM villages)
       ORDER BY zones.id, rooms.name`,
    )
    .all();
  res.json({ rooms: rows });
});

builderRouter.get('/rooms', (req, res) => {
  const zoneId = Number(req.query.zoneId);
  if (!zoneId) {
    res.status(400).json({ error: 'zoneId 쿼리 파라미터가 필요합니다.' });
    return;
  }

  const roomRows = db
    .prepare(`SELECT id, name, description, x, y, zone_id FROM rooms WHERE zone_id = ? AND ${NON_VILLAGE_ROOMS_SQL}`)
    .all(zoneId) as RoomRow[];
  const exitRows = db
    .prepare('SELECT room_id, direction, target_room_id, blocked FROM room_exits')
    .all() as RoomExitRow[];

  const exitsByRoom = new Map<number, { direction: string; targetRoomId: number; blocked: boolean }[]>();
  for (const row of exitRows) {
    const list = exitsByRoom.get(row.room_id) ?? [];
    list.push({ direction: row.direction, targetRoomId: row.target_room_id, blocked: Boolean(row.blocked) });
    exitsByRoom.set(row.room_id, list);
  }

  const rooms = roomRows.map((room) => ({
    id: room.id,
    name: room.name,
    description: room.description,
    x: room.x,
    y: room.y,
    zoneId: room.zone_id,
    exits: exitsByRoom.get(room.id) ?? [],
  }));
  res.json({ rooms });
});

builderRouter.post('/rooms', (req, res) => {
  const parsed = roomCreateSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' });
    return;
  }

  const { name, description, x, y, zoneId } = parsed.data;

  if (!db.prepare('SELECT 1 FROM zones WHERE id = ?').get(zoneId)) {
    res.status(404).json({ error: '존을 찾을 수 없습니다.' });
    return;
  }

  const occupied = db
    .prepare(`SELECT 1 FROM rooms WHERE x = ? AND y = ? AND zone_id = ? AND ${NON_VILLAGE_ROOMS_SQL}`)
    .get(x, y, zoneId);
  if (occupied) {
    res.status(409).json({ error: '이미 그 위치에 방이 있습니다.' });
    return;
  }

  const info = db
    .prepare('INSERT INTO rooms (name, description, x, y, zone_id) VALUES (?, ?, ?, ?, ?)')
    .run(name, description, x, y, zoneId);
  const id = Number(info.lastInsertRowid);
  registerRoom({ id, name, description, x, y, zoneId, exits: {} });

  applyExitReconciliation(zoneId);

  const created = getRoom(id)!;
  res.status(201).json({
    room: {
      id: created.id,
      name: created.name,
      description: created.description,
      x: created.x,
      y: created.y,
      zoneId: created.zoneId,
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
  const existingRoom = getRoom(id);
  if (!existingRoom) {
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
      .prepare(`SELECT 1 FROM rooms WHERE x = ? AND y = ? AND id != ? AND zone_id = ? AND ${NON_VILLAGE_ROOMS_SQL}`)
      .get(x, y, id, existingRoom.zoneId);
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
    applyExitReconciliation(existingRoom.zoneId);
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

  const connectedExits = db
    .prepare('SELECT room_id, direction, target_room_id FROM room_exits WHERE room_id = ? OR target_room_id = ?')
    .all(id, id) as { room_id: number; direction: string; target_room_id: number }[];

  db.prepare('DELETE FROM room_exits WHERE room_id = ? OR target_room_id = ?').run(id, id);
  db.prepare('DELETE FROM room_items WHERE room_id = ?').run(id);
  db.prepare('DELETE FROM mob_spawns WHERE room_id = ?').run(id);
  db.prepare('DELETE FROM npc_spawns WHERE room_id = ?').run(id);
  db.prepare('DELETE FROM rooms WHERE id = ?').run(id);

  const affectedRoomIds = new Set<number>();
  for (const exit of connectedExits) {
    removeExit(exit.room_id, exit.direction);
    affectedRoomIds.add(exit.room_id);
    affectedRoomIds.add(exit.target_room_id);
  }
  affectedRoomIds.delete(id);

  unregisterRoom(id);
  for (const roomId of affectedRoomIds) broadcastRoomSnapshot(roomId);

  res.status(204).send();
});
