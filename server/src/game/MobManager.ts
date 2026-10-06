import { rollLootPool, type LootPoolEntry } from './mobs/loot.js';
import { fixedMobStats, isRanged, rollMobStats } from './mobs/stats.js';
import type { MobInstance } from './mobs/types.js';
export type { MobInstance, DamageType } from './mobs/types.js';

import { db } from '../db/client.js';
import type { MobTemplateRow } from '../db/types.js';

const GARRISON_RESPAWN_SECONDS = 120;

interface MobSpawnRow extends MobTemplateRow {
  spawn_id: number;
  room_id: number;
  respawn_seconds: number;
  /** 이 배치에서 템플릿의 min_level~max_level 굴림 범위를 더 좁히는 값(없으면 템플릿 범위 그대로 쓴다). */
  override_min_level: number | null;
  override_max_level: number | null;
}

interface GarrisonRow extends MobTemplateRow {
  garrison_id: number;
  room_id: number;
}

export function rollMobLoot(templateId: number, level: number, minLevel: number, maxLevel: number, isBoss = false): number[] {
  const pool = db.prepare(
    `SELECT lp.item_id, lp.weight FROM mob_loot_pool lp
     JOIN items i ON i.id = lp.item_id
     WHERE lp.mob_template_id = ? AND i.level <= ?`,
  ).all(templateId, level) as LootPoolEntry[];
  return rollLootPool(pool, level, minLevel, maxLevel, isBoss);
}

const mobs = new Map<number, MobInstance>();

function toMobInstance(params: {
  spawnId: number;
  roomId: number;
  respawnSeconds: number;
  template: MobTemplateRow;
  overrideMinLevel: number | null;
  overrideMaxLevel: number | null;
}): MobInstance {
  const { template } = params;
  const resolved = isRanged(template)
    ? rollMobStats(template, params.overrideMinLevel, params.overrideMaxLevel)
    : fixedMobStats(template);
  return {
    spawnId: params.spawnId,
    templateId: template.id,
    roomId: params.roomId,
    homeRoomId: params.roomId,
    name: resolved.name,
    maxHp: resolved.hp,
    hp: resolved.hp,
    strength: resolved.strength,
    dexterity: resolved.dexterity,
    physicalDefense: resolved.physicalDefense,
    magicDefense: resolved.magicDefense,
    element: resolved.element,
    damageType: resolved.damageType,
    expReward: resolved.expReward,
    goldReward: resolved.goldReward,
    respawnSeconds: params.respawnSeconds,
    level: resolved.level,
    hostile: Boolean(template.hostile),
    isBoss: Boolean(template.is_boss),
    carriedItemIds: rollMobLoot(
      template.id,
      resolved.level,
      template.min_level,
      template.max_level,
      Boolean(template.is_boss),
    ),
    alive: true,
    respawnAt: null,
  };
}

export function loadMobs(): void {
  mobs.clear();

  const spawnRows = db
    .prepare(
      `SELECT ms.id as spawn_id, ms.room_id, ms.respawn_seconds,
              ms.min_level as override_min_level, ms.max_level as override_max_level,
              mt.*
       FROM mob_spawns ms
       JOIN mob_templates mt ON mt.id = ms.mob_template_id`,
    )
    .all() as MobSpawnRow[];

  for (const row of spawnRows) {
    mobs.set(
      row.spawn_id,
      toMobInstance({
        spawnId: row.spawn_id,
        roomId: row.room_id,
        respawnSeconds: row.respawn_seconds,
        template: row,
        overrideMinLevel: row.override_min_level,
        overrideMaxLevel: row.override_max_level,
      }),
    );
  }

  const garrisonRows = db
    .prepare(
      `SELECT vg.id as garrison_id, v.room_id, mt.*
       FROM village_garrison vg
       JOIN villages v ON v.id = vg.village_id
       JOIN mob_templates mt ON mt.id = vg.mob_template_id`,
    )
    .all() as GarrisonRow[];

  for (const row of garrisonRows) {
    const spawnId = -row.garrison_id;
    mobs.set(
      spawnId,
      toMobInstance({
        spawnId,
        roomId: row.room_id,
        respawnSeconds: GARRISON_RESPAWN_SECONDS,
        template: row,
        overrideMinLevel: null,
        overrideMaxLevel: null,
      }),
    );
  }
}

