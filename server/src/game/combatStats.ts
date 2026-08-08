import type { ElementType } from '@mud/shared';
import { db } from '../db/client.js';
import type { CharacterRow } from '../db/types.js';

export interface EffectiveStats {
  strength: number;
  dexterity: number;
  intelligence: number;
  vitality: number;
  wisdom: number;
  luck: number;
  attackPower: number;
  physicalDefense: number;
  magicDefense: number;
  element: ElementType;
}

interface BonusRow {
  strength_bonus: number;
  dexterity_bonus: number;
  attack_power_bonus: number;
  physical_defense_bonus: number;
  magic_defense_bonus: number;
}

export function getEffectiveStats(character: CharacterRow): EffectiveStats {
  const bonuses = db
    .prepare(
      `SELECT COALESCE(SUM(i.strength_bonus), 0) as strength_bonus,
              COALESCE(SUM(i.dexterity_bonus), 0) as dexterity_bonus,
              COALESCE(SUM(i.attack_power_bonus), 0) as attack_power_bonus,
              COALESCE(SUM(i.physical_defense_bonus), 0) as physical_defense_bonus,
              COALESCE(SUM(i.magic_defense_bonus), 0) as magic_defense_bonus
       FROM inventory_items inv
       JOIN items i ON i.id = inv.item_id
       WHERE inv.character_id = ? AND inv.equipped = 1`,
    )
    .get(character.id) as BonusRow;

  return {
    strength: character.strength + bonuses.strength_bonus,
    dexterity: character.dexterity + bonuses.dexterity_bonus,
    intelligence: character.intelligence,
    vitality: character.vitality,
    wisdom: character.wisdom,
    luck: character.luck,
    attackPower: bonuses.attack_power_bonus,
    physicalDefense: character.physical_defense + bonuses.physical_defense_bonus,
    magicDefense: character.magic_defense + bonuses.magic_defense_bonus,
    element: character.element,
  };
}
