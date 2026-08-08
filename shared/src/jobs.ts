export type JobType = 'warrior' | 'rogue' | 'mage' | 'priest';

export const JOB_VALUES: JobType[] = ['warrior', 'rogue', 'mage', 'priest'];

export const JOB_LABELS: Record<JobType, string> = {
  warrior: '전사',
  rogue: '도적',
  mage: '마법사',
  priest: '사제',
};

export const JOB_DESCRIPTIONS: Record<JobType, string> = {
  warrior: '강인한 육체로 앞에서 적을 막아내는 근접 전투가.',
  rogue: '날렵한 몸놀림으로 적을 회피하고 급소를 노리는 전투가.',
  mage: '속성 마법으로 강력한 원거리 피해를 입히는 술사.',
  priest: '치유와 축복으로 동료를 돕는 지원가.',
};

export interface JobStatBlock {
  strength: number;
  dexterity: number;
  intelligence: number;
  vitality: number;
  wisdom: number;
  luck: number;
  hp: number;
  mp: number;
}

/** 직업별 캐릭터 생성 시 시작 스탯. */
export const JOB_BASE_STATS: Record<JobType, JobStatBlock> = {
  warrior: { strength: 7, dexterity: 3, intelligence: 1, vitality: 6, wisdom: 1, luck: 2, hp: 30, mp: 5 },
  rogue: { strength: 4, dexterity: 7, intelligence: 2, vitality: 3, wisdom: 2, luck: 4, hp: 22, mp: 8 },
  mage: { strength: 1, dexterity: 3, intelligence: 7, vitality: 2, wisdom: 5, luck: 2, hp: 16, mp: 20 },
  priest: { strength: 2, dexterity: 2, intelligence: 4, vitality: 4, wisdom: 7, luck: 1, hp: 20, mp: 18 },
};

/** 직업별 레벨업 1회당 자동 성장치. */
export const JOB_GROWTH_PER_LEVEL: Record<JobType, JobStatBlock> = {
  warrior: { strength: 3, dexterity: 1, intelligence: 0, vitality: 3, wisdom: 0, luck: 1, hp: 12, mp: 2 },
  rogue: { strength: 1, dexterity: 3, intelligence: 1, vitality: 1, wisdom: 1, luck: 2, hp: 8, mp: 4 },
  mage: { strength: 0, dexterity: 1, intelligence: 3, vitality: 1, wisdom: 2, luck: 1, hp: 6, mp: 8 },
  priest: { strength: 0, dexterity: 1, intelligence: 1, vitality: 2, wisdom: 3, luck: 1, hp: 8, mp: 7 },
};

/** 레벨업 시 자유 분배로 지급되는 스탯 포인트 수. */
export const STAT_POINTS_PER_LEVEL = 3;

/** 레벨업 시 지급되는 스킬 포인트 수. */
export const SKILL_POINTS_PER_LEVEL = 1;
