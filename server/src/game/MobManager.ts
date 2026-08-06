import type { ElementType } from '@mud/shared';
import { db } from '../db/client.js';

export type DamageType = 'physical' | 'magic';

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

const mobs = new Map<number, MobInstance>();

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
    mobs.set(row.spawn_id, {
      spawnId: row.spawn_id,
      templateId: row.template_id,
      roomId: row.room_id,
      name: row.name,
      maxHp: row.hp,
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
      alive: true,
      respawnAt: null,
    });
  }
}

export function getMobsInRoom(roomId: number): MobInstance[] {
  return [...mobs.values()].filter((mob) => mob.roomId === roomId && mob.alive);
}

export function findMobInRoomByName(roomId: number, nameQuery: string): MobInstance | undefined {
  const lower = nameQuery.toLowerCase();
  return getMobsInRoom(roomId).find((mob) => mob.name.toLowerCase().includes(lower));
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
