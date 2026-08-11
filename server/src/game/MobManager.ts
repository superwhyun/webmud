import type { ElementType } from '@mud/shared';
import { db } from '../db/client.js';
import type { MobTemplateRow } from '../db/types.js';
import { computeMobStatsForLevel, randomLevelInRange, speciesIndexForAnchorId } from '../db/seed/mobs/interpolated.js';

export type DamageType = 'physical' | 'magic';

const GARRISON_RESPAWN_SECONDS = 120;
const MAX_CARRIED_ITEMS = 2;
const CARRY_ROLL_CHANCE = 0.5;

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
  /** 존재하면(진행 존 사냥터 몹) 리스폰마다 이 범위 안에서 레벨/스탯을 다시 굴린다. */
  levelRange: { minLevel: number; maxLevel: number } | null;
  /** 방금 굴린 레벨의 루팅 풀 조회용 앵커 id — levelRange가 없으면 templateId와 같다. */
  lootTemplateId: number;
}

interface MobSpawnRow {
  spawn_id: number;
  room_id: number;
  respawn_seconds: number;
  template_id: number;
  name: string;
  hp: number;
  strength: number;
  dexterity: number;
  physical_defense: number;
  magic_defense: number;
  element: ElementType;
  damage_type: DamageType;
  exp_reward: number;
  gold_reward: number;
  level: number;
  hostile: number;
  min_level: number | null;
  max_level: number | null;
}

interface GarrisonRow {
  garrison_id: number;
  room_id: number;
  template_id: number;
  name: string;
  hp: number;
  strength: number;
  dexterity: number;
  physical_defense: number;
  magic_defense: number;
  element: ElementType;
  damage_type: DamageType;
  exp_reward: number;
  gold_reward: number;
  level: number;
  hostile: number;
}

interface LootPoolItemRow {
  item_id: number;
  weight: number;
}

/** 몹 템플릿이 보유 가능한 아이템 풀에서, admin이 지정한 가중치(weight)에 비례해 몇 개를 뽑아 들려준다. */
export function rollMobLoot(templateId: number): number[] {
  const pool = db
    .prepare(`SELECT item_id, weight FROM mob_loot_pool WHERE mob_template_id = ?`)
    .all(templateId) as LootPoolItemRow[];
  if (pool.length === 0) return [];

  const totalWeight = pool.reduce((sum, entry) => sum + entry.weight, 0);
  const carried = new Set<number>();

  for (let i = 0; i < MAX_CARRIED_ITEMS; i++) {
    if (Math.random() >= CARRY_ROLL_CHANCE) continue;
    if (totalWeight <= 0) continue;

    let roll = Math.random() * totalWeight;
    for (const entry of pool) {
      roll -= entry.weight;
      if (roll <= 0) {
        carried.add(entry.item_id);
        break;
      }
    }
  }

  return [...carried];
}

const mobs = new Map<number, MobInstance>();

interface ResolvedMobStats {
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
  lootTemplateId: number;
}

/** levelRange가 있으면 그 범위 안에서 레벨을 새로 굴려 보간 스탯을 계산하고, 없으면 주어진 고정값을 그대로 쓴다. */
function resolveMobStats(params: {
  templateId: number;
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
  levelRange: { minLevel: number; maxLevel: number } | null;
}): ResolvedMobStats {
  if (!params.levelRange) {
    return {
      name: params.name,
      hp: params.hp,
      strength: params.strength,
      dexterity: params.dexterity,
      physicalDefense: params.physicalDefense,
      magicDefense: params.magicDefense,
      element: params.element,
      damageType: params.damageType,
      expReward: params.expReward,
      goldReward: params.goldReward,
      level: params.level,
      lootTemplateId: params.templateId,
    };
  }

  const speciesIndex = speciesIndexForAnchorId(params.templateId);
  const rolledLevel = randomLevelInRange(params.levelRange.minLevel, params.levelRange.maxLevel);
  const computed = computeMobStatsForLevel(speciesIndex, rolledLevel);
  return {
    name: computed.name,
    hp: computed.hp,
    strength: computed.strength,
    dexterity: computed.dexterity,
    physicalDefense: computed.physicalDefense,
    magicDefense: computed.magicDefense,
    element: computed.element,
    damageType: computed.damageType,
    expReward: computed.expReward,
    goldReward: computed.goldReward,
    level: computed.level,
    lootTemplateId: computed.lootTemplateId,
  };
}

