import type { ElementType } from '@mud/shared';
import { db } from '../db/client.js';
import type { CharacterRow } from '../db/types.js';
import { getBuffStatBonus } from './combat/activeBuffs.js';

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

/**
 * 체력/지혜 1당 방어 보너스 계수. 상한을 두는 대신, 레벨이 오를수록 계수 자체가 줄어드는 방식으로
 * 완만하게 만든다 — 체력/지혜는 레벨마다 계속 늘어나는데 계수가 고정이면 방어력이 무한히 누적돼서
 * 결국 몹 공격력을 다 씹어먹게 된다. 레벨 1에서는 거의 0.5, 레벨 25에서 절반(0.25), 레벨 50에서
 * 1/3(0.167) 정도로 서서히 줄어든다.
 */
const DEFENSE_PER_POINT_BASE = 0.5;
const DEFENSE_COEFFICIENT_HALF_LIFE_LEVEL = 25;

function defensePerPointCoefficient(level: number): number {
  return DEFENSE_PER_POINT_BASE / (1 + level / DEFENSE_COEFFICIENT_HALF_LIFE_LEVEL);
}

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

  // 버프로 늘어난 체력/지혜도 방어력 환산식에 그대로 반영한다 — "체력이 오른다"는 버프 설명과
  // 실제 파생 방어력이 어긋나지 않게 하기 위함.
  const effectiveVitality = character.vitality + getBuffStatBonus(character.id, 'vitality');
  const effectiveWisdom = character.wisdom + getBuffStatBonus(character.id, 'wisdom');

  return {
    strength: character.strength + bonuses.strength_bonus + getBuffStatBonus(character.id, 'strength'),
    dexterity: character.dexterity + bonuses.dexterity_bonus + getBuffStatBonus(character.id, 'dexterity'),
    intelligence: character.intelligence + bonuses.intelligence_bonus + getBuffStatBonus(character.id, 'intelligence'),
    vitality: effectiveVitality,
    wisdom: effectiveWisdom,
    luck: character.luck + getBuffStatBonus(character.id, 'luck'),
    attackPower: bonuses.attack_power_bonus,
    physicalDefense:
      character.physical_defense +
      bonuses.physical_defense_bonus +
      Math.floor(effectiveVitality * defensePerPointCoefficient(character.level)) +
      getBuffStatBonus(character.id, 'physicalDefense'),
    magicDefense:
      character.magic_defense +
      bonuses.magic_defense_bonus +
      Math.floor(effectiveWisdom * defensePerPointCoefficient(character.level)) +
      getBuffStatBonus(character.id, 'magicDefense'),
    element: character.element,
  };
}
