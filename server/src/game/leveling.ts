import { expThresholdForLevel, JOB_GROWTH_PER_LEVEL, SKILL_POINTS_PER_LEVEL, STAT_POINTS_PER_LEVEL } from '@mud/shared';
import { db } from '../db/client.js';
import type { CharacterRow } from '../db/types.js';

export function levelForExp(exp: number): number {
  let level = 1;
  while (expThresholdForLevel(level + 1) <= exp) level += 1;
  return level;
}

export function expToNextLevel(character: Pick<CharacterRow, 'level' | 'exp'>): number {
  return expThresholdForLevel(character.level + 1) - character.exp;
}

export interface LevelUpResult {
  levelsGained: number;
  newLevel: number;
  statPointsGained: number;
  skillPointsGained: number;
}

/**
 * exp가 이미 갱신된 캐릭터를 다시 읽어 레벨업 여부를 확인하고, 오른 만큼 직업 성장치를
 * 적용한다. job이 없는(미마이그레이션) 캐릭터는 레벨업을 적용하지 않는다.
 */
export function applyLevelUps(characterId: number): LevelUpResult | undefined {
  const character = db.prepare('SELECT * FROM characters WHERE id = ?').get(characterId) as
    | CharacterRow
    | undefined;
  if (!character || !character.job) return undefined;

  const targetLevel = levelForExp(character.exp);
  const levelsGained = targetLevel - character.level;
  if (levelsGained <= 0) return undefined;

  const growth = JOB_GROWTH_PER_LEVEL[character.job];
  const statPointsGained = STAT_POINTS_PER_LEVEL * levelsGained;
  const skillPointsGained = SKILL_POINTS_PER_LEVEL * levelsGained;
  const newMaxHp = character.max_hp + growth.hp * levelsGained;
  const newMaxMp = character.max_mp + growth.mp * levelsGained;

  db.prepare(
    `UPDATE characters SET
       level = ?,
       strength = strength + ?,
       dexterity = dexterity + ?,
       intelligence = intelligence + ?,
       vitality = vitality + ?,
       wisdom = wisdom + ?,
       luck = luck + ?,
       max_hp = ?,
       max_mp = ?,
       hp = ?,
       mp = ?,
       unallocated_stat_points = unallocated_stat_points + ?,
       unallocated_skill_points = unallocated_skill_points + ?
     WHERE id = ?`,
  ).run(
    targetLevel,
    growth.strength * levelsGained,
    growth.dexterity * levelsGained,
    growth.intelligence * levelsGained,
    growth.vitality * levelsGained,
    growth.wisdom * levelsGained,
    growth.luck * levelsGained,
    newMaxHp,
    newMaxMp,
    newMaxHp,
    newMaxMp,
    statPointsGained,
    skillPointsGained,
    character.id,
  );

  return { levelsGained, newLevel: targetLevel, statPointsGained, skillPointsGained };
}
