import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '../db/client.js';
import { despawnMob, getMobsInRoom, killMob, tickRespawns } from '../game/MobManager.js';
import { registerRoom, unregisterRoom } from '../game/World.js';
import { createMobSpawnRecord, resolveBossSpawnLevel } from './mobs.js';

const createdTemplateIds: number[] = [];
const createdSpawnIds: number[] = [];

function insertTemplate(isBoss: boolean, minLevel = 1, maxLevel = 50): number {
  const name = `테스트 ${isBoss ? '보스' : '일반몹'} ${Date.now()}-${createdTemplateIds.length}`;
  const info = db
    .prepare(
      `INSERT INTO mob_templates
       (name, hp, hp_max, strength, strength_max, dexterity, dexterity_max,
        physical_defense, physical_defense_max, magic_defense, magic_defense_max,
        element, damage_type, exp_reward, exp_reward_max, gold_reward, gold_reward_max,
        min_level, max_level, hostile, is_boss)
       VALUES (?, 100, 500, 10, 50, 5, 25, 3, 15, 2, 10, 'fire', 'physical',
               100, 500, 10, 50, ?, ?, 1, ?)`,
    )
    .run(name, minLevel, maxLevel, isBoss ? 1 : 0);
  const id = Number(info.lastInsertRowid);
  createdTemplateIds.push(id);
  return id;
}

afterEach(() => {
  vi.useRealTimers();
  for (const spawnId of createdSpawnIds.splice(0)) {
    despawnMob(spawnId);
    db.prepare('DELETE FROM mob_spawns WHERE id = ?').run(spawnId);
  }
  for (const templateId of createdTemplateIds.splice(0)) {
    db.prepare('DELETE FROM mob_templates WHERE id = ?').run(templateId);
  }
});

describe('resolveBossSpawnLevel', () => {
  it('uses the zone maximum as one fixed boss level', () => {
    expect(resolveBossSpawnLevel({ minLevel: 1, maxLevel: 50 }, { minLevel: 6, maxLevel: 10 })).toEqual({
      level: 10,
    });
  });

  it('rejects zones with no configured level range', () => {
    expect(resolveBossSpawnLevel({ minLevel: 1, maxLevel: 50 }, { minLevel: null, maxLevel: null })).toEqual({
      error: '보스를 배치하려면 먼저 존 레벨 범위를 설정해야 합니다.',
    });
  });

  it('rejects a zone maximum outside the boss template range', () => {
    expect(resolveBossSpawnLevel({ minLevel: 1, maxLevel: 20 }, { minLevel: 21, maxLevel: 25 })).toEqual({
      error: '존 최고 레벨 Lv.25가 보스 템플릿 범위 Lv.1-20에 포함되지 않습니다.',
    });
  });
});

