import type { ItemRow, MobTemplateRow } from './types.js';

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
    strength: row.strength,
    dexterity: row.dexterity,
    physicalDefense: row.physical_defense,
    magicDefense: row.magic_defense,
    element: row.element,
    damageType: row.damage_type,
    expReward: row.exp_reward,
    goldReward: row.gold_reward,
    level: row.level,
    hostile: Boolean(row.hostile),
  };
}
