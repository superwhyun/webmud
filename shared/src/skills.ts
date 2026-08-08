import { JOB_VALUES, type JobType } from './jobs.js';

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

export const SKILLS: SkillDefinition[] = [
  // 전사 — 근접 물리 딜/탱
  {
    id: 'warrior_power_strike',
    job: 'warrior',
    name: '강타',
    description: '힘을 실어 적을 강하게 내려칩니다. (물리 피해 1.6배)',
    requiredLevel: 1,
    kind: 'damage',
    mpCost: 4,
    power: 1.6,
    damageType: 'physical',
    cooldownMs: 4000,
  },
  {
    id: 'warrior_iron_skin',
    job: 'warrior',
    name: '강철 피부',
    description: '피부를 강철처럼 단련합니다. (물리방어 영구 +4)',
    requiredLevel: 3,
    kind: 'passive',
    mpCost: 0,
    power: 4,
    passiveStat: 'physicalDefense',
  },
  {
    id: 'warrior_fury_slash',
    job: 'warrior',
    name: '맹공',
    description: '분노에 휩싸여 적을 연속으로 베어냅니다. (물리 피해 2.2배)',
    requiredLevel: 5,
    kind: 'damage',
    mpCost: 8,
    power: 2.2,
    damageType: 'physical',
    cooldownMs: 8000,
  },
  {
    id: 'warrior_vigor',
    job: 'warrior',
    name: '불굴',
    description: '강인한 육체로 버텨냅니다. (최대 HP 영구 +15)',
    requiredLevel: 8,
    kind: 'passive',
    mpCost: 0,
    power: 15,
    passiveStat: 'maxHp',
  },

  // 도적 — 민첩 물리 딜
  {
    id: 'rogue_backstab',
    job: 'rogue',
    name: '급소 찌르기',
    description: '적의 급소를 정확히 노립니다. (물리 피해 1.8배)',
    requiredLevel: 1,
    kind: 'damage',
    mpCost: 5,
    power: 1.8,
    damageType: 'physical',
    cooldownMs: 3500,
  },
  {
    id: 'rogue_shadow_step',
    job: 'rogue',
    name: '그림자 걸음',
    description: '그림자처럼 가볍게 움직입니다. (민첩 영구 +3)',
    requiredLevel: 3,
    kind: 'passive',
    mpCost: 0,
    power: 3,
    passiveStat: 'dexterity',
  },
  {
    id: 'rogue_poison_strike',
    job: 'rogue',
    name: '맹독 일격',
    description: '맹독을 바른 무기로 적을 찌릅니다. (물리 피해 2.0배)',
    requiredLevel: 5,
    kind: 'damage',
    mpCost: 9,
    power: 2.0,
    damageType: 'physical',
    cooldownMs: 7000,
  },
  {
    id: 'rogue_deadly_precision',
    job: 'rogue',
    name: '백발백중',
    description: '치명적인 순간을 놓치지 않습니다. (행운 영구 +5)',
    requiredLevel: 8,
    kind: 'passive',
    mpCost: 0,
    power: 5,
    passiveStat: 'luck',
  },

  // 마법사 — 원거리 마법 딜
  {
    id: 'mage_firebolt',
    job: 'mage',
    name: '파이어볼',
    description: '불꽃 구체를 쏘아 보냅니다. (마법 피해 2.0배)',
    requiredLevel: 1,
    kind: 'damage',
    mpCost: 6,
    power: 2.0,
    damageType: 'magic',
    cooldownMs: 4000,
  },
  {
    id: 'mage_mana_flow',
    job: 'mage',
    name: '마나 순환',
    description: '마나 회로를 확장합니다. (최대 MP 영구 +10)',
    requiredLevel: 3,
    kind: 'passive',
    mpCost: 0,
    power: 10,
    passiveStat: 'maxMp',
  },
  {
    id: 'mage_ice_lance',
    job: 'mage',
    name: '얼음창',
    description: '얼음 창을 꿰뚫듯 발사합니다. (마법 피해 2.6배)',
    requiredLevel: 5,
    kind: 'damage',
    mpCost: 10,
    power: 2.6,
    damageType: 'magic',
    cooldownMs: 8000,
  },
  {
    id: 'mage_arcane_mastery',
    job: 'mage',
    name: '대마법',
    description: '마법 이해도가 극에 달합니다. (지능 영구 +8)',
    requiredLevel: 8,
    kind: 'passive',
    mpCost: 0,
    power: 8,
    passiveStat: 'intelligence',
  },

  // 사제 — 회복/지원
  {
    id: 'priest_heal',
    job: 'priest',
    name: '소생의 손길',
    description: '따뜻한 빛으로 상처를 치유합니다. (HP 12 회복)',
    requiredLevel: 1,
    kind: 'heal',
    mpCost: 6,
    power: 12,
    cooldownMs: 3000,
  },
  {
    id: 'priest_blessing',
    job: 'priest',
    name: '축복',
    description: '몸에 성스러운 가호를 두릅니다. (마법방어 영구 +5)',
    requiredLevel: 3,
    kind: 'passive',
    mpCost: 0,
    power: 5,
    passiveStat: 'magicDefense',
  },
  {
    id: 'priest_greater_heal',
    job: 'priest',
    name: '신성한 빛',
    description: '강한 빛으로 큰 상처를 치유합니다. (HP 25 회복)',
    requiredLevel: 5,
    kind: 'heal',
    mpCost: 12,
    power: 25,
    cooldownMs: 6000,
  },
  {
    id: 'priest_endurance',
    job: 'priest',
    name: '인내',
    description: '고통을 견디는 법을 체득합니다. (최대 HP 영구 +10)',
    requiredLevel: 8,
    kind: 'passive',
    mpCost: 0,
    power: 10,
    passiveStat: 'maxHp',
  },
];

export const SKILLS_BY_JOB: Record<JobType, SkillDefinition[]> = Object.fromEntries(
  JOB_VALUES.map((job) => [job, SKILLS.filter((skill) => skill.job === job)]),
) as Record<JobType, SkillDefinition[]>;

export function getSkillById(id: string): SkillDefinition | undefined {
  return SKILLS.find((skill) => skill.id === id);
}
