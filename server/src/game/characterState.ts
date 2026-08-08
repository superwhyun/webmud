import type { CharacterState } from '@mud/shared';
import { db } from '../db/client.js';
import type { CharacterWithRoomRow } from '../db/types.js';
import { getEffectiveStats, type EffectiveStats } from './combatStats.js';

export function loadCharacter(characterId: number): CharacterWithRoomRow | undefined {
  return db
    .prepare(
      `SELECT c.*, r.name as room_name FROM characters c
       JOIN rooms r ON r.id = c.room_id
       WHERE c.id = ?`,
    )
    .get(characterId) as CharacterWithRoomRow | undefined;
}

export function toCharacterState(row: CharacterWithRoomRow, effective: EffectiveStats): CharacterState {
  return {
    name: row.name,
    hp: row.hp,
    maxHp: row.max_hp,
    mp: row.mp,
    maxMp: row.max_mp,
    level: row.level,
    exp: row.exp,
    roomName: row.room_name,
    job: row.job,
    strength: effective.strength,
    dexterity: effective.dexterity,
    intelligence: effective.intelligence,
    vitality: effective.vitality,
    wisdom: effective.wisdom,
    luck: effective.luck,
    attackPower: effective.attackPower,
    physicalDefense: effective.physicalDefense,
    magicDefense: effective.magicDefense,
    element: effective.element,
    gold: row.gold,
    unallocatedStatPoints: row.unallocated_stat_points,
    unallocatedSkillPoints: row.unallocated_skill_points,
  };
}

export function loadCharacterState(characterId: number): CharacterState | undefined {
  const row = loadCharacter(characterId);
  return row ? toCharacterState(row, getEffectiveStats(row)) : undefined;
}
