import type { ElementType } from '@mud/shared';
import { db } from '../db/client.js';
import type { MobTemplateRow } from '../db/types.js';

export type DamageType = 'physical' | 'magic';

const GARRISON_RESPAWN_SECONDS = 120;

export interface MobInstance {
  spawnId: number;
  templateId: number;
  roomId: number;
  name: string;
  maxHp: number;
  hp: number;
  strength: number;
  dexterity: number;
  physicalDefense: number;
  magicDefense: number;
  element: ElementType;
  damageType: DamageType;
  expReward: number;
  goldReward: number;
  respawnSeconds: number;
  level: number;
  hostile: boolean;
  carriedItemIds: number[];
  alive: boolean;
  respawnAt: number | null;
}

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

interface LootPoolItemRow {
  item_id: number;
  weight: number;
}

/**
 * mob_loot_pool.weight는 이제 "기본 등장확률(%)"이고, 몹이 지금 굴린 레벨이 자기 템플릿의
 * min~max 구간에서 몇 번째냐(최소=1배, 최대=10배)에 따라 배수를 곱한 뒤 아이템마다 독립적으로
 * 굴린다 — 같은 풀 안에서 서로 배타적으로 하나만 뽑는 방식이 아니라, 여러 개가 동시에 나올 수 있다.
 */
function lootLevelMultiplier(level: number, minLevel: number, maxLevel: number): number {
  if (maxLevel <= minLevel) return 1;
  return Math.max(1, level - minLevel + 1);
}

/** 몹 템플릿이 보유 가능한 아이템 풀에서, 레벨 배수를 반영한 확률(%)로 아이템마다 독립적으로 굴려서 들려준다. */
export function rollMobLoot(templateId: number, level: number, minLevel: number, maxLevel: number): number[] {
  const pool = db
    .prepare(`SELECT item_id, weight FROM mob_loot_pool WHERE mob_template_id = ?`)
    .all(templateId) as LootPoolItemRow[];
  if (pool.length === 0) return [];

  const multiplier = lootLevelMultiplier(level, minLevel, maxLevel);
  const carried: number[] = [];
  for (const entry of pool) {
    const chancePercent = Math.min(100, entry.weight * multiplier);
    if (Math.random() * 100 < chancePercent) carried.push(entry.item_id);
  }

  return carried;
}

const mobs = new Map<number, MobInstance>();

function randomLevelInRange(minLevel: number, maxLevel: number): number {
  return minLevel + Math.floor(Math.random() * (maxLevel - minLevel + 1));
}

function interpolateStat(min: number, max: number, ratio: number): number {
  return Math.round(min + (max - min) * ratio);
}

function isRanged(template: MobTemplateRow): boolean {
  return template.min_level < template.max_level;
}

interface RolledMobStats {
  name: string;
  hp: number;
  strength: number;
  dexterity: number;
  physicalDefense: number;
  magicDefense: number;
  element: ElementType;
  damageType: DamageType;
  expReward: number;
  goldReward: number;
  level: number;
}

/**
 * 템플릿의 min_level~max_level(굴림 범위는 override로 더 좁힐 수 있다) 안에서 레벨을 굴리고,
 * 스탯은 항상 템플릿 자신의 min~max 구간을 기준으로 선형 보간한다 — override는 굴림 범위만
 * 좁힐 뿐, 스탯이 어느 지점까지 보간되는지의 기준(템플릿의 전체 범위)은 바꾸지 않는다.
 */
function rollMobStats(template: MobTemplateRow, overrideMinLevel: number | null, overrideMaxLevel: number | null): RolledMobStats {
  const rollMin = overrideMinLevel ?? template.min_level;
  const rollMax = overrideMaxLevel ?? template.max_level;
  const level = randomLevelInRange(rollMin, rollMax);
  const span = template.max_level - template.min_level;
  const ratio = span === 0 ? 0 : (level - template.min_level) / span;
  return {
    name: template.name,
    hp: interpolateStat(template.hp, template.hp_max, ratio),
    strength: interpolateStat(template.strength, template.strength_max, ratio),
    dexterity: interpolateStat(template.dexterity, template.dexterity_max, ratio),
    physicalDefense: interpolateStat(template.physical_defense, template.physical_defense_max, ratio),
    magicDefense: interpolateStat(template.magic_defense, template.magic_defense_max, ratio),
    element: template.element,
    damageType: template.damage_type,
    expReward: interpolateStat(template.exp_reward, template.exp_reward_max, ratio),
    goldReward: interpolateStat(template.gold_reward, template.gold_reward_max, ratio),
    level,
  };
}

function fixedMobStats(template: MobTemplateRow): RolledMobStats {
  return {
    name: template.name,
    hp: template.hp,
    strength: template.strength,
    dexterity: template.dexterity,
    physicalDefense: template.physical_defense,
    magicDefense: template.magic_defense,
    element: template.element,
    damageType: template.damage_type,
    expReward: template.exp_reward,
    goldReward: template.gold_reward,
    level: template.min_level,
  };
}

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
    carriedItemIds: rollMobLoot(template.id, resolved.level, template.min_level, template.max_level),
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
): MobInstance {
  const instance = toMobInstance({
    spawnId,
    roomId,
    respawnSeconds,
    template,
    overrideMinLevel: null,
    overrideMaxLevel: null,
  });
  mobs.set(spawnId, instance);
  return instance;
}

/** Removes a mob instance entirely (e.g. a fired garrison guard). Unlike killMob, it never respawns. */
export function despawnMob(spawnId: number): void {
  mobs.delete(spawnId);
}

export function getMobsInRoom(roomId: number): MobInstance[] {
  return [...mobs.values()].filter((mob) => mob.roomId === roomId && mob.alive);
}

export function findMobInRoomByName(roomId: number, nameQuery: string): MobInstance | undefined {
  const lower = nameQuery.toLowerCase();
  return getMobsInRoom(roomId).find((mob) => mob.name.toLowerCase().includes(lower));
}

export function findMobTemplateByName(name: string): MobTemplateRow | undefined {
  const lower = name.toLowerCase();
  const rows = db.prepare('SELECT * FROM mob_templates').all() as MobTemplateRow[];
  return rows.find((row) => row.name.toLowerCase().includes(lower));
}

export function killMob(mob: MobInstance): void {
  mob.alive = false;
  mob.hp = 0;
  mob.respawnAt = Date.now() + mob.respawnSeconds * 1000;
}

const selectTemplateById = db.prepare('SELECT * FROM mob_templates WHERE id = ?');
const selectSpawnOverrideById = db.prepare('SELECT min_level, max_level FROM mob_spawns WHERE id = ?');

export function tickRespawns(): number[] {
  const now = Date.now();
  const respawnedRoomIds: number[] = [];
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
      mob.carriedItemIds = rollMobLoot(mob.templateId, mob.level, template?.min_level ?? mob.level, template?.max_level ?? mob.level);
      respawnedRoomIds.push(mob.roomId);
    }
  }
  return respawnedRoomIds;
}

loadMobs();
