import { Router } from 'express';
import { z } from 'zod';
import { ELEMENT_VALUES, EQUIPMENT_SLOTS, ITEM_GRADE_VALUES } from '@mud/shared';
import { db } from '../db/client.js';
import { toItemDto, toMobTemplateDto } from '../db/dto.js';
import type { ItemRow, MobTemplateRow } from '../db/types.js';
import { requireAdmin, requireAuth } from '../auth/middleware.js';
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

adminRouter.get('/items', (_req, res) => {
  const rows = db.prepare('SELECT * FROM items ORDER BY id').all() as ItemRow[];
  res.json({ items: rows.map(toItemDto) });
});

const ITEM_TYPES = ['weapon', 'armor', 'consumable'] as const;

const itemSchema = z.object({
  name: z.string().min(1, '이름을 입력하세요.').max(30, '이름은 30자 이하여야 합니다.'),
  description: z.string().min(1, '설명을 입력하세요.').max(200, '설명은 200자 이하여야 합니다.'),
  type: z.enum(ITEM_TYPES, { message: '올바른 종류가 아닙니다.' }),
  slot: z.enum(EQUIPMENT_SLOTS as [string, ...string[]]).nullable().optional(),
  level: z.number().int().min(1, '레벨은 1 이상이어야 합니다.').default(1),
  grade: z.enum(ITEM_GRADE_VALUES as [string, ...string[]], { message: '올바른 등급이 아닙니다.' }),
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
      `INSERT INTO items (name, description, type, slot, level, grade, strength_bonus, dexterity_bonus, physical_defense_bonus, magic_defense_bonus, heal_amount, value)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      d.name,
      d.description,
      d.type,
      d.slot ?? null,
      d.level,
      d.grade,
      d.strengthBonus,
      d.dexterityBonus,
      d.physicalDefenseBonus,
      d.magicDefenseBonus,
      d.healAmount,
      d.value,
    );

  const row = db.prepare('SELECT * FROM items WHERE id = ?').get(Number(info.lastInsertRowid)) as ItemRow;
  res.status(201).json({ item: toItemDto(row) });
});

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
  level: z.number().int().min(1, '레벨은 1 이상이어야 합니다.').default(1),
  hostile: z.boolean().default(true),
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
      `INSERT INTO mob_templates (name, hp, strength, dexterity, physical_defense, magic_defense, element, damage_type, exp_reward, gold_reward, level, hostile)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      d.name,
      d.hp,
      d.strength,
      d.dexterity,
      d.physicalDefense,
      d.magicDefense,
      d.element,
      d.damageType,
      d.expReward,
      d.goldReward,
      d.level,
      d.hostile ? 1 : 0,
    );

  const row = db.prepare('SELECT * FROM mob_templates WHERE id = ?').get(Number(info.lastInsertRowid)) as MobTemplateRow;
  res.status(201).json({ mobTemplate: toMobTemplateDto(row) });
});

adminRouter.get('/mob-templates/:id/loot-pool', (req, res) => {
  const mobTemplateId = Number(req.params.id);
  const rows = db
    .prepare(
      `SELECT i.* FROM mob_loot_pool mlp JOIN items i ON i.id = mlp.item_id WHERE mlp.mob_template_id = ? ORDER BY i.id`,
    )
    .all(mobTemplateId) as ItemRow[];
  res.json({ items: rows.map(toItemDto) });
});

const lootPoolSchema = z.object({
  itemId: z.number().int(),
});

adminRouter.post('/mob-templates/:id/loot-pool', (req, res) => {
  const mobTemplateId = Number(req.params.id);
  if (!db.prepare('SELECT id FROM mob_templates WHERE id = ?').get(mobTemplateId)) {
    res.status(404).json({ error: '몬스터를 찾을 수 없습니다.' });
    return;
  }

  const parsed = lootPoolSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' });
    return;
  }

  if (!db.prepare('SELECT id FROM items WHERE id = ?').get(parsed.data.itemId)) {
    res.status(404).json({ error: '아이템을 찾을 수 없습니다.' });
    return;
  }

  db.prepare('INSERT OR IGNORE INTO mob_loot_pool (mob_template_id, item_id) VALUES (?, ?)').run(
    mobTemplateId,
    parsed.data.itemId,
  );

  const rows = db
    .prepare(
      `SELECT i.* FROM mob_loot_pool mlp JOIN items i ON i.id = mlp.item_id WHERE mlp.mob_template_id = ? ORDER BY i.id`,
    )
    .all(mobTemplateId) as ItemRow[];
  res.status(201).json({ items: rows.map(toItemDto) });
});

adminRouter.delete('/mob-templates/:id/loot-pool/:itemId', (req, res) => {
  const mobTemplateId = Number(req.params.id);
  const itemId = Number(req.params.itemId);
  db.prepare('DELETE FROM mob_loot_pool WHERE mob_template_id = ? AND item_id = ?').run(mobTemplateId, itemId);
  res.status(204).send();
});
