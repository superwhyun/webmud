import { Router } from 'express';
import { z } from 'zod';
import {
  ELEMENT_VALUES,
  EQUIPMENT_SLOTS,
  ITEM_GRADE_DROP_WEIGHT,
  ITEM_GRADE_VALUES,
  NPC_DEAL_TYPE_VALUES,
  NPC_TYPE_VALUES,
  type ItemGrade,
} from '@mud/shared';
import { db } from '../db/client.js';
import { toItemDto, toMobTemplateDto, toNpcTemplateDto } from '../db/dto.js';
import type { ItemRow, MobLootPoolRow, MobTemplateRow, NpcTemplateRow } from '../db/types.js';
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
  attackPowerBonus: z.number().int().default(0),
  intelligenceBonus: z.number().int().default(0),
  physicalDefenseBonus: z.number().int().default(0),
  magicDefenseBonus: z.number().int().default(0),
  healAmount: z.number().int().min(0).default(0),
  manaAmount: z.number().int().min(0).default(0),
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
      `INSERT INTO items (name, description, type, slot, level, grade, strength_bonus, dexterity_bonus, attack_power_bonus, intelligence_bonus, physical_defense_bonus, magic_defense_bonus, heal_amount, mana_amount, value)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
      d.attackPowerBonus,
      d.intelligenceBonus,
      d.physicalDefenseBonus,
      d.magicDefenseBonus,
      d.healAmount,
      d.manaAmount,
      d.value,
    );

  const row = db.prepare('SELECT * FROM items WHERE id = ?').get(Number(info.lastInsertRowid)) as ItemRow;
  res.status(201).json({ item: toItemDto(row) });
});

adminRouter.patch('/items/:id', (req, res) => {
  const id = Number(req.params.id);
  if (!db.prepare('SELECT id FROM items WHERE id = ?').get(id)) {
    res.status(404).json({ error: '아이템을 찾을 수 없습니다.' });
    return;
  }

  const parsed = itemSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' });
    return;
  }

  const d = parsed.data;
  db.prepare(
    `UPDATE items SET name = ?, description = ?, type = ?, slot = ?, level = ?, grade = ?,
       strength_bonus = ?, dexterity_bonus = ?, attack_power_bonus = ?, intelligence_bonus = ?, physical_defense_bonus = ?, magic_defense_bonus = ?,
       heal_amount = ?, mana_amount = ?, value = ?
     WHERE id = ?`,
  ).run(
    d.name,
    d.description,
    d.type,
    d.slot ?? null,
    d.level,
    d.grade,
    d.strengthBonus,
    d.dexterityBonus,
    d.attackPowerBonus,
    d.intelligenceBonus,
    d.physicalDefenseBonus,
    d.magicDefenseBonus,
    d.healAmount,
    d.manaAmount,
    d.value,
    id,
  );

  const row = db.prepare('SELECT * FROM items WHERE id = ?').get(id) as ItemRow;
  res.json({ item: toItemDto(row) });
});

adminRouter.delete('/items/:id', (req, res) => {
  const id = Number(req.params.id);
  if (!db.prepare('SELECT id FROM items WHERE id = ?').get(id)) {
    res.status(404).json({ error: '아이템을 찾을 수 없습니다.' });
    return;
  }

  const inUse = db
    .prepare(
      `SELECT
         (SELECT COUNT(*) FROM inventory_items WHERE item_id = ?) +
         (SELECT COUNT(*) FROM room_items WHERE item_id = ?) as count`,
    )
    .get(id, id) as { count: number };
  if (inUse.count > 0) {
    res.status(409).json({ error: '이미 캐릭터가 소지했거나 방에 놓여 있는 아이템은 삭제할 수 없습니다.' });
    return;
  }

  db.prepare('DELETE FROM mob_loot_pool WHERE item_id = ?').run(id);
  db.prepare('DELETE FROM items WHERE id = ?').run(id);
  res.status(204).send();
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

adminRouter.patch('/mob-templates/:id', (req, res) => {
  const id = Number(req.params.id);
  if (!db.prepare('SELECT id FROM mob_templates WHERE id = ?').get(id)) {
    res.status(404).json({ error: '몬스터를 찾을 수 없습니다.' });
    return;
  }

  const parsed = mobTemplateSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' });
    return;
  }

  const d = parsed.data;
  db.prepare(
    `UPDATE mob_templates SET name = ?, hp = ?, strength = ?, dexterity = ?, physical_defense = ?, magic_defense = ?,
       element = ?, damage_type = ?, exp_reward = ?, gold_reward = ?, level = ?, hostile = ?
     WHERE id = ?`,
  ).run(
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
    id,
  );

  const row = db.prepare('SELECT * FROM mob_templates WHERE id = ?').get(id) as MobTemplateRow;
  res.json({ mobTemplate: toMobTemplateDto(row) });
});

adminRouter.delete('/mob-templates/:id', (req, res) => {
  const id = Number(req.params.id);
  if (!db.prepare('SELECT id FROM mob_templates WHERE id = ?').get(id)) {
    res.status(404).json({ error: '몬스터를 찾을 수 없습니다.' });
    return;
  }

  const inUse = db
    .prepare(
      `SELECT
         (SELECT COUNT(*) FROM mob_spawns WHERE mob_template_id = ?) +
         (SELECT COUNT(*) FROM village_garrison WHERE mob_template_id = ?) as count`,
    )
    .get(id, id) as { count: number };
  if (inUse.count > 0) {
    res.status(409).json({ error: '맵에 배치되었거나 마을 수비대로 쓰이는 몬스터는 삭제할 수 없습니다. 먼저 배치를 제거하세요.' });
    return;
  }

  db.prepare('DELETE FROM mob_loot_pool WHERE mob_template_id = ?').run(id);
  db.prepare('DELETE FROM mob_templates WHERE id = ?').run(id);
  res.status(204).send();
});

interface LootPoolQueryRow extends ItemRow {
  weight: number;
}

function toLootPoolItemDto(row: LootPoolQueryRow) {
  return { ...toItemDto(row), weight: row.weight };
}

const LOOT_POOL_QUERY = `SELECT i.*, mlp.weight as weight FROM mob_loot_pool mlp JOIN items i ON i.id = mlp.item_id WHERE mlp.mob_template_id = ? ORDER BY i.id`;

adminRouter.get('/mob-templates/:id/loot-pool', (req, res) => {
  const mobTemplateId = Number(req.params.id);
  const rows = db.prepare(LOOT_POOL_QUERY).all(mobTemplateId) as LootPoolQueryRow[];
  res.json({ items: rows.map(toLootPoolItemDto) });
});

const lootPoolSchema = z.object({
  itemId: z.number().int(),
  weight: z.number().int().min(1, '가중치는 1 이상이어야 합니다.').optional(),
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

  const item = db.prepare('SELECT grade FROM items WHERE id = ?').get(parsed.data.itemId) as
    | { grade: ItemGrade }
    | undefined;
  if (!item) {
    res.status(404).json({ error: '아이템을 찾을 수 없습니다.' });
    return;
  }

  const weight = parsed.data.weight ?? ITEM_GRADE_DROP_WEIGHT[item.grade];
  db.prepare(
    `INSERT INTO mob_loot_pool (mob_template_id, item_id, weight) VALUES (?, ?, ?)
     ON CONFLICT(mob_template_id, item_id) DO UPDATE SET weight = excluded.weight`,
  ).run(mobTemplateId, parsed.data.itemId, weight);

  const rows = db.prepare(LOOT_POOL_QUERY).all(mobTemplateId) as LootPoolQueryRow[];
  res.status(201).json({ items: rows.map(toLootPoolItemDto) });
});

adminRouter.delete('/mob-templates/:id/loot-pool/:itemId', (req, res) => {
  const mobTemplateId = Number(req.params.id);
  const itemId = Number(req.params.itemId);
  db.prepare('DELETE FROM mob_loot_pool WHERE mob_template_id = ? AND item_id = ?').run(mobTemplateId, itemId);
  res.status(204).send();
});

/**
 * 관리자 화면에서 만든 아이템/몹/드랍풀은 seed.ts(코드)가 아니라 DB에만 존재한다.
 * DB를 재설치/초기화하면 사라지므로, 내보내기 파일을 저장해두었다가 새 DB에 가져오기 하면
 * 그 상태를 복원할 수 있다.
 */
adminRouter.get('/content-export', (_req, res) => {
  const items = db.prepare('SELECT * FROM items ORDER BY id').all() as ItemRow[];
  const mobTemplates = db.prepare('SELECT * FROM mob_templates ORDER BY id').all() as MobTemplateRow[];
  const mobLootPool = db
    .prepare('SELECT mob_template_id, item_id, weight FROM mob_loot_pool ORDER BY mob_template_id, item_id')
    .all() as MobLootPoolRow[];

  res.json({
    exportedAt: new Date().toISOString(),
    items: items.map(toItemDto),
    mobTemplates: mobTemplates.map(toMobTemplateDto),
    mobLootPool: mobLootPool.map((row) => ({
      mobTemplateId: row.mob_template_id,
      itemId: row.item_id,
      weight: row.weight,
    })),
  });
});

const importItemSchema = itemSchema.extend({ id: z.number().int().positive() });
const importMobTemplateSchema = mobTemplateSchema.extend({ id: z.number().int().positive() });
const importLootEntrySchema = z.object({
  mobTemplateId: z.number().int().positive(),
  itemId: z.number().int().positive(),
  weight: z.number().int().min(1),
});

const contentImportSchema = z.object({
  items: z.array(importItemSchema).default([]),
  mobTemplates: z.array(importMobTemplateSchema).default([]),
  mobLootPool: z.array(importLootEntrySchema).default([]),
});

adminRouter.post('/content-import', (req, res) => {
  const parsed = contentImportSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? '가져오기 파일 형식이 올바르지 않습니다.' });
    return;
  }
  const d = parsed.data;

  const upsertItem = db.prepare(
    `INSERT INTO items (id, name, description, type, slot, level, grade, strength_bonus, dexterity_bonus, attack_power_bonus, intelligence_bonus, physical_defense_bonus, magic_defense_bonus, heal_amount, mana_amount, value)
     VALUES (@id, @name, @description, @type, @slot, @level, @grade, @strengthBonus, @dexterityBonus, @attackPowerBonus, @intelligenceBonus, @physicalDefenseBonus, @magicDefenseBonus, @healAmount, @manaAmount, @value)
     ON CONFLICT(id) DO UPDATE SET
       name = excluded.name, description = excluded.description, type = excluded.type, slot = excluded.slot,
       level = excluded.level, grade = excluded.grade, strength_bonus = excluded.strength_bonus,
       dexterity_bonus = excluded.dexterity_bonus, attack_power_bonus = excluded.attack_power_bonus,
       intelligence_bonus = excluded.intelligence_bonus, physical_defense_bonus = excluded.physical_defense_bonus,
       magic_defense_bonus = excluded.magic_defense_bonus, heal_amount = excluded.heal_amount,
       mana_amount = excluded.mana_amount, value = excluded.value`,
  );

  const upsertMobTemplate = db.prepare(
    `INSERT INTO mob_templates (id, name, hp, strength, dexterity, physical_defense, magic_defense, element, damage_type, exp_reward, gold_reward, level, hostile)
     VALUES (@id, @name, @hp, @strength, @dexterity, @physicalDefense, @magicDefense, @element, @damageType, @expReward, @goldReward, @level, @hostile)
     ON CONFLICT(id) DO UPDATE SET
       name = excluded.name, hp = excluded.hp, strength = excluded.strength, dexterity = excluded.dexterity,
       physical_defense = excluded.physical_defense, magic_defense = excluded.magic_defense, element = excluded.element,
       damage_type = excluded.damage_type, exp_reward = excluded.exp_reward, gold_reward = excluded.gold_reward,
       level = excluded.level, hostile = excluded.hostile`,
  );

  const upsertLootEntry = db.prepare(
    `INSERT INTO mob_loot_pool (mob_template_id, item_id, weight) VALUES (?, ?, ?)
     ON CONFLICT(mob_template_id, item_id) DO UPDATE SET weight = excluded.weight`,
  );

  const importTx = db.transaction(() => {
    for (const item of d.items) {
      upsertItem.run({ ...item, slot: item.slot ?? null });
    }
    for (const mob of d.mobTemplates) {
      upsertMobTemplate.run({ ...mob, hostile: mob.hostile ? 1 : 0 });
    }
    for (const entry of d.mobLootPool) {
      upsertLootEntry.run(entry.mobTemplateId, entry.itemId, entry.weight);
    }
  });
  importTx();

  res.json({ itemCount: d.items.length, mobTemplateCount: d.mobTemplates.length, lootEntryCount: d.mobLootPool.length });
});

adminRouter.get('/npc-templates', (_req, res) => {
  const rows = db.prepare('SELECT * FROM npc_templates ORDER BY id').all() as NpcTemplateRow[];
  res.json({ npcTemplates: rows.map(toNpcTemplateDto) });
});

const npcTemplateSchema = z.object({
  name: z.string().min(1, '이름을 입력하세요.').max(30, '이름은 30자 이하여야 합니다.'),
  description: z.string().min(1, '설명을 입력하세요.').max(200, '설명은 200자 이하여야 합니다.'),
  type: z.enum(NPC_TYPE_VALUES as [string, ...string[]], { message: '올바른 종류가 아닙니다.' }),
  level: z.number().int().min(1, '레벨은 1 이상이어야 합니다.').default(1),
  dealType: z.enum(NPC_DEAL_TYPE_VALUES as [string, ...string[]], { message: '올바른 취급 품목이 아닙니다.' }),
});

adminRouter.post('/npc-templates', (req, res) => {
  const parsed = npcTemplateSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' });
    return;
  }

  const d = parsed.data;
  const info = db
    .prepare('INSERT INTO npc_templates (name, description, type, level, deal_type) VALUES (?, ?, ?, ?, ?)')
    .run(d.name, d.description, d.type, d.level, d.dealType);

  const row = db.prepare('SELECT * FROM npc_templates WHERE id = ?').get(Number(info.lastInsertRowid)) as NpcTemplateRow;
  res.status(201).json({ npcTemplate: toNpcTemplateDto(row) });
});

adminRouter.patch('/npc-templates/:id', (req, res) => {
  const id = Number(req.params.id);
  if (!db.prepare('SELECT id FROM npc_templates WHERE id = ?').get(id)) {
    res.status(404).json({ error: 'NPC를 찾을 수 없습니다.' });
    return;
  }

  const parsed = npcTemplateSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' });
    return;
  }

  const d = parsed.data;
  db.prepare('UPDATE npc_templates SET name = ?, description = ?, type = ?, level = ?, deal_type = ? WHERE id = ?').run(
    d.name,
    d.description,
    d.type,
    d.level,
    d.dealType,
    id,
  );

  const row = db.prepare('SELECT * FROM npc_templates WHERE id = ?').get(id) as NpcTemplateRow;
  res.json({ npcTemplate: toNpcTemplateDto(row) });
});

adminRouter.delete('/npc-templates/:id', (req, res) => {
  const id = Number(req.params.id);
  if (!db.prepare('SELECT id FROM npc_templates WHERE id = ?').get(id)) {
    res.status(404).json({ error: 'NPC를 찾을 수 없습니다.' });
    return;
  }

  const inUse = db.prepare('SELECT COUNT(*) as count FROM npc_spawns WHERE npc_template_id = ?').get(id) as {
    count: number;
  };
  if (inUse.count > 0) {
    res.status(409).json({ error: '맵에 배치된 NPC는 삭제할 수 없습니다. 먼저 배치를 제거하세요.' });
    return;
  }

  db.prepare('DELETE FROM npc_templates WHERE id = ?').run(id);
  res.status(204).send();
});
