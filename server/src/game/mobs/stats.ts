import type { ElementType } from '@mud/shared';
import type { MobTemplateRow } from '../../db/types.js';
import type { DamageType } from './types.js';

function randomLevelInRange(minLevel: number, maxLevel: number): number {
  return minLevel + Math.floor(Math.random() * (maxLevel - minLevel + 1));
}

function interpolateStat(min: number, max: number, ratio: number): number {
  return Math.round(min + (max - min) * ratio);
}

export function isRanged(template: MobTemplateRow): boolean {
  return template.min_level < template.max_level;
}

interface RolledMobStats {
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
  level: number;
}

/**
 * 템플릿의 min_level~max_level(굴림 범위는 override로 더 좁힐 수 있다) 안에서 레벨을 굴리고,
 * 스탯은 항상 템플릿 자신의 min~max 구간을 기준으로 선형 보간한다 — override는 굴림 범위만
 * 좁힐 뿐, 스탯이 어느 지점까지 보간되는지의 기준(템플릿의 전체 범위)은 바꾸지 않는다.
 */
export function rollMobStats(template: MobTemplateRow, overrideMinLevel: number | null, overrideMaxLevel: number | null): RolledMobStats {
  const rollMin = overrideMinLevel ?? template.min_level;
  const rollMax = overrideMaxLevel ?? template.max_level;
  const level = randomLevelInRange(rollMin, rollMax);
  const span = template.max_level - template.min_level;
  const ratio = span === 0 ? 0 : (level - template.min_level) / span;
  return {
    name: template.name,
    hp: interpolateStat(template.hp, template.hp_max, ratio),
    strength: interpolateStat(template.strength, template.strength_max, ratio),
    dexterity: interpolateStat(template.dexterity, template.dexterity_max, ratio),
    physicalDefense: interpolateStat(template.physical_defense, template.physical_defense_max, ratio),
    magicDefense: interpolateStat(template.magic_defense, template.magic_defense_max, ratio),
    element: template.element,
    damageType: template.damage_type,
    expReward: interpolateStat(template.exp_reward, template.exp_reward_max, ratio),
    goldReward: interpolateStat(template.gold_reward, template.gold_reward_max, ratio),
    level,
  };
}

export function fixedMobStats(template: MobTemplateRow): RolledMobStats {
  return {
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
    level: template.min_level,
  };
}
