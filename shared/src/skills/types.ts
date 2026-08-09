import type { JobType } from '../jobs.js';

export type SkillKind = 'damage' | 'heal' | 'passive';
export type SkillDamageType = 'physical' | 'magic';

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
  /** damage: 공격 스탯(힘/지능) 배율. heal: 고정 회복량. passive: 스탯 고정 증가량. */
  power: number;
  /** kind가 'damage'일 때 어떤 공격 스탯/방어 스탯을 사용할지 결정. */
  damageType?: SkillDamageType;
  /** kind가 'passive'일 때 어떤 스탯에 영구 적용할지. */
  passiveStat?: PassiveStat;
  /** damage/heal 스킬의 재사용 대기시간(ms). */
  cooldownMs?: number;
}
