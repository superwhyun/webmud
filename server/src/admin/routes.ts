import { Router } from 'express';
import { z } from 'zod';
import { ELEMENT_VALUES } from '@mud/shared';
import { db } from '../db/client.js';
import type { ItemRow, MobTemplateRow } from '../db/types.js';
import { requireAdmin, requireAuth } from '../auth/middleware.js';
import { despawnMob, registerMobSpawn } from '../game/MobManager.js';
import { broadcastRoomSnapshot } from '../game/roomSnapshot.js';
import { getAllSessions, getSessionByCharacterName } from '../game/sessionRegistry.js';
import { getRoom } from '../game/World.js';
import { send } from '../game/wsUtil.js';
import { forceMoveSession, kickSession } from './moderation.js';

export const adminRouter = Router();

adminRouter.use(requireAuth, requireAdmin);

interface AccountRow {
  id: number;
  username: string;
  is_builder: number;
  is_admin: number;
}

function toAccountDto(row: AccountRow) {
  return { id: row.id, username: row.username, isBuilder: Boolean(row.is_builder), isAdmin: Boolean(row.is_admin) };
}

adminRouter.get('/accounts', (_req, res) => {
  const rows = db.prepare('SELECT id, username, is_builder, is_admin FROM accounts ORDER BY username').all() as AccountRow[];
  res.json({ accounts: rows.map(toAccountDto) });
});

const accountPatchSchema = z.object({
  isBuilder: z.boolean().optional(),
  isAdmin: z.boolean().optional(),
});

adminRouter.patch('/accounts/:id', (req, res) => {
  const id = Number(req.params.id);
  if (!db.prepare('SELECT id FROM accounts WHERE id = ?').get(id)) {
    res.status(404).json({ error: '계정을 찾을 수 없습니다.' });
    return;
  }

  const parsed = accountPatchSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' });
    return;
  }

  const { isBuilder, isAdmin } = parsed.data;
  if (isBuilder === undefined && isAdmin === undefined) {
    res.status(400).json({ error: '수정할 내용이 없습니다.' });
    return;
  }

  const fields: string[] = [];
  const values: number[] = [];
  if (isBuilder !== undefined) {
    fields.push('is_builder = ?');
    values.push(isBuilder ? 1 : 0);
  }
  if (isAdmin !== undefined) {
    fields.push('is_admin = ?');
    values.push(isAdmin ? 1 : 0);
  }
  values.push(id);

  db.prepare(`UPDATE accounts SET ${fields.join(', ')} WHERE id = ?`).run(...values);
  const row = db.prepare('SELECT id, username, is_builder, is_admin FROM accounts WHERE id = ?').get(id) as AccountRow;
  res.json({ account: toAccountDto(row) });
});

adminRouter.get('/sessions', (_req, res) => {
  const sessions = getAllSessions().map((session) => ({
    characterName: session.characterName,
    roomId: session.roomId,
    roomName: getRoom(session.roomId)?.name ?? '?',
  }));
  res.json({ sessions });
});

const moveSchema = z.object({
  characterName: z.string().min(1, '캐릭터 이름을 입력하세요.'),
  targetRoomId: z.number().int(),
});

adminRouter.post('/moderation/move', (req, res) => {
  const parsed = moveSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' });
    return;
  }

  const session = getSessionByCharacterName(parsed.data.characterName);
  if (!session) {
    res.status(404).json({ error: '온라인 상태가 아닙니다.' });
    return;
  }

  const result = forceMoveSession(session, parsed.data.targetRoomId);
  if (!result.ok) {
    res.status(409).json({ error: result.error });
    return;
  }

  res.status(204).send();
});

const kickSchema = z.object({
  characterName: z.string().min(1, '캐릭터 이름을 입력하세요.'),
  reason: z.string().max(200).optional(),
});

adminRouter.post('/moderation/kick', (req, res) => {
  const parsed = kickSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' });
    return;
  }

  const session = getSessionByCharacterName(parsed.data.characterName);
  if (!session) {
    res.status(404).json({ error: '온라인 상태가 아닙니다.' });
    return;
  }

  kickSession(session, parsed.data.reason);
  res.status(204).send();
});

const announceSchema = z.object({
  message: z.string().min(1, '메시지를 입력하세요.').max(500, '메시지는 500자 이하여야 합니다.'),
});

adminRouter.post('/announce', (req, res) => {
  const parsed = announceSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' });
    return;
  }

  for (const session of getAllSessions()) {
    send(session.ws, { type: 'text', text: `[공지] ${parsed.data.message}`, channel: 'admin' });
  }
  res.status(204).send();
});

adminRouter.get('/rooms', (_req, res) => {
  const rows = db.prepare('SELECT id, name FROM rooms ORDER BY id').all() as { id: number; name: string }[];
  res.json({ rooms: rows });
});

function toItemDto(row: ItemRow) {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    type: row.type,
    strengthBonus: row.strength_bonus,
    dexterityBonus: row.dexterity_bonus,
    physicalDefenseBonus: row.physical_defense_bonus,
    magicDefenseBonus: row.magic_defense_bonus,
    healAmount: row.heal_amount,
    value: row.value,
  };
}

adminRouter.get('/items', (_req, res) => {
  const rows = db.prepare('SELECT * FROM items ORDER BY id').all() as ItemRow[];
  res.json({ items: rows.map(toItemDto) });
});

