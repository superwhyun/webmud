import { Router } from 'express';
import { z } from 'zod';
import { db } from '../db/client.js';
import { requireAuth, requireBuilder } from '../auth/middleware.js';
import { toItemDto, toMobTemplateDto, toNpcTemplateDto } from '../db/dto.js';
import type { ItemRow, MobTemplateRow, NpcTemplateRow } from '../db/types.js';
import { despawnMob, registerMobSpawn } from '../game/MobManager.js';
import { despawnNpc, registerNpcSpawn } from '../game/NpcManager.js';
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
  zoneId: z.number().int(),
});

const zoneCreateSchema = z.object({
  name: z.string().min(1, '존 이름을 입력하세요.').max(30, '존 이름은 30자 이하여야 합니다.'),
  description: z.string().max(200, '설명은 200자 이하여야 합니다.').optional().default(''),
});

const CARDINAL_SET = new Set<string>(CARDINAL_DIRECTIONS);

const exitCreateSchema = z.object({
  roomId: z.number().int(),
  label: z.string().min(1, '연결점 이름을 입력하세요.').max(30, '연결점 이름은 30자 이하여야 합니다.'),
  targetRoomId: z.number().int(),
  returnLabel: z.string().max(30, '왕복 연결점 이름은 30자 이하여야 합니다.').optional(),
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

builderRouter.get('/zones', (_req, res) => {
  const zones = db.prepare('SELECT id, name, description FROM zones ORDER BY id').all();
  res.json({ zones });
});

builderRouter.post('/zones', (req, res) => {
  const parsed = zoneCreateSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' });
    return;
  }

  const { name, description } = parsed.data;
  if (db.prepare('SELECT 1 FROM zones WHERE name = ?').get(name)) {
    res.status(409).json({ error: '이미 사용 중인 존 이름입니다.' });
    return;
  }

  const info = db.prepare('INSERT INTO zones (name, description) VALUES (?, ?)').run(name, description);
  res.status(201).json({ zone: { id: Number(info.lastInsertRowid), name, description } });
});

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

/**
 * Portal-style connectors between rooms (usually across zones). Reuses room_exits with a custom,
 * non-cardinal `direction` value as the label — exitReconciler only ever touches north/south/east/west
 * rows, so these are completely safe from grid auto-reconciliation, and handleMove() already resolves
 * any direction string generically, so no runtime movement changes are needed.
 */
builderRouter.post('/exits', (req, res) => {
  const parsed = exitCreateSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' });
    return;
  }

  const { roomId, label, targetRoomId, returnLabel } = parsed.data;

  if (CARDINAL_SET.has(label) || (returnLabel && CARDINAL_SET.has(returnLabel))) {
    res.status(400).json({ error: '연결점 이름으로 north/south/east/west는 쓸 수 없습니다.' });
    return;
  }

  const fromRoom = getRoom(roomId);
  const toRoom = getRoom(targetRoomId);
  if (!fromRoom || !toRoom) {
    res.status(404).json({ error: '방을 찾을 수 없습니다.' });
    return;
  }
  if (fromRoom.exits[label]) {
    res.status(409).json({ error: '이미 같은 이름의 연결점이 있습니다.' });
    return;
  }
  if (returnLabel && toRoom.exits[returnLabel]) {
    res.status(409).json({ error: '대상 방에 이미 같은 이름의 연결점이 있습니다.' });
    return;
  }

  db.prepare('INSERT INTO room_exits (room_id, direction, target_room_id, blocked) VALUES (?, ?, ?, 0)').run(
    roomId,
    label,
    targetRoomId,
  );
  addExit(roomId, label, targetRoomId, false);

  if (returnLabel) {
    db.prepare('INSERT INTO room_exits (room_id, direction, target_room_id, blocked) VALUES (?, ?, ?, 0)').run(
      targetRoomId,
      returnLabel,
      roomId,
    );
    addExit(targetRoomId, returnLabel, roomId, false);
  }

  broadcastRoomSnapshot(roomId);
  if (returnLabel) broadcastRoomSnapshot(targetRoomId);

  res.status(201).json({ ok: true });
});

