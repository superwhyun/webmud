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
    level: row.level,
    exp: row.exp,
    roomName: row.room_name,
    strength: effective.strength,
    dexterity: effective.dexterity,
    physicalDefense: effective.physicalDefense,
    magicDefense: effective.magicDefense,
    element: effective.element,
  };
}

export function loadCharacterState(characterId: number): CharacterState | undefined {
  const row = loadCharacter(characterId);
  return row ? toCharacterState(row, getEffectiveStats(row)) : undefined;
}
