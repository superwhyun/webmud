import { describe, expect, it } from 'vitest';
import { toMobTemplateDto } from '../db/dto.js';
import type { MobTemplateRow } from '../db/types.js';
import { mobTemplateSchema } from './mobs.js';

const baseTemplate = {
  name: '테스트 보스',
  hp: 100,
  hpMax: 500,
  strength: 10,
  strengthMax: 50,
  dexterity: 5,
  dexterityMax: 25,
  physicalDefense: 3,
  physicalDefenseMax: 15,
  magicDefense: 2,
  magicDefenseMax: 10,
  element: 'fire',
  damageType: 'physical',
  expReward: 100,
  expRewardMax: 500,
  goldReward: 10,
  goldRewardMax: 50,
  minLevel: 1,
  maxLevel: 50,
  hostile: true,
  isBoss: true,
} as const;

describe('boss mob template contract', () => {
  it('accepts and preserves the boss flag in admin input', () => {
    expect(mobTemplateSchema.parse(baseTemplate)).toMatchObject({ isBoss: true });
  });

  it('exposes the stored boss flag in DTOs', () => {
    const row = {
      id: 999_901,
      name: baseTemplate.name,
      hp: baseTemplate.hp,
      hp_max: baseTemplate.hpMax,
      strength: baseTemplate.strength,
      strength_max: baseTemplate.strengthMax,
      dexterity: baseTemplate.dexterity,
      dexterity_max: baseTemplate.dexterityMax,
      physical_defense: baseTemplate.physicalDefense,
      physical_defense_max: baseTemplate.physicalDefenseMax,
      magic_defense: baseTemplate.magicDefense,
      magic_defense_max: baseTemplate.magicDefenseMax,
      element: baseTemplate.element,
      damage_type: baseTemplate.damageType,
      exp_reward: baseTemplate.expReward,
      exp_reward_max: baseTemplate.expRewardMax,
      gold_reward: baseTemplate.goldReward,
      gold_reward_max: baseTemplate.goldRewardMax,
      min_level: baseTemplate.minLevel,
      max_level: baseTemplate.maxLevel,
      hostile: 1,
      is_boss: 1,
    } as MobTemplateRow & { is_boss: number };

    expect(toMobTemplateDto(row)).toMatchObject({ id: row.id, isBoss: true });
  });
});