function toMobInstance(params: {
  spawnId: number;
  templateId: number;
  roomId: number;
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
  respawnSeconds: number;
  level: number;
  hostile: boolean;
  levelRange: { minLevel: number; maxLevel: number } | null;
}): MobInstance {
  const resolved = resolveMobStats(params);
  return {
    spawnId: params.spawnId,
    templateId: params.templateId,
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
    hostile: params.hostile,
    carriedItemIds: rollMobLoot(resolved.lootTemplateId),
    alive: true,
    respawnAt: null,
    levelRange: params.levelRange,
    lootTemplateId: resolved.lootTemplateId,
  };
}

export function loadMobs(): void {
  mobs.clear();

  const spawnRows = db
    .prepare(
      `SELECT ms.id as spawn_id, ms.room_id, ms.respawn_seconds, ms.min_level, ms.max_level,
              mt.id as template_id, mt.name, mt.hp, mt.strength, mt.dexterity,
              mt.physical_defense, mt.magic_defense, mt.element, mt.damage_type,
              mt.exp_reward, mt.gold_reward, mt.level, mt.hostile
       FROM mob_spawns ms
       JOIN mob_templates mt ON mt.id = ms.mob_template_id`,
    )
    .all() as MobSpawnRow[];

  for (const row of spawnRows) {
    mobs.set(
      row.spawn_id,
      toMobInstance({
        spawnId: row.spawn_id,
        templateId: row.template_id,
        roomId: row.room_id,
        name: row.name,
        hp: row.hp,
        strength: row.strength,
        dexterity: row.dexterity,
        physicalDefense: row.physical_defense,
        magicDefense: row.magic_defense,
        element: row.element,
        damageType: row.damage_type,
        expReward: row.exp_reward,
        goldReward: row.gold_reward,
        respawnSeconds: row.respawn_seconds,
        level: row.level,
        hostile: Boolean(row.hostile),
        levelRange: row.min_level !== null && row.max_level !== null ? { minLevel: row.min_level, maxLevel: row.max_level } : null,
      }),
    );
  }

  const garrisonRows = db
    .prepare(
      `SELECT vg.id as garrison_id, v.room_id,
              mt.id as template_id, mt.name, mt.hp, mt.strength, mt.dexterity,
              mt.physical_defense, mt.magic_defense, mt.element, mt.damage_type,
              mt.exp_reward, mt.gold_reward, mt.level, mt.hostile
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
        templateId: row.template_id,
        roomId: row.room_id,
        name: row.name,
        hp: row.hp,
        strength: row.strength,
        dexterity: row.dexterity,
        physicalDefense: row.physical_defense,
        magicDefense: row.magic_defense,
        element: row.element,
        damageType: row.damage_type,
        expReward: row.exp_reward,
        goldReward: row.gold_reward,
        respawnSeconds: GARRISON_RESPAWN_SECONDS,
        level: row.level,
        hostile: Boolean(row.hostile),
        levelRange: null,
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
    templateId: template.id,
    roomId,
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
    respawnSeconds: GARRISON_RESPAWN_SECONDS,
    level: template.level,
    hostile: Boolean(template.hostile),
    levelRange: null,
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
    templateId: template.id,
    roomId,
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
    respawnSeconds,
    level: template.level,
    hostile: Boolean(template.hostile),
    levelRange: null,
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

export function tickRespawns(): number[] {
  const now = Date.now();
  const respawnedRoomIds: number[] = [];
  for (const mob of mobs.values()) {
    if (!mob.alive && mob.respawnAt !== null && now >= mob.respawnAt) {
      if (mob.levelRange) {
        const speciesIndex = speciesIndexForAnchorId(mob.templateId);
        const rolledLevel = randomLevelInRange(mob.levelRange.minLevel, mob.levelRange.maxLevel);
        const computed = computeMobStatsForLevel(speciesIndex, rolledLevel);
        mob.name = computed.name;
        mob.maxHp = computed.hp;
        mob.strength = computed.strength;
        mob.dexterity = computed.dexterity;
        mob.physicalDefense = computed.physicalDefense;
        mob.magicDefense = computed.magicDefense;
        mob.element = computed.element;
        mob.damageType = computed.damageType;
        mob.expReward = computed.expReward;
        mob.goldReward = computed.goldReward;
        mob.level = computed.level;
        mob.lootTemplateId = computed.lootTemplateId;
      }
      mob.alive = true;
      mob.hp = mob.maxHp;
      mob.respawnAt = null;
      mob.carriedItemIds = rollMobLoot(mob.lootTemplateId);
      respawnedRoomIds.push(mob.roomId);
    }
  }
  return respawnedRoomIds;
}

loadMobs();
