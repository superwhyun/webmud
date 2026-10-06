import type { Router } from 'express';
import { parseBody } from '../http/validation.js';
import { mobTemplateSchema } from '../content/mobsSchema.js';
import { z } from 'zod';
import { ITEM_GRADE_DROP_WEIGHT, type ItemGrade } from '@mud/shared';
import { db } from '../db/client.js';
import { toItemDto, toMobTemplateDto } from '../db/dto.js';
import type { ItemRow, MobTemplateRow } from '../db/types.js';
import { assertBossPlacementInvariants, BossPlacementInvariantError } from '../game/bossRules.js';

interface LootPoolQueryRow extends ItemRow {
  weight: number;
}

function toLootPoolItemDto(row: LootPoolQueryRow) {
  return { ...toItemDto(row), weight: row.weight };
}

const LOOT_POOL_QUERY = `SELECT i.*, mlp.weight as weight FROM mob_loot_pool mlp JOIN items i ON i.id = mlp.item_id WHERE mlp.mob_template_id = ? ORDER BY i.id`;

interface LootPoolAllQueryRow extends LootPoolQueryRow {
  mob_template_id: number;
}

const LOOT_POOL_ALL_QUERY = `SELECT mlp.mob_template_id as mob_template_id, i.*, mlp.weight as weight
  FROM mob_loot_pool mlp JOIN items i ON i.id = mlp.item_id ORDER BY mlp.mob_template_id, mlp.weight DESC`;

const lootPoolSchema = z.object({
  itemId: z.number().int(),
  weight: z.number().int().min(1, '가중치는 1 이상이어야 합니다.').optional(),
});

export { mobTemplateBaseSchema, mobTemplateSchema, applyMobTemplateRangeChecks } from '../content/mobsSchema.js';

export function registerMobsRoutes(adminRouter: Router): void {
  adminRouter.get('/mob-templates', (_req, res) => {
    const rows = db.prepare('SELECT * FROM mob_templates ORDER BY id').all() as MobTemplateRow[];
    res.json({ mobTemplates: rows.map(toMobTemplateDto) });
  });

  adminRouter.post('/mob-templates', (req, res) => {
    const parsed = parseBody(mobTemplateSchema, req.body, res);
    if (!parsed) return;

    const d = parsed;
    const info = db
      .prepare(
        `INSERT INTO mob_templates
           (name, hp, hp_max, strength, strength_max, dexterity, dexterity_max, physical_defense, physical_defense_max,
            magic_defense, magic_defense_max, element, damage_type, exp_reward, exp_reward_max, gold_reward, gold_reward_max,
            min_level, max_level, hostile, is_boss)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
        d.isBoss ? 1 : 0,
      );

    const row = db.prepare('SELECT * FROM mob_templates WHERE id = ?').get(Number(info.lastInsertRowid)) as MobTemplateRow;
    res.status(201).json({ mobTemplate: toMobTemplateDto(row) });
  });

  adminRouter.patch('/mob-templates/:id', (req, res) => {
    const id = Number(req.params.id);
    const existing = db.prepare('SELECT id, is_boss FROM mob_templates WHERE id = ?').get(id) as
      | { id: number; is_boss: number }
      | undefined;
    if (!existing) {
      res.status(404).json({ error: '몬스터를 찾을 수 없습니다.' });
      return;
    }

    const parsed = parseBody(mobTemplateSchema, req.body, res);
    if (!parsed) return;

    const d = parsed;
    if (Boolean(existing.is_boss) !== d.isBoss) {
      const usage = db
        .prepare(
          `SELECT
             (SELECT COUNT(*) FROM mob_spawns WHERE mob_template_id = ?) +
             (SELECT COUNT(*) FROM village_garrison WHERE mob_template_id = ?) as count`,
        )
        .get(id, id) as { count: number };
      if (usage.count > 0) {
        res.status(409).json({ error: '배치 중인 몬스터의 보스 여부는 바꿀 수 없습니다. 먼저 배치를 제거하세요.' });
        return;
      }
    }
    try {
      db.transaction(() => {
        db.prepare(
          `UPDATE mob_templates SET name = ?, hp = ?, hp_max = ?, strength = ?, strength_max = ?, dexterity = ?, dexterity_max = ?,
             physical_defense = ?, physical_defense_max = ?, magic_defense = ?, magic_defense_max = ?,
             element = ?, damage_type = ?, exp_reward = ?, exp_reward_max = ?, gold_reward = ?, gold_reward_max = ?,
             min_level = ?, max_level = ?, hostile = ?, is_boss = ?
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
          d.isBoss ? 1 : 0,
          id,
        );
        assertBossPlacementInvariants();
      })();
    } catch (error) {
      if (error instanceof BossPlacementInvariantError) {
        res.status(409).json({ error: error.message });
        return;
      }
      throw error;
    }

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

  adminRouter.get('/mob-templates/:id/loot-pool', (req, res) => {
    const mobTemplateId = Number(req.params.id);
    const rows = db.prepare(LOOT_POOL_QUERY).all(mobTemplateId) as LootPoolQueryRow[];
    res.json({ items: rows.map(toLootPoolItemDto) });
  });

  adminRouter.get('/mob-loot-pool', (_req, res) => {
    const rows = db.prepare(LOOT_POOL_ALL_QUERY).all() as LootPoolAllQueryRow[];
    res.json({ items: rows.map((row) => ({ ...toLootPoolItemDto(row), mobTemplateId: row.mob_template_id })) });
  });

  adminRouter.post('/mob-templates/:id/loot-pool', (req, res) => {
    const mobTemplateId = Number(req.params.id);
    if (!db.prepare('SELECT id FROM mob_templates WHERE id = ?').get(mobTemplateId)) {
      res.status(404).json({ error: '몬스터를 찾을 수 없습니다.' });
      return;
    }

    const parsed = parseBody(lootPoolSchema, req.body, res);
    if (!parsed) return;

    const item = db.prepare('SELECT grade FROM items WHERE id = ?').get(parsed.itemId) as
      | { grade: ItemGrade }
      | undefined;
    if (!item) {
      res.status(404).json({ error: '아이템을 찾을 수 없습니다.' });
      return;
    }

    const weight = parsed.weight ?? ITEM_GRADE_DROP_WEIGHT[item.grade];
    db.prepare(
      `INSERT INTO mob_loot_pool (mob_template_id, item_id, weight) VALUES (?, ?, ?)
       ON CONFLICT(mob_template_id, item_id) DO UPDATE SET weight = excluded.weight`,
    ).run(mobTemplateId, parsed.itemId, weight);

    const rows = db.prepare(LOOT_POOL_QUERY).all(mobTemplateId) as LootPoolQueryRow[];
    res.status(201).json({ items: rows.map(toLootPoolItemDto) });
  });

  adminRouter.delete('/mob-templates/:id/loot-pool/:itemId', (req, res) => {
    const mobTemplateId = Number(req.params.id);
    const itemId = Number(req.params.itemId);
    db.prepare('DELETE FROM mob_loot_pool WHERE mob_template_id = ? AND item_id = ?').run(mobTemplateId, itemId);
    res.status(204).send();
  });
}
