import { JOB_POWER_STAT, type JobType } from './jobs.js';

const PHYSICAL_JOBS = new Set<JobType>(['warrior', 'rogue']);
const DEFENSE_PER_POINT_BASE = 0.5;
const DEFENSE_COEFFICIENT_HALF_LIFE_LEVEL = 25;
const BASE_CRITICAL_CHANCE = 0.05;
/** 상한(35%)까지 luck 100이 필요하도록 잡은 값 — 1당 1%였을 때는 luck 30이면 다 차서, 도적은
 * 성장치만으로 레벨 13이면 luck이 완전히 죽은 스탯이 되는 문제가 있었다. */
const CRITICAL_CHANCE_PER_LUCK = 0.003;
const MAX_CRITICAL_CHANCE = 0.35;
const REST_TICKS_TO_FULL = 30;
const BASE_MP_REGEN_RATIO = 1 / REST_TICKS_TO_FULL;
const MP_REGEN_PER_WISDOM = 0.002;

interface BasicAttackStats {
  strength: number;
  dexterity: number;
  intelligence: number;
  wisdom: number;
  attackPower: number;
}

export function basicAttackPower(job: JobType | null, stats: BasicAttackStats): number {
  return !job || PHYSICAL_JOBS.has(job) ? physicalAttackPower(job, stats) : magicAttackPower(job, stats);
}

export function physicalAttackPower(job: JobType | null, stats: BasicAttackStats): number {
  const powerStat = job ? JOB_POWER_STAT[job] : 'strength';
  return stats[powerStat] + stats.attackPower;
}

export function magicAttackPower(job: JobType | null, stats: BasicAttackStats): number {
  const powerStat = job ? JOB_POWER_STAT[job] : 'strength';
  return stats[powerStat];
}

/**
 * 능력치 탭처럼 직업과 무관하게 "물리 공격력"과 "마법 공격력"을 나란히 보여줄 때 쓰는 정보성 계산.
 * 위 physicalAttackPower/magicAttackPower는 그 직업이 실전투에서 실제로 쓰는 데미지 타입에서만
 * 호출된다는 전제로 JOB_POWER_STAT 하나만 쓰는데, 두 수치를 동시에 보여주려고 그대로 재사용하면
 * 예를 들어 마법사의 "물리 공격력"에 지능이 새어 들어간다(반대로 전사의 "마법 공격력"엔 힘이 샌다).
 * 물리는 그 직업의 진짜 물리 스탯(도적만 민첩, 나머지는 힘)을, 마법은 그 직업의 진짜 마법 스탯
 * (사제만 지혜, 나머지는 지능)을 쓰고, 그 직업이 원래 안 쓰는 쪽은 다른 직업의 파워스탯을 빌려오지
 * 않고 힘/지능을 기본값으로 보여준다.
 */
const PHYSICAL_FLAVOR_STAT: Record<JobType, 'strength' | 'dexterity'> = {
  warrior: 'strength',
  rogue: 'dexterity',
  mage: 'strength',
  priest: 'strength',
};

const MAGIC_FLAVOR_STAT: Record<JobType, 'intelligence' | 'wisdom'> = {
  warrior: 'intelligence',
  rogue: 'intelligence',
  mage: 'intelligence',
  priest: 'wisdom',
};

/** 물리 공격력 표시가 실제로 참조하는 스탯 필드 — 능력치 탭에서 그 스탯의 장비/버프 보너스를 찾을 때도 재사용한다. */
export function physicalFlavorStat(job: JobType | null): 'strength' | 'dexterity' {
  return job ? PHYSICAL_FLAVOR_STAT[job] : 'strength';
}

/** 마법 공격력 표시가 실제로 참조하는 스탯 필드 — 능력치 탭에서 그 스탯의 장비/버프 보너스를 찾을 때도 재사용한다. */
export function magicFlavorStat(job: JobType | null): 'intelligence' | 'wisdom' {
  return job ? MAGIC_FLAVOR_STAT[job] : 'intelligence';
}

export function displayPhysicalAttackPower(job: JobType | null, stats: BasicAttackStats): number {
  return stats[physicalFlavorStat(job)] + stats.attackPower;
}

export function displayMagicAttackPower(job: JobType | null, stats: BasicAttackStats): number {
  return stats[magicFlavorStat(job)];
}

export function criticalChanceForLuck(luck: number): number {
  return Math.min(MAX_CRITICAL_CHANCE, BASE_CRITICAL_CHANCE + luck * CRITICAL_CHANCE_PER_LUCK);
}

export function defenseBonusFromAttribute(attribute: number, level: number): number {
  const coefficient = DEFENSE_PER_POINT_BASE / (1 + level / DEFENSE_COEFFICIENT_HALF_LIFE_LEVEL);
  return Math.floor(attribute * coefficient);
}

export function restHpRecoveryPerTick(maxHp: number): number {
  return Math.max(1, Math.ceil(maxHp / REST_TICKS_TO_FULL));
}

export function restMpRecoveryPerTick(maxMp: number, wisdom: number): number {
  return Math.max(1, Math.round(maxMp * (BASE_MP_REGEN_RATIO + wisdom * MP_REGEN_PER_WISDOM)));
}
