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
  alive: boolean;
  respawnAt: number | null;
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
}

const mobs = new Map<number, MobInstance>();

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
}): MobInstance {
  return {
    spawnId: params.spawnId,
    templateId: params.templateId,
    roomId: params.roomId,
    name: params.name,
    maxHp: params.hp,
    hp: params.hp,
    strength: params.strength,
    dexterity: params.dexterity,
    physicalDefense: params.physicalDefense,
    magicDefense: params.magicDefense,
    element: params.element,
    damageType: params.damageType,
    expReward: params.expReward,
    goldReward: params.goldReward,
    respawnSeconds: params.respawnSeconds,
    alive: true,
    respawnAt: null,
  };
}

export function loadMobs(): void {
  mobs.clear();

  const spawnRows = db
    .prepare(
      `SELECT ms.id as spawn_id, ms.room_id, ms.respawn_seconds,
              mt.id as template_id, mt.name, mt.hp, mt.strength, mt.dexterity,
              mt.physical_defense, mt.magic_defense, mt.element, mt.damage_type,
              mt.exp_reward, mt.gold_reward
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
      }),
    );
  }

  const garrisonRows = db
    .prepare(
      `SELECT vg.id as garrison_id, v.room_id,
              mt.id as template_id, mt.name, mt.hp, mt.strength, mt.dexterity,
              mt.physical_defense, mt.magic_defense, mt.element, mt.damage_type,
              mt.exp_reward, mt.gold_reward
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
      mob.alive = true;
      mob.hp = mob.maxHp;
      mob.respawnAt = null;
      respawnedRoomIds.push(mob.roomId);
    }
  }
  return respawnedRoomIds;
}

loadMobs();
