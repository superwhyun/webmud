import type { ItemRow, MobTemplateRow, NpcTemplateRow } from './types.js';

export function toItemDto(row: ItemRow) {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    type: row.type,
    slot: row.slot,
    level: row.level,
    grade: row.grade,
    strengthBonus: row.strength_bonus,
    dexterityBonus: row.dexterity_bonus,
    attackPowerBonus: row.attack_power_bonus,
    intelligenceBonus: row.intelligence_bonus,
    physicalDefenseBonus: row.physical_defense_bonus,
    magicDefenseBonus: row.magic_defense_bonus,
    healAmount: row.heal_amount,
    manaAmount: row.mana_amount,
    value: row.value,
  };
}

export function toMobTemplateDto(row: MobTemplateRow) {
  return {
    id: row.id,
    name: row.name,
    hp: row.hp,
    hpMax: row.hp_max,
    strength: row.strength,
    strengthMax: row.strength_max,
    dexterity: row.dexterity,
    dexterityMax: row.dexterity_max,
    physicalDefense: row.physical_defense,
    physicalDefenseMax: row.physical_defense_max,
    magicDefense: row.magic_defense,
    magicDefenseMax: row.magic_defense_max,
    element: row.element,
    damageType: row.damage_type,
    expReward: row.exp_reward,
    expRewardMax: row.exp_reward_max,
    goldReward: row.gold_reward,
    goldRewardMax: row.gold_reward_max,
    minLevel: row.min_level,
    maxLevel: row.max_level,
    hostile: Boolean(row.hostile),
  };
}

export function toNpcTemplateDto(row: NpcTemplateRow) {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    type: row.type,
    dealType: row.deal_type,
  };
}
