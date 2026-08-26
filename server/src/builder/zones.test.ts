import { afterEach, describe, expect, it } from 'vitest';
import { db } from '../db/client.js';
import { getZoneLevelUpdateConflict, zoneUpsertSchema } from './zones.js';

const createdTemplateIds: number[] = [];
const createdSpawnIds: number[] = [];

afterEach(() => {
  for (const spawnId of createdSpawnIds.splice(0)) db.prepare('DELETE FROM mob_spawns WHERE id = ?').run(spawnId);
  for (const templateId of createdTemplateIds.splice(0)) {
    db.prepare('DELETE FROM mob_templates WHERE id = ?').run(templateId);
  }
});

describe('zone level range contract', () => {
  it('accepts a configured level range', () => {
    expect(zoneUpsertSchema.parse({ name: '보스 존', description: '', minLevel: 6, maxLevel: 10 })).toMatchObject({
      minLevel: 6,
      maxLevel: 10,
    });
  });

  it('rejects an inverted level range', () => {
    expect(zoneUpsertSchema.safeParse({ name: '보스 존', description: '', minLevel: 10, maxLevel: 6 }).success).toBe(
      false,
    );
  });

  it('blocks changing the maximum level while a boss is placed in the zone', () => {
    const template = db
      .prepare(
        `INSERT INTO mob_templates
         (name, hp, hp_max, strength, strength_max, dexterity, dexterity_max,
          physical_defense, physical_defense_max, magic_defense, magic_defense_max,
          element, damage_type, exp_reward, exp_reward_max, gold_reward, gold_reward_max,
          min_level, max_level, hostile, is_boss)
         VALUES (?, 100, 200, 10, 20, 5, 10, 3, 6, 2, 4, 'fire', 'physical', 100, 200, 10, 20, 1, 10, 1, 1)`,
      )
      .run(`존 잠금 테스트 보스 ${Date.now()}`);
    const templateId = Number(template.lastInsertRowid);
    createdTemplateIds.push(templateId);
    const spawn = db
      .prepare(
        'INSERT INTO mob_spawns (room_id, mob_template_id, respawn_seconds, min_level, max_level) VALUES (1, ?, 300, 5, 5)',
      )
      .run(templateId);
    createdSpawnIds.push(Number(spawn.lastInsertRowid));

    expect(getZoneLevelUpdateConflict(1, 6)).toContain('최고 레벨');
    expect(getZoneLevelUpdateConflict(1, 5)).toBeNull();
  });
});