/** Registers a newly hired garrison mob without reloading (and resetting) the rest of the world's mobs. */
export function spawnGarrisonMob(
  garrisonId: number,
  roomId: number,
  template: MobTemplateRow,
): MobInstance {
  const spawnId = -garrisonId;
  const instance = toMobInstance({
    spawnId,
    roomId,
    respawnSeconds: GARRISON_RESPAWN_SECONDS,
    template,
    overrideMinLevel: null,
    overrideMaxLevel: null,
  });
  mobs.set(spawnId, instance);
  return instance;
}

/** Registers a newly created mob spawn without reloading (and resetting) the rest of the world's mobs. */
export function registerMobSpawn(
  spawnId: number,
  roomId: number,
  template: MobTemplateRow,
  respawnSeconds: number,
  overrideMinLevel: number | null = null,
  overrideMaxLevel: number | null = null,
): MobInstance {
  const instance = toMobInstance({
    spawnId,
    roomId,
    respawnSeconds,
    template,
    overrideMinLevel,
    overrideMaxLevel,
  });
  mobs.set(spawnId, instance);
  return instance;
}

/** Removes a mob instance entirely (e.g. a fired garrison guard). Unlike killMob, it never respawns. */
export function despawnMob(spawnId: number): void {
  const mob = mobs.get(spawnId);
  if (mob) mob.alive = false;
  mobs.delete(spawnId);
}

export function getMobsInRoom(roomId: number): MobInstance[] {
  return [...mobs.values()].filter((mob) => mob.roomId === roomId && mob.alive);
}

export function getMobBySpawnId(spawnId: number): MobInstance | undefined {
  return mobs.get(spawnId);
}

export function findMobInRoomByName(roomId: number, nameQuery: string): MobInstance | undefined {
  const lower = nameQuery.toLowerCase();
  return getMobsInRoom(roomId).find((mob) => mob.name.toLowerCase().includes(lower));
}

export function findMobTemplateByName(name: string): MobTemplateRow | undefined {
  const lower = name.toLowerCase();
  const rows = db.prepare('SELECT * FROM mob_templates WHERE is_boss = 0').all() as MobTemplateRow[];
  return rows.find((row) => row.name.toLowerCase().includes(lower));
}

export function killMob(mob: MobInstance): void {
  mob.alive = false;
  mob.hp = 0;
  mob.roomId = mob.homeRoomId;
  mob.respawnAt = Date.now() + mob.respawnSeconds * 1000;
}

const selectTemplateById = db.prepare('SELECT * FROM mob_templates WHERE id = ?');
const selectSpawnOverrideById = db.prepare('SELECT min_level, max_level FROM mob_spawns WHERE id = ?');

export interface RespawnedMob {
  roomId: number;
  mob: MobInstance;
}

export function tickRespawns(): RespawnedMob[] {
  const now = Date.now();
  const respawned: RespawnedMob[] = [];
  for (const mob of mobs.values()) {
    if (!mob.alive && mob.respawnAt !== null && now >= mob.respawnAt) {
      const template = selectTemplateById.get(mob.templateId) as MobTemplateRow | undefined;
      if (template && isRanged(template)) {
        const override = mob.spawnId > 0
          ? (selectSpawnOverrideById.get(mob.spawnId) as { min_level: number | null; max_level: number | null } | undefined)
          : undefined;
        const resolved = rollMobStats(template, override?.min_level ?? null, override?.max_level ?? null);
        mob.name = resolved.name;
        mob.maxHp = resolved.hp;
        mob.strength = resolved.strength;
        mob.dexterity = resolved.dexterity;
        mob.physicalDefense = resolved.physicalDefense;
        mob.magicDefense = resolved.magicDefense;
        mob.element = resolved.element;
        mob.damageType = resolved.damageType;
        mob.expReward = resolved.expReward;
        mob.goldReward = resolved.goldReward;
        mob.level = resolved.level;
      }
      mob.alive = true;
      mob.hp = mob.maxHp;
      mob.respawnAt = null;
      mob.carriedItemIds = rollMobLoot(
        mob.templateId,
        mob.level,
        template?.min_level ?? mob.level,
        template?.max_level ?? mob.level,
        mob.isBoss,
      );
      respawned.push({ roomId: mob.roomId, mob });
    }
  }
  return respawned;
}

loadMobs();
