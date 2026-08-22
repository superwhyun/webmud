import { JOB_POWER_STAT, type JobType } from './jobs.js';

const PHYSICAL_JOBS = new Set<JobType>(['warrior', 'rogue']);
const DEFENSE_PER_POINT_BASE = 0.5;
const DEFENSE_COEFFICIENT_HALF_LIFE_LEVEL = 25;
const BASE_CRITICAL_CHANCE = 0.05;
const CRITICAL_CHANCE_PER_LUCK = 0.01;
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
