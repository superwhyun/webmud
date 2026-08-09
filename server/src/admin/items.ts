import { z } from 'zod';
import { EQUIPMENT_SLOTS, ITEM_GRADE_VALUES } from '@mud/shared';
import { db } from '../db/client.js';
import { toItemDto } from '../db/dto.js';
import type { ItemRow } from '../db/types.js';
import { adminRouter } from './router.js';

adminRouter.get('/items', (_req, res) => {
  const rows = db.prepare('SELECT * FROM items ORDER BY id').all() as ItemRow[];
  res.json({ items: rows.map(toItemDto) });
});

const ITEM_TYPES = ['weapon', 'armor', 'consumable'] as const;

export const itemSchema = z.object({
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