describe('createMobSpawnRecord boss placement', () => {
  // 실제 게임 존에는 이제 존마다 진짜 보스가 하나씩 배치돼 있으므로, "존에 보스가 없는 상태"를
  // 가정하는 이 테스트들은 실제 방(zone 1의 room 1/2)이 아니라 격리된 존/방을 매번 새로 만든다.
  let testZoneId: number;
  let testRoomId: number;
  let testRoomId2: number;

  beforeEach(() => {
    testZoneId = Number(
      db
        .prepare('INSERT INTO zones (name, min_level, max_level) VALUES (?, 1, 5)')
        .run(`테스트존-${Date.now()}-${Math.random()}`).lastInsertRowid,
    );
    testRoomId = Number(
      db
        .prepare('INSERT INTO rooms (name, description, zone_id) VALUES (?, ?, ?)')
        .run('테스트방1', '', testZoneId).lastInsertRowid,
    );
    testRoomId2 = Number(
      db
        .prepare('INSERT INTO rooms (name, description, zone_id) VALUES (?, ?, ?)')
        .run('테스트방2', '', testZoneId).lastInsertRowid,
    );
    registerRoom({ id: testRoomId, name: '테스트방1', description: '', x: 0, y: 0, zoneId: testZoneId, exits: {} });
    registerRoom({ id: testRoomId2, name: '테스트방2', description: '', x: 1, y: 0, zoneId: testZoneId, exits: {} });
  });

  afterEach(() => {
    // 방/존을 지우기 전에, 그 방을 참조하는 mob_spawns 행부터 먼저 지워야 FK 제약에 걸리지 않는다
    // — 파일 상단의 afterEach는 nested afterEach보다 나중에 실행되므로 순서를 맞춰 여기서 먼저 비운다.
    for (const spawnId of createdSpawnIds.splice(0)) {
      despawnMob(spawnId);
      db.prepare('DELETE FROM mob_spawns WHERE id = ?').run(spawnId);
    }
    unregisterRoom(testRoomId);
    unregisterRoom(testRoomId2);
    db.prepare('DELETE FROM rooms WHERE id IN (?, ?)').run(testRoomId, testRoomId2);
    db.prepare('DELETE FROM zones WHERE id = ?').run(testZoneId);
  });

  it('stores and spawns a boss at the zone maximum level', () => {
    const templateId = insertTemplate(true);

    const outcome = createMobSpawnRecord({ roomId: testRoomId, mobTemplateId: templateId, respawnSeconds: 300 });

    expect(outcome).toHaveProperty('spawnId');
    if (!('spawnId' in outcome)) return;
    createdSpawnIds.push(outcome.spawnId);
    const row = db.prepare('SELECT min_level, max_level FROM mob_spawns WHERE id = ?').get(outcome.spawnId) as {
      min_level: number | null;
      max_level: number | null;
    };
    expect(row).toEqual({ min_level: 5, max_level: 5 });
    const spawned = getMobsInRoom(testRoomId).find((mob) => mob.spawnId === outcome.spawnId);
    expect(spawned?.level).toBe(5);
    expect(spawned?.isBoss).toBe(true);

    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
    if (!spawned) return;
    killMob(spawned);
    vi.advanceTimersByTime(300_000);
    tickRespawns();
    expect(getMobsInRoom(testRoomId).find((mob) => mob.spawnId === outcome.spawnId)?.level).toBe(5);
  });

  it('allows only one boss spawn in a zone', () => {
    const templateId = insertTemplate(true);
    const first = createMobSpawnRecord({ roomId: testRoomId, mobTemplateId: templateId, respawnSeconds: 300 });
    expect(first).toHaveProperty('spawnId');
    if (!('spawnId' in first)) return;
    createdSpawnIds.push(first.spawnId);

    expect(createMobSpawnRecord({ roomId: testRoomId2, mobTemplateId: templateId, respawnSeconds: 300 })).toEqual({
      error: '이 존에는 이미 보스가 배치되어 있습니다.',
      status: 409,
    });
  });

  it('keeps ordinary ranged mob placement overrides unchanged', () => {
    const templateId = insertTemplate(false);

    const outcome = createMobSpawnRecord({ roomId: testRoomId, mobTemplateId: templateId, respawnSeconds: 20 });

    expect(outcome).toHaveProperty('spawnId');
    if (!('spawnId' in outcome)) return;
    createdSpawnIds.push(outcome.spawnId);
    const row = db.prepare('SELECT min_level, max_level FROM mob_spawns WHERE id = ?').get(outcome.spawnId) as {
      min_level: number | null;
      max_level: number | null;
    };
    expect(row).toEqual({ min_level: null, max_level: null });
  });

  it('marks a removed boss dead so active combats drop the shared instance', () => {
    const templateId = insertTemplate(true);
    const outcome = createMobSpawnRecord({ roomId: testRoomId, mobTemplateId: templateId, respawnSeconds: 300 });
    expect(outcome).toHaveProperty('spawnId');
    if (!('spawnId' in outcome)) return;
    createdSpawnIds.push(outcome.spawnId);
    const spawned = getMobsInRoom(testRoomId).find((mob) => mob.spawnId === outcome.spawnId);
    expect(spawned).toBeDefined();

    despawnMob(outcome.spawnId);

    expect(spawned?.alive).toBe(false);
    expect(getMobsInRoom(testRoomId).some((mob) => mob.spawnId === outcome.spawnId)).toBe(false);
  });
});
