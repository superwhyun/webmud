import { afterEach, describe, expect, it } from 'vitest';
import { db } from '../db/client.js';
import { findBossPlacementInvariantViolation } from './bossRules.js';

const createdTemplateIds: number[] = [];
const createdSpawnIds: number[] = [];
const createdRoomIds: number[] = [];
const createdZoneIds: number[] = [];

// 실제 존들은 이제 존마다 진짜 보스가 하나씩 배치돼 있으므로, 이 무결성 테스트는 실제 존(zone 1)이
// 아니라 격리된 존/방을 만들어 써야 "존당 보스 1마리" 규칙과 충돌하지 않는다.
function insertZoneWithRoom(maxLevel: number): number {
  const zoneId = Number(
    db
      .prepare('INSERT INTO zones (name, min_level, max_level) VALUES (?, 1, ?)')
      .run(`무결성 테스트 존 ${Date.now()}-${createdZoneIds.length}`, maxLevel).lastInsertRowid,
  );
  createdZoneIds.push(zoneId);
  const roomId = Number(
    db
      .prepare('INSERT INTO rooms (name, description, zone_id) VALUES (?, ?, ?)')
      .run('무결성 테스트 방', '', zoneId).lastInsertRowid,
  );
  createdRoomIds.push(roomId);
  return roomId;
}

function insertBoss(minLevel = 1, maxLevel = 10): number {
  const info = db
    .prepare(
      `INSERT INTO mob_templates
       (name, hp, hp_max, strength, strength_max, dexterity, dexterity_max,
        physical_defense, physical_defense_max, magic_defense, magic_defense_max,
        element, damage_type, exp_reward, exp_reward_max, gold_reward, gold_reward_max,
        min_level, max_level, hostile, is_boss)
       VALUES (?, 100, 200, 10, 20, 5, 10, 3, 6, 2, 4, 'fire', 'physical',
               100, 200, 10, 20, ?, ?, 1, 1)`,
    )
    .run(`무결성 테스트 보스 ${Date.now()}-${createdTemplateIds.length}`, minLevel, maxLevel);
  const id = Number(info.lastInsertRowid);
  createdTemplateIds.push(id);
  return id;
}

function insertSpawn(templateId: number, roomId: number, level: number): number {
  const info = db
    .prepare(
      'INSERT INTO mob_spawns (room_id, mob_template_id, respawn_seconds, min_level, max_level) VALUES (?, ?, 300, ?, ?)',
    )
    .run(roomId, templateId, level, level);
  const id = Number(info.lastInsertRowid);
  createdSpawnIds.push(id);
  return id;
}

afterEach(() => {
  for (const spawnId of createdSpawnIds.splice(0)) db.prepare('DELETE FROM mob_spawns WHERE id = ?').run(spawnId);
  for (const templateId of createdTemplateIds.splice(0)) {
    db.prepare('DELETE FROM mob_templates WHERE id = ?').run(templateId);
  }
  for (const roomId of createdRoomIds.splice(0)) db.prepare('DELETE FROM rooms WHERE id = ?').run(roomId);
  for (const zoneId of createdZoneIds.splice(0)) db.prepare('DELETE FROM zones WHERE id = ?').run(zoneId);
});

describe('boss placement invariants', () => {
  it('detects a placed boss whose fixed level falls outside an edited template range', () => {
    const roomId = insertZoneWithRoom(5);
    const templateId = insertBoss(1, 10);
    insertSpawn(templateId, roomId, 5);

    db.prepare('UPDATE mob_templates SET min_level = 6 WHERE id = ?').run(templateId);

    expect(findBossPlacementInvariantViolation()).toContain('템플릿 레벨 범위');
  });
});
