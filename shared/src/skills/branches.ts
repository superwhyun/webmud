import { ELEMENT_VALUES, type ElementType } from '../elements.js';
import type { JobType } from '../jobs.js';
import type { PassiveStat, SkillDamageType, SkillDefinition, SkillKind } from './types.js';

interface ActiveTierTheme {
  name: string;
  description: string;
  /** 이 티어만 aoe로 두면(예: 1/3티어) 특성화 안에서도 단일/광역을 섞어 쓸 수 있다. 생략하면 single. */
  aoe?: boolean;
}

interface PassiveTierTheme {
  name: string;
  description: string;
  passiveStat: PassiveStat;
}

interface BranchTheme {
  /** 특성화는 액티브 위주로: 3개 액티브(단일/광역 섞임) + 마지막 1개 패시브 마무리. */
  actives: [ActiveTierTheme, ActiveTierTheme, ActiveTierTheme];
  capstone: PassiveTierTheme;
}

interface BranchConfig {
  job: JobType;
  idPrefix: string;
  /** 액티브 티어의 종류. 사제처럼 딜 스킬이 없는 직업은 'heal'을 쓴다. */
  activeKind: Extract<SkillKind, 'damage' | 'heal'>;
  damageType?: SkillDamageType;
  themes: Record<ElementType, BranchTheme>;
}

const BRANCH_TIER_LEVELS = [5, 15, 25, 35];

/**
 * 공통 트리(트렁크)와는 별개로, 캐릭터의 원소(오행)에 따라 갈라지는 4단계 분기 스킬(원소 5 × 4단계 = 20개)을
 * 만든다. 트렁크 완료를 요구하지 않고 레벨 조건만으로 독립적으로 진행된다. 앞 3단계는 액티브(공격/회복),
 * 마지막 1단계는 패시브로 마무리한다. 자기 원소가 아니면 배울 수 없다(element 필드로 걸러짐). 손으로 다
 * 쓰는 대신 이 생성기로 통일한다.
 */
export function buildElementBranches(config: BranchConfig): SkillDefinition[] {
  return ELEMENT_VALUES.flatMap((element) => {
    const theme = config.themes[element];
    const tierIds = [0, 1, 2, 3].map((i) => `${config.idPrefix}_${element}_t${i + 1}`);

    const activeSkills: SkillDefinition[] = theme.actives.map((tier, i) => {
      const requires = i === 0 ? undefined : tierIds[i - 1];
      const power = 2.0 + i * 0.7;
      const base =
        config.activeKind === 'heal'
          ? { kind: 'heal' as const, power: 24 + i * 16 }
          : {
              kind: 'damage' as const,
              power,
              damageType: config.damageType!,
              targeting: tier.aoe ? ('aoe' as const) : ('single' as const),
            };
      return {
        id: tierIds[i],
        job: config.job,
        name: tier.name,
        description: tier.description,
        requiredLevel: BRANCH_TIER_LEVELS[i],
        mpCost: 12 + i * 6,
        cooldownMs: 10000 + i * 3000,
        element,
        requires,
        ...base,
      };
    });

    const capstone: SkillDefinition = {
      id: tierIds[3],
      job: config.job,
      name: theme.capstone.name,
      description: theme.capstone.description,
      requiredLevel: BRANCH_TIER_LEVELS[3],
      kind: 'passive',
      mpCost: 0,
      power: 16,
      passiveStat: theme.capstone.passiveStat,
      element,
      requires: tierIds[2],
    };

    return [...activeSkills, capstone];
  });
}
