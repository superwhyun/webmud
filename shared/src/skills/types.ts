import type { ElementType } from '../elements.js';
import type { JobType } from '../jobs.js';

export type SkillKind = 'damage' | 'heal' | 'passive';
export type SkillDamageType = 'physical' | 'magic';
export type SkillTargeting = 'single' | 'aoe';

export type PassiveStat =
  | 'maxHp'
  | 'maxMp'
  | 'physicalDefense'
  | 'magicDefense'
  | 'strength'
  | 'dexterity'
  | 'intelligence'
  | 'vitality'
  | 'wisdom'
  | 'luck';

export interface SkillDefinition {
  id: string;
  job: JobType;
  name: string;
  description: string;
  requiredLevel: number;
  kind: SkillKind;
  /** damage/heal 스킬에 필요한 MP. passive 스킬은 습득 즉시 적용되며 MP를 소모하지 않는다. */
  mpCost: number;
  /** damage: 공격 스탯(힘/지능) 배율. heal: 고정 회복량. passive: 스탯 고정 증가량. 랭크가 오르면 effectiveSkillPower()로 계산한 값이 실제 적용된다. */
  power: number;
  /** kind가 'damage'일 때 어떤 공격 스탯/방어 스탯을 사용할지 결정. */
  damageType?: SkillDamageType;
  /** kind가 'damage'일 때 단일 대상(single, 기본값)인지 전투 중인 몹 전체(aoe)인지. aoe는 대상별 위력에 AOE_TARGET_PENALTY가 곱해진다. */
  targeting?: SkillTargeting;
  /** kind가 'passive'일 때 어떤 스탯에 영구 적용할지. */
  passiveStat?: PassiveStat;
  /**
   * true면 이 패시브는 스탯을 올리는 대신, 배운 사람의 모든 스킬 쿨타임을 랭크에 비례해 퍼센트로
   * 깎아준다(effectiveSkillPower를 %로 해석). passiveStat과는 별개 경로 — 캐릭터 DB 컬럼에 쌓이는
   * 값이 아니라 시전 시점에 랭크를 조회해서 계산한다.
   */
  reducesCooldown?: boolean;
  /** damage/heal 스킬의 재사용 대기시간(ms). */
  cooldownMs?: number;
  /** 이 스킬을 배우기 전에 먼저 배워야 하는 스킬 id. 트리의 선행 조건. */
  requires?: string;
  /** 지정되어 있으면 그 원소를 가진 캐릭터만 배울 수 있는 분기 스킬. 없으면 원소 상관없이 배우는 공통 스킬. */
  element?: ElementType;
}

/** 모든 스킬의 공통 최대 랭크. 랭크는 스킬 포인트로 강화하며, 개별 스킬마다 다른 값을 주지 않고 이 상수 하나로 통일한다. */
export const SKILL_MAX_RANK = 20;

/** 랭크 1당 늘어나는 위력 비율. 랭크 20이면 기본값의 (1 + 19*0.05) = 1.95배가 된다. */
export const SKILL_RANK_POWER_STEP = 0.05;

/** 광역(aoe) 스킬이 대상 1명에게 주는 위력은 단일 대상 스킬의 이 비율만큼 깎인다. */
export const AOE_TARGET_PENALTY = 0.6;

/** 스킬의 랭크를 반영한 실제 위력. damage/heal의 배율·고정량, passive의 스탯 증가량 모두 이 함수로 계산한다. */
export function effectiveSkillPower(skill: Pick<SkillDefinition, 'power'>, rank: number): number {
  return skill.power * (1 + (Math.max(1, rank) - 1) * SKILL_RANK_POWER_STEP);
}

/**
 * 패시브 스킬이 지정한 랭크에서 캐릭터 스탯에 실제로 적용되어 있어야 할 총 증가량(반올림).
 * rank 0(미습득)은 0. 랭크가 오를 때 늘어야 하는 값(passiveRankDelta)도, 리셋할 때 되돌려야
 * 하는 값도 전부 이 함수 하나로 계산해서, 매 단계 반올림을 따로 하지 않고 항상 이 총량 기준으로
 * 맞춘다 — 그래야 힘/방어처럼 base power가 작은 스탯도(랭크당 증가분이 1 미만이라도) 누적되면서
 * 반올림 손실 없이 정확히 적용/상쇄된다.
 */
export function totalPassiveBonus(skill: Pick<SkillDefinition, 'power'>, rank: number): number {
  if (rank <= 0) return 0;
  return Math.round(effectiveSkillPower(skill, rank));
}

/** 패시브 스킬을 rank-1에서 rank로 올릴 때 스탯에 추가로 더해야 하는 양(델타). */
export function passiveRankDelta(skill: Pick<SkillDefinition, 'power'>, rank: number): number {
  return totalPassiveBonus(skill, rank) - totalPassiveBonus(skill, rank - 1);
}
