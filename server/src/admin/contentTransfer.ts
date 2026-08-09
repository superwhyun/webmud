import { z } from 'zod';
import { db } from '../db/client.js';
import { toItemDto, toMobTemplateDto } from '../db/dto.js';
import type { ItemRow, MobLootPoolRow, MobTemplateRow } from '../db/types.js';
import { itemSchema } from './items.js';
import { mobTemplateSchema } from './mobs.js';
import { adminRouter } from './router.js';

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