builderRouter.delete('/exits/:roomId/:direction', (req, res) => {
  const roomId = Number(req.params.roomId);
  const direction = decodeURIComponent(req.params.direction);

  if (CARDINAL_SET.has(direction)) {
    res.status(400).json({ error: '방향 출구는 방을 드래그하거나 화살표를 클릭해 관리하세요.' });
    return;
  }

  const room = getRoom(roomId);
  if (!room?.exits[direction]) {
    res.status(404).json({ error: '연결점을 찾을 수 없습니다.' });
    return;
  }

  db.prepare('DELETE FROM room_exits WHERE room_id = ? AND direction = ?').run(roomId, direction);
  removeExit(roomId, direction);
  broadcastRoomSnapshot(roomId);

  res.status(204).send();
});

builderRouter.get('/item-templates', (_req, res) => {
  const rows = db.prepare('SELECT * FROM items ORDER BY id').all() as ItemRow[];
  res.json({ items: rows.map(toItemDto) });
});

builderRouter.get('/mob-templates', (_req, res) => {
  const rows = db.prepare('SELECT * FROM mob_templates ORDER BY id').all() as MobTemplateRow[];
  res.json({ mobTemplates: rows.map(toMobTemplateDto) });
});

builderRouter.get('/npc-templates', (_req, res) => {
  const rows = db.prepare('SELECT * FROM npc_templates ORDER BY id').all() as NpcTemplateRow[];
  res.json({ npcTemplates: rows.map(toNpcTemplateDto) });
});

builderRouter.get('/room-items', (_req, res) => {
  const rows = db
    .prepare(
      `SELECT ri.id, ri.room_id, ri.item_id, ri.quantity, r.name as room_name, i.name as item_name, i.grade as item_grade
       FROM room_items ri JOIN rooms r ON r.id = ri.room_id JOIN items i ON i.id = ri.item_id
       ORDER BY ri.id`,
    )
    .all() as {
    id: number;
    room_id: number;
    item_id: number;
    quantity: number;
    room_name: string;
    item_name: string;
    item_grade: string;
  }[];

  res.json({
    roomItems: rows.map((row) => ({
      id: row.id,
      roomId: row.room_id,
      roomName: row.room_name,
      itemId: row.item_id,
      itemName: row.item_name,
      itemGrade: row.item_grade,
      quantity: row.quantity,
    })),
  });
});

const roomItemSchema = z.object({
  roomId: z.number().int(),
  itemId: z.number().int(),
  quantity: z.number().int().min(1).default(1),
});

builderRouter.post('/room-items', (req, res) => {
  const parsed = roomItemSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' });
    return;
  }

  const { roomId, itemId, quantity } = parsed.data;
  if (!getRoom(roomId)) {
    res.status(404).json({ error: '방을 찾을 수 없습니다.' });
    return;
  }
  if (!db.prepare('SELECT id FROM items WHERE id = ?').get(itemId)) {
    res.status(404).json({ error: '아이템을 찾을 수 없습니다.' });
    return;
  }

  db.prepare('INSERT INTO room_items (room_id, item_id, quantity) VALUES (?, ?, ?)').run(roomId, itemId, quantity);
  broadcastRoomSnapshot(roomId);
  res.status(201).send();
});

const roomItemDeleteSchema = z.object({ roomItemId: z.number().int() });

builderRouter.delete('/room-items', (req, res) => {
  const parsed = roomItemDeleteSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' });
    return;
  }

  const row = db.prepare('SELECT room_id FROM room_items WHERE id = ?').get(parsed.data.roomItemId) as
    | { room_id: number }
    | undefined;
  db.prepare('DELETE FROM room_items WHERE id = ?').run(parsed.data.roomItemId);
  if (row) broadcastRoomSnapshot(row.room_id);
  res.status(204).send();
});

builderRouter.get('/mob-spawns', (_req, res) => {
  const rows = db
    .prepare(
      `SELECT ms.id, ms.room_id, ms.mob_template_id, ms.respawn_seconds, r.name as room_name, mt.name as mob_name
       FROM mob_spawns ms JOIN rooms r ON r.id = ms.room_id JOIN mob_templates mt ON mt.id = ms.mob_template_id
       ORDER BY ms.id`,
    )
    .all() as {
    id: number;
    room_id: number;
    mob_template_id: number;
    respawn_seconds: number;
    room_name: string;
    mob_name: string;
  }[];

  res.json({
    mobSpawns: rows.map((row) => ({
      id: row.id,
      roomId: row.room_id,
      roomName: row.room_name,
      mobTemplateId: row.mob_template_id,
      mobName: row.mob_name,
      respawnSeconds: row.respawn_seconds,
    })),
  });
});

