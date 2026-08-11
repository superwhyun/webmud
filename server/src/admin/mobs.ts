import { z } from 'zod';
import { ELEMENT_VALUES, ITEM_GRADE_DROP_WEIGHT, type ItemGrade } from '@mud/shared';
import { db } from '../db/client.js';
import { toItemDto, toMobTemplateDto } from '../db/dto.js';
import type { ItemRow, MobTemplateRow } from '../db/types.js';
import { adminRouter } from './router.js';

adminRouter.get('/mob-templates', (_req, res) => {
  const rows = db.prepare('SELECT * FROM mob_templates ORDER BY id').all() as MobTemplateRow[];
  res.json({ mobTemplates: rows.map(toMobTemplateDto) });
});

const DAMAGE_TYPES = ['physical', 'magic'] as const;

export const mobTemplateBaseSchema = z.object({
  name: z.string().min(1, '이름을 입력하세요.').max(30, '이름은 30자 이하여야 합니다.'),
  hp: z.number().int().min(1),
  hpMax: z.number().int().min(1),
  strength: z.number().int().min(0),
  strengthMax: z.number().int().min(0),
  dexterity: z.number().int().min(0),
  dexterityMax: z.number().int().min(0),
  physicalDefense: z.number().int().min(0),
  physicalDefenseMax: z.number().int().min(0),
  magicDefense: z.number().int().min(0),
  magicDefenseMax: z.number().int().min(0),
  element: z.enum(ELEMENT_VALUES as [string, ...string[]], { message: '속성을 선택해주세요.' }),
  damageType: z.enum(DAMAGE_TYPES, { message: '올바른 피해 유형이 아닙니다.' }),
  expReward: z.number().int().min(0),
  expRewardMax: z.number().int().min(0),
  goldReward: z.number().int().min(0),
  goldRewardMax: z.number().int().min(0),
  minLevel: z.number().int().min(1, '최소 레벨은 1 이상이어야 합니다.').default(1),
  maxLevel: z.number().int().min(1, '최대 레벨은 1 이상이어야 합니다.').default(1),
  hostile: z.boolean().default(true),
});

interface MobTemplateRangeFields {
  minLevel: number;
  maxLevel: number;
  hp: number;
  hpMax: number;
  strength: number;
  strengthMax: number;
  dexterity: number;
  dexterityMax: number;
  physicalDefense: number;
  physicalDefenseMax: number;
  magicDefense: number;
  magicDefenseMax: number;
  expReward: number;
  expRewardMax: number;
  goldReward: number;
  goldRewardMax: number;
}

/** min~max 필드 쌍마다 "최대값은 최소값 이상"을 검증한다. mobTemplateBaseSchema와 그 extend본 모두에 재사용한다. */
export function applyMobTemplateRangeChecks<Schema extends z.ZodType<MobTemplateRangeFields>>(schema: Schema) {
  return schema
    .refine((d) => d.maxLevel >= d.minLevel, { message: '최대 레벨은 최소 레벨 이상이어야 합니다.', path: ['maxLevel'] })
    .refine((d) => d.hpMax >= d.hp, { message: '최대 HP는 최소 HP 이상이어야 합니다.', path: ['hpMax'] })
    .refine((d) => d.strengthMax >= d.strength, { message: '최대 힘은 최소 힘 이상이어야 합니다.', path: ['strengthMax'] })
    .refine((d) => d.dexterityMax >= d.dexterity, { message: '최대 민첩은 최소 민첩 이상이어야 합니다.', path: ['dexterityMax'] })
    .refine((d) => d.physicalDefenseMax >= d.physicalDefense, {
      message: '최대 물리방어는 최소 물리방어 이상이어야 합니다.',
      path: ['physicalDefenseMax'],
    })
    .refine((d) => d.magicDefenseMax >= d.magicDefense, {
      message: '최대 마법방어는 최소 마법방어 이상이어야 합니다.',
      path: ['magicDefenseMax'],
    })
    .refine((d) => d.expRewardMax >= d.expReward, { message: '최대 경험치는 최소 경험치 이상이어야 합니다.', path: ['expRewardMax'] })
    .refine((d) => d.goldRewardMax >= d.goldReward, { message: '최대 골드는 최소 골드 이상이어야 합니다.', path: ['goldRewardMax'] });
}

export const mobTemplateSchema = applyMobTemplateRangeChecks(mobTemplateBaseSchema);

adminRouter.post('/mob-templates', (req, res) => {
  const parsed = mobTemplateSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' });
    return;
  }

  const d = parsed.data;
  const info = db
    .prepare(
      `INSERT INTO mob_templates
         (name, hp, hp_max, strength, strength_max, dexterity, dexterity_max, physical_defense, physical_defense_max,
          magic_defense, magic_defense_max, element, damage_type, exp_reward, exp_reward_max, gold_reward, gold_reward_max,
          min_level, max_level, hostile)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      d.name,
      d.hp,
      d.hpMax,
      d.strength,
      d.strengthMax,
      d.dexterity,
      d.dexterityMax,
      d.physicalDefense,
      d.physicalDefenseMax,
      d.magicDefense,
      d.magicDefenseMax,
      d.element,
      d.damageType,
      d.expReward,
      d.expRewardMax,
      d.goldReward,
      d.goldRewardMax,
      d.minLevel,
      d.maxLevel,
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
    `UPDATE mob_templates SET name = ?, hp = ?, hp_max = ?, strength = ?, strength_max = ?, dexterity = ?, dexterity_max = ?,
       physical_defense = ?, physical_defense_max = ?, magic_defense = ?, magic_defense_max = ?,
       element = ?, damage_type = ?, exp_reward = ?, exp_reward_max = ?, gold_reward = ?, gold_reward_max = ?,
       min_level = ?, max_level = ?, hostile = ?
     WHERE id = ?`,
  ).run(
    d.name,
    d.hp,
    d.hpMax,
    d.strength,
    d.strengthMax,
    d.dexterity,
    d.dexterityMax,
    d.physicalDefense,
    d.physicalDefenseMax,
    d.magicDefense,
    d.magicDefenseMax,
    d.element,
    d.damageType,
    d.expReward,
    d.expRewardMax,
    d.goldReward,
    d.goldRewardMax,
    d.minLevel,
    d.maxLevel,
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

interface LootPoolAllQueryRow extends LootPoolQueryRow {
  mob_template_id: number;
}

const LOOT_POOL_ALL_QUERY = `SELECT mlp.mob_template_id as mob_template_id, i.*, mlp.weight as weight
  FROM mob_loot_pool mlp JOIN items i ON i.id = mlp.item_id ORDER BY mlp.mob_template_id, mlp.weight DESC`;

adminRouter.get('/mob-loot-pool', (_req, res) => {
  const rows = db.prepare(LOOT_POOL_ALL_QUERY).all() as LootPoolAllQueryRow[];
  res.json({ items: rows.map((row) => ({ ...toLootPoolItemDto(row), mobTemplateId: row.mob_template_id })) });
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
