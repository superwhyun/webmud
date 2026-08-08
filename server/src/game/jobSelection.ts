import { JOB_BASE_STATS, JOB_VALUES, type JobType } from '@mud/shared';
import { db } from '../db/client.js';

export function isValidJob(value: string): value is JobType {
  return (JOB_VALUES as string[]).includes(value);
}

/**
 * job 컬럼이 도입되기 전에 생성된 캐릭터에 직업을 부여한다. 이미 쌓인 힘/민첩/HP 등
 * 기존 스탯은 그대로 두고, job 도입 이후 스탯(지능/체력/지혜/행운/MP)만 직업 기본값으로 채운다.
 */
export function assignJobToLegacyCharacter(characterId: number, job: JobType): void {
  const baseStats = JOB_BASE_STATS[job];
  db.prepare(
    `UPDATE characters SET
       job = ?,
       intelligence = ?,
       vitality = ?,
       wisdom = ?,
       luck = ?,
       mp = ?,
       max_mp = ?
     WHERE id = ? AND job IS NULL`,
  ).run(job, baseStats.intelligence, baseStats.vitality, baseStats.wisdom, baseStats.luck, baseStats.mp, baseStats.mp, characterId);
}