const mobSpawnSchema = z.object({
  roomId: z.number().int(),
  mobTemplateId: z.number().int(),
  respawnSeconds: z.number().int().min(5).default(20),
});

builderRouter.post('/mob-spawns', (req, res) => {
  const parsed = mobSpawnSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' });
    return;
  }

  const { roomId, mobTemplateId, respawnSeconds } = parsed.data;
  if (!getRoom(roomId)) {
    res.status(404).json({ error: '방을 찾을 수 없습니다.' });
    return;
  }

  const template = db.prepare('SELECT * FROM mob_templates WHERE id = ?').get(mobTemplateId) as
    | MobTemplateRow
    | undefined;
  if (!template) {
    res.status(404).json({ error: '몹 템플릿을 찾을 수 없습니다.' });
    return;
  }

  const info = db
    .prepare('INSERT INTO mob_spawns (room_id, mob_template_id, respawn_seconds) VALUES (?, ?, ?)')
    .run(roomId, mobTemplateId, respawnSeconds);
  const spawnId = Number(info.lastInsertRowid);

  registerMobSpawn(spawnId, roomId, template, respawnSeconds);
  broadcastRoomSnapshot(roomId);

  res.status(201).json({ spawnId });
});

builderRouter.delete('/mob-spawns/:id', (req, res) => {
  const spawnId = Number(req.params.id);
  const row = db.prepare('SELECT room_id FROM mob_spawns WHERE id = ?').get(spawnId) as { room_id: number } | undefined;

  db.prepare('DELETE FROM mob_spawns WHERE id = ?').run(spawnId);
  despawnMob(spawnId);
  if (row) broadcastRoomSnapshot(row.room_id);

  res.status(204).send();
});

builderRouter.get('/npc-spawns', (_req, res) => {
  const rows = db
    .prepare(
      `SELECT ns.id, ns.room_id, ns.npc_template_id, r.name as room_name, nt.name as npc_name
       FROM npc_spawns ns JOIN rooms r ON r.id = ns.room_id JOIN npc_templates nt ON nt.id = ns.npc_template_id
       ORDER BY ns.id`,
    )
    .all() as {
    id: number;
    room_id: number;
    npc_template_id: number;
    room_name: string;
    npc_name: string;
  }[];

  res.json({
    npcSpawns: rows.map((row) => ({
      id: row.id,
      roomId: row.room_id,
      roomName: row.room_name,
      npcTemplateId: row.npc_template_id,
      npcName: row.npc_name,
    })),
  });
});

const npcSpawnSchema = z.object({
  roomId: z.number().int(),
  npcTemplateId: z.number().int(),
});

builderRouter.post('/npc-spawns', (req, res) => {
  const parsed = npcSpawnSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' });
    return;
  }

  const { roomId, npcTemplateId } = parsed.data;
  if (!getRoom(roomId)) {
    res.status(404).json({ error: '방을 찾을 수 없습니다.' });
    return;
  }

  const template = db.prepare('SELECT * FROM npc_templates WHERE id = ?').get(npcTemplateId) as
    | NpcTemplateRow
    | undefined;
  if (!template) {
    res.status(404).json({ error: 'NPC 템플릿을 찾을 수 없습니다.' });
    return;
  }

  const info = db.prepare('INSERT INTO npc_spawns (room_id, npc_template_id) VALUES (?, ?)').run(roomId, npcTemplateId);
  const spawnId = Number(info.lastInsertRowid);

  registerNpcSpawn(spawnId, roomId, template);
  broadcastRoomSnapshot(roomId);

  res.status(201).json({ spawnId });
});

builderRouter.delete('/npc-spawns/:id', (req, res) => {
  const spawnId = Number(req.params.id);
  const row = db.prepare('SELECT room_id FROM npc_spawns WHERE id = ?').get(spawnId) as { room_id: number } | undefined;

  db.prepare('DELETE FROM npc_spawns WHERE id = ?').run(spawnId);
  despawnNpc(spawnId);
  if (row) broadcastRoomSnapshot(row.room_id);

  res.status(204).send();
});
