import { afterEach, describe, expect, it } from 'vitest';
import { db } from '../db/client.js';
import { rollMobLoot } from './MobManager.js';

// 시드 데이터: 몹 템플릿 1(쥐), 아이템 1(낡은 검, 등급 low).
const TEST_MOB_TEMPLATE_ID = 1;
const TEST_ITEM_ID = 1;

afterEach(() => {
  db.prepare('DELETE FROM mob_loot_pool WHERE mob_template_id = ?').run(TEST_MOB_TEMPLATE_ID);
});

describe('rollMobLoot', () => {
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
});
