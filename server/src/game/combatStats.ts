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
  intelligence_bonus: number;
  physical_defense_bonus: number;
  magic_defense_bonus: number;
}

/** 체력 1당 물리방어, 지혜 1당 마법방어 보너스. 힘/지능은 이미 공격 쪽을 전담하므로 방어는 체력/지혜에 붙인다. */
const PHYSICAL_DEFENSE_PER_VITALITY = 0.5;
const MAGIC_DEFENSE_PER_WISDOM = 0.5;

export function getEffectiveStats(character: CharacterRow): EffectiveStats {
  const bonuses = db
    .prepare(
      `SELECT COALESCE(SUM(i.strength_bonus), 0) as strength_bonus,
              COALESCE(SUM(i.dexterity_bonus), 0) as dexterity_bonus,
              COALESCE(SUM(i.attack_power_bonus), 0) as attack_power_bonus,
              COALESCE(SUM(i.intelligence_bonus), 0) as intelligence_bonus,
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
    intelligence: character.intelligence + bonuses.intelligence_bonus,
    vitality: character.vitality,
    wisdom: character.wisdom,
    luck: character.luck,
    attackPower: bonuses.attack_power_bonus,
    physicalDefense:
      character.physical_defense +
      bonuses.physical_defense_bonus +
      Math.floor(character.vitality * PHYSICAL_DEFENSE_PER_VITALITY),
    magicDefense:
      character.magic_defense + bonuses.magic_defense_bonus + Math.floor(character.wisdom * MAGIC_DEFENSE_PER_WISDOM),
    element: character.element,
  };
}
