import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '../db/client.js';
import type { MobTemplateRow } from '../db/types.js';
import { despawnMob, registerMobSpawn, rollMobLoot, tickRespawns } from './MobManager.js';

// 시드 데이터: 몹 템플릿 1(쥐), 아이템 1(낡은 검, 등급 low).
const TEST_MOB_TEMPLATE_ID = 1;
const TEST_ITEM_ID = 1;

beforeEach(() => {
  db.prepare('DELETE FROM mob_loot_pool WHERE mob_template_id = ?').run(TEST_MOB_TEMPLATE_ID);
});

afterEach(() => {
  vi.restoreAllMocks();
  db.prepare('DELETE FROM mob_loot_pool WHERE mob_template_id = ?').run(TEST_MOB_TEMPLATE_ID);
});

describe('rollMobLoot', () => {
  it('excludes items above the actual boss level even when its template spans higher levels', () => {
    const highItem = db.prepare('SELECT id FROM items WHERE level > 20 LIMIT 1').get() as { id: number };
    const insert = db.prepare('INSERT INTO mob_loot_pool (mob_template_id, item_id, weight) VALUES (?, ?, 100)');
    insert.run(TEST_MOB_TEMPLATE_ID, TEST_ITEM_ID);
    insert.run(TEST_MOB_TEMPLATE_ID, highItem.id);
    expect(rollMobLoot(TEST_MOB_TEMPLATE_ID, 20, 1, 50, true)).toEqual([TEST_ITEM_ID]);
  });

  it('returns no items when the mob template has no configured loot pool', () => {
    expect(rollMobLoot(TEST_MOB_TEMPLATE_ID, 1, 1, 1)).toEqual([]);
  });

  it('only ever returns item ids that are part of the configured pool', () => {
    db.prepare('INSERT INTO mob_loot_pool (mob_template_id, item_id, weight) VALUES (?, ?, ?)').run(
      TEST_MOB_TEMPLATE_ID,
      TEST_ITEM_ID,
      50,
    );

    for (let i = 0; i < 50; i++) {
      const carried = rollMobLoot(TEST_MOB_TEMPLATE_ID, 1, 1, 1);
      expect(carried.length).toBeLessThanOrEqual(1);
      for (const itemId of carried) expect(itemId).toBe(TEST_ITEM_ID);
    }
  });

  it('sometimes carries the item and sometimes carries nothing across many rolls', () => {
    db.prepare('INSERT INTO mob_loot_pool (mob_template_id, item_id, weight) VALUES (?, ?, ?)').run(
      TEST_MOB_TEMPLATE_ID,
      TEST_ITEM_ID,
      50,
    );

    const counts = Array.from({ length: 100 }, () => rollMobLoot(TEST_MOB_TEMPLATE_ID, 1, 1, 1).length);
    expect(counts.some((count) => count === 0)).toBe(true);
    expect(counts.some((count) => count > 0)).toBe(true);
  });

  it('multiplies the drop chance by how far the rolled level is above the template minimum', () => {
    db.prepare('INSERT INTO mob_loot_pool (mob_template_id, item_id, weight) VALUES (?, ?, ?)').run(
      TEST_MOB_TEMPLATE_ID,
      TEST_ITEM_ID,
      10,
    );

    // 10%(weight) * 10배(최소~최대 10구간의 최상위 레벨) = 100%, 항상 드롭돼야 한다.
    const carried = rollMobLoot(TEST_MOB_TEMPLATE_ID, 10, 1, 10);
    expect(carried).toEqual([TEST_ITEM_ID]);
  });

  it('doubles each configured drop chance for a boss', () => {
    db.prepare('INSERT INTO mob_loot_pool (mob_template_id, item_id, weight) VALUES (?, ?, ?)').run(
      TEST_MOB_TEMPLATE_ID,
      TEST_ITEM_ID,
      40,
    );
    vi.spyOn(Math, 'random').mockReturnValue(0.5);

    expect(rollMobLoot(TEST_MOB_TEMPLATE_ID, 1, 1, 1, false)).toEqual([]);
    expect(rollMobLoot(TEST_MOB_TEMPLATE_ID, 1, 1, 1, true)).toEqual([TEST_ITEM_ID]);
  });
});

describe('tickRespawns', () => {
  const TEST_SPAWN_ID = -999001;
  let bossTemplateId: number | null = null;

  afterEach(() => {
    despawnMob(TEST_SPAWN_ID);
    if (bossTemplateId !== null) {
      db.prepare('DELETE FROM mob_loot_pool WHERE mob_template_id = ?').run(bossTemplateId);
      db.prepare('DELETE FROM mob_templates WHERE id = ?').run(bossTemplateId);
      bossTemplateId = null;
    }
  });

  it('carries isBoss through to the respawned mob instance so worldTick can announce it', () => {
    const insert = db
      .prepare(
        `INSERT INTO mob_templates
           (name, hp, hp_max, strength, strength_max, dexterity, dexterity_max, physical_defense, physical_defense_max, magic_defense, magic_defense_max, element, damage_type,
            exp_reward, exp_reward_max, gold_reward, gold_reward_max, min_level, max_level, hostile, is_boss)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run('테스트 보스', 500, 500, 20, 20, 20, 20, 10, 10, 10, 10, 'fire', 'physical', 100, 100, 100, 100, 5, 5, 1, 1);
    bossTemplateId = Number(insert.lastInsertRowid);
    const template = db.prepare('SELECT * FROM mob_templates WHERE id = ?').get(bossTemplateId) as MobTemplateRow;
    const highItem = db.prepare('SELECT id FROM items WHERE level > 5 LIMIT 1').get() as { id: number };
    const insertLoot = db.prepare('INSERT INTO mob_loot_pool (mob_template_id, item_id, weight) VALUES (?, ?, 100)');
    insertLoot.run(bossTemplateId, TEST_ITEM_ID);
    insertLoot.run(bossTemplateId, highItem.id);

    const mob = registerMobSpawn(TEST_SPAWN_ID, 42, template, 60);
    expect(mob.isBoss).toBe(true);
    expect(mob.carriedItemIds).toEqual([TEST_ITEM_ID]);

    mob.alive = false;
    mob.respawnAt = Date.now() - 1000;

    const respawned = tickRespawns();
    const entry = respawned.find((r) => r.mob.spawnId === TEST_SPAWN_ID);

    expect(entry).toBeDefined();
    expect(entry?.roomId).toBe(42);
    expect(entry?.mob.isBoss).toBe(true);
    expect(entry?.mob.alive).toBe(true);
    expect(entry?.mob.carriedItemIds).toEqual([TEST_ITEM_ID]);
  });

  it('leaves non-boss mobs marked isBoss: false after respawning', () => {
    const template = db.prepare('SELECT * FROM mob_templates WHERE id = ?').get(TEST_MOB_TEMPLATE_ID) as MobTemplateRow;

    const mob = registerMobSpawn(TEST_SPAWN_ID, 7, template, 60);
    expect(mob.isBoss).toBe(false);

    mob.alive = false;
    mob.respawnAt = Date.now() - 1000;

    const respawned = tickRespawns();
    const entry = respawned.find((r) => r.mob.spawnId === TEST_SPAWN_ID);

    expect(entry?.mob.isBoss).toBe(false);
  });
});