const ITEM_TYPES = ['weapon', 'armor', 'consumable'] as const;

const itemSchema = z.object({
  name: z.string().min(1, '이름을 입력하세요.').max(30, '이름은 30자 이하여야 합니다.'),
  description: z.string().min(1, '설명을 입력하세요.').max(200, '설명은 200자 이하여야 합니다.'),
  type: z.enum(ITEM_TYPES, { message: '올바른 종류가 아닙니다.' }),
  strengthBonus: z.number().int().default(0),
  dexterityBonus: z.number().int().default(0),
  physicalDefenseBonus: z.number().int().default(0),
  magicDefenseBonus: z.number().int().default(0),
  healAmount: z.number().int().min(0).default(0),
  value: z.number().int().min(0).default(0),
});

adminRouter.post('/items', (req, res) => {
  const parsed = itemSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' });
    return;
  }

  const d = parsed.data;
  const info = db
    .prepare(
      `INSERT INTO items (name, description, type, strength_bonus, dexterity_bonus, physical_defense_bonus, magic_defense_bonus, heal_amount, value)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(d.name, d.description, d.type, d.strengthBonus, d.dexterityBonus, d.physicalDefenseBonus, d.magicDefenseBonus, d.healAmount, d.value);

  const row = db.prepare('SELECT * FROM items WHERE id = ?').get(Number(info.lastInsertRowid)) as ItemRow;
  res.status(201).json({ item: toItemDto(row) });
});

adminRouter.get('/room-items', (_req, res) => {
  const rows = db
    .prepare(
      `SELECT ri.id, ri.room_id, ri.item_id, ri.quantity, r.name as room_name, i.name as item_name
       FROM room_items ri JOIN rooms r ON r.id = ri.room_id JOIN items i ON i.id = ri.item_id
       ORDER BY ri.id`,
    )
    .all() as { id: number; room_id: number; item_id: number; quantity: number; room_name: string; item_name: string }[];

  res.json({
    roomItems: rows.map((row) => ({
      id: row.id,
      roomId: row.room_id,
      roomName: row.room_name,
      itemId: row.item_id,
      itemName: row.item_name,
      quantity: row.quantity,
    })),
  });
});

const roomItemSchema = z.object({
  roomId: z.number().int(),
  itemId: z.number().int(),
  quantity: z.number().int().min(1).default(1),
});

adminRouter.post('/room-items', (req, res) => {
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

adminRouter.delete('/room-items', (req, res) => {
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

function toMobTemplateDto(row: MobTemplateRow) {
  return {
    id: row.id,
    name: row.name,
    hp: row.hp,
    strength: row.strength,
    dexterity: row.dexterity,
    physicalDefense: row.physical_defense,
    magicDefense: row.magic_defense,
    element: row.element,
    damageType: row.damage_type,
    expReward: row.exp_reward,
    goldReward: row.gold_reward,
  };
}

adminRouter.get('/mob-templates', (_req, res) => {
  const rows = db.prepare('SELECT * FROM mob_templates ORDER BY id').all() as MobTemplateRow[];
  res.json({ mobTemplates: rows.map(toMobTemplateDto) });
});

const DAMAGE_TYPES = ['physical', 'magic'] as const;

const mobTemplateSchema = z.object({
  name: z.string().min(1, '이름을 입력하세요.').max(30, '이름은 30자 이하여야 합니다.'),
  hp: z.number().int().min(1),
  strength: z.number().int().min(0),
  dexterity: z.number().int().min(0),
  physicalDefense: z.number().int().min(0),
  magicDefense: z.number().int().min(0),
  element: z.enum(ELEMENT_VALUES as [string, ...string[]], { message: '속성을 선택해주세요.' }),
  damageType: z.enum(DAMAGE_TYPES, { message: '올바른 피해 유형이 아닙니다.' }),
  expReward: z.number().int().min(0),
  goldReward: z.number().int().min(0),
});

adminRouter.post('/mob-templates', (req, res) => {
  const parsed = mobTemplateSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' });
    return;
  }

  const d = parsed.data;
  const info = db
    .prepare(
      `INSERT INTO mob_templates (name, hp, strength, dexterity, physical_defense, magic_defense, element, damage_type, exp_reward, gold_reward)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(d.name, d.hp, d.strength, d.dexterity, d.physicalDefense, d.magicDefense, d.element, d.damageType, d.expReward, d.goldReward);

  const row = db.prepare('SELECT * FROM mob_templates WHERE id = ?').get(Number(info.lastInsertRowid)) as MobTemplateRow;
  res.status(201).json({ mobTemplate: toMobTemplateDto(row) });
});

adminRouter.get('/mob-spawns', (_req, res) => {
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

adminRouter.post('/mob-spawns', (req, res) => {
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

adminRouter.delete('/mob-spawns/:id', (req, res) => {
  const spawnId = Number(req.params.id);
  const row = db.prepare('SELECT room_id FROM mob_spawns WHERE id = ?').get(spawnId) as { room_id: number } | undefined;

  db.prepare('DELETE FROM mob_spawns WHERE id = ?').run(spawnId);
  despawnMob(spawnId);
  if (row) broadcastRoomSnapshot(row.room_id);

  res.status(204).send();
});
