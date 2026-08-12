import { ELEMENT_VALUES, type ElementType } from '../elements.js';
import type { JobType } from '../jobs.js';
import type { PassiveStat, SkillDamageType, SkillDefinition, SkillKind } from './types.js';

interface BranchTheme {
  tier1Name: string;
  tier1Description: string;
  tier2Name: string;
  tier2Description: string;
  passiveStat: PassiveStat;
}

interface BranchConfig {
  job: JobType;
  idPrefix: string;
  /** 1티어 공격형 스킬의 종류. 사제처럼 딜 스킬이 없는 직업은 'heal'을 쓴다. */
  tier1Kind: Extract<SkillKind, 'damage' | 'heal'>;
  damageType?: SkillDamageType;
  /** 트리 공통 구간의 마지막 스킬 id — 분기 1티어의 선행 조건이 된다. */
  trunkFinalSkillId: string;
  themes: Record<ElementType, BranchTheme>;
}

const BRANCH_TIER1_LEVEL = 28;
const BRANCH_TIER2_LEVEL = 40;

/**
 * 공통 트리(트렁크) 이후, 캐�릭터의 원소(오행)에 따라 갈라지는 2단계 분기 스킬 10개(원소 5 × 2단계)를 만든다.
 * 자기 원소가 아니면 배울 수 없다(element 필드로 걸러짐). 손으로 40개를 따로 쓰는 대신 이 생성기로 통일한다.
 */
export function buildElementBranches(config: BranchConfig): SkillDefinition[] {
  return ELEMENT_VALUES.flatMap((element) => {
    const theme = config.themes[element];
    const tier1Id = `${config.idPrefix}_${element}_t1`;
    const tier2Id = `${config.idPrefix}_${element}_t2`;

    const tier1: SkillDefinition =
      config.tier1Kind === 'heal'
        ? {
            id: tier1Id,
            job: config.job,
            name: theme.tier1Name,
            description: theme.tier1Description,
            requiredLevel: BRANCH_TIER1_LEVEL,
            kind: 'heal',
            mpCost: 24,
            power: 46,
            cooldownMs: 9000,
            element,
            requires: config.trunkFinalSkillId,
          }
        : {
            id: tier1Id,
            job: config.job,
            name: theme.tier1Name,
            description: theme.tier1Description,
            requiredLevel: BRANCH_TIER1_LEVEL,
            kind: 'damage',
            mpCost: 24,
            power: 3.6,
            damageType: config.damageType!,
            targeting: 'aoe',
            cooldownMs: 14000,
            element,
            requires: config.trunkFinalSkillId,
          };

    const tier2: SkillDefinition = {
      id: tier2Id,
      job: config.job,
      name: theme.tier2Name,
      description: theme.tier2Description,
      requiredLevel: BRANCH_TIER2_LEVEL,
      kind: 'passive',
      mpCost: 0,
      power: 20,
      passiveStat: theme.passiveStat,
      element,
      requires: tier1Id,
    };

    return [tier1, tier2];
  });
}
